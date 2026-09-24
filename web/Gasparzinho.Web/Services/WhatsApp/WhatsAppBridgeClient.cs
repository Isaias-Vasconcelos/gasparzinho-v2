using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Gasparzinho.Web.Services.WhatsApp;

public record BridgeGroup(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("participants")] int Participants);

public record BridgeMember(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("phone")] string Phone,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("isAdmin")] bool IsAdmin);

/// <summary>
/// Estado ao vivo de uma conexão na bridge. <paramref name="QrExpiresInMs"/> é
/// o que sobra do código atual: zero significa que ele já venceu e o próximo
/// está a caminho.
/// </summary>
public record BridgeStatus(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("phone")] string? Phone,
    [property: JsonPropertyName("displayName")] string? DisplayName,
    [property: JsonPropertyName("qrCode")] string? QrCode,
    [property: JsonPropertyName("qrExpiresInMs")] int QrExpiresInMs = 0);

public class BridgeException(string message, Exception? inner = null)
    : Exception(message, inner);

/// <summary>
/// Fala com o microserviço Node que hospeda o Baileys. Toda operação que toca
/// o protocolo do WhatsApp (conectar, banir, fechar grupo, baixar mídia)
/// acontece lá; aqui só orquestramos.
/// </summary>
public class WhatsAppBridgeClient(
    IHttpClientFactory httpFactory,
    ILogger<WhatsAppBridgeClient> logger)
{
    private HttpClient Client => httpFactory.CreateClient("bridge");

    public Task<BridgeStatus> ConnectAsync(string sessionId, CancellationToken ct = default) =>
        PostAsync<BridgeStatus>($"sessions/{sessionId}/connect", null, ct);

    public Task DisconnectAsync(string sessionId, CancellationToken ct = default) =>
        PostAsync($"sessions/{sessionId}/disconnect", null, ct);

    public Task<BridgeStatus> GetStatusAsync(string sessionId, CancellationToken ct = default) =>
        GetAsync<BridgeStatus>($"sessions/{sessionId}/status", ct);

    public Task<List<BridgeGroup>> GetGroupsAsync(string sessionId, CancellationToken ct = default) =>
        GetAsync<List<BridgeGroup>>($"sessions/{sessionId}/groups", ct);

    public Task<List<BridgeMember>> GetMembersAsync(
        string sessionId, string groupId, CancellationToken ct = default) =>
        GetAsync<List<BridgeMember>>(
            $"sessions/{sessionId}/groups/{Uri.EscapeDataString(groupId)}/members", ct);

    /// <summary>Remove o participante do grupo.</summary>
    public Task RemoveMemberAsync(
        string sessionId, string groupId, string jid, CancellationToken ct = default) =>
        PostAsync(
            $"sessions/{sessionId}/groups/{Uri.EscapeDataString(groupId)}/remove",
            new { jid }, ct);

    /// <summary>Promove ou rebaixa um participante. action: promote | demote.</summary>
    public Task UpdateRoleAsync(
        string sessionId, string groupId, string jid, string action,
        CancellationToken ct = default) =>
        PostAsync(
            $"sessions/{sessionId}/groups/{Uri.EscapeDataString(groupId)}/role",
            new { jid, action }, ct);

    public Task SendTextAsync(
        string sessionId, string chatId, string text, string[]? mentions = null,
        CancellationToken ct = default) =>
        PostAsync(
            $"sessions/{sessionId}/send",
            new { chatId, text, mentions = mentions ?? [] }, ct);

    /// <summary>Apaga uma mensagem do grupo (delete for everyone).</summary>
    public Task DeleteMessageAsync(
        string sessionId, string groupId, string messageId, string participantJid,
        CancellationToken ct = default) =>
        PostAsync(
            $"sessions/{sessionId}/groups/{Uri.EscapeDataString(groupId)}/delete-message",
            new { messageId, participantJid }, ct);

    /// <summary>Fecha o grupo (só admins falam). durationMinutes = 0 → sem reabertura automática.</summary>
    public Task CloseGroupAsync(
        string sessionId, string groupId, string? reason, int durationMinutes = 0,
        CancellationToken ct = default) =>
        PostAsync(
            $"sessions/{sessionId}/groups/{Uri.EscapeDataString(groupId)}/close",
            new { reason, durationMinutes }, ct);

    public Task OpenGroupAsync(
        string sessionId, string groupId, CancellationToken ct = default) =>
        PostAsync(
            $"sessions/{sessionId}/groups/{Uri.EscapeDataString(groupId)}/open", null, ct);

    /// <summary>Baixa a mídia de uma mensagem para análise visual.</summary>
    public async Task<(byte[] Data, string MimeType)?> DownloadMediaAsync(
        string sessionId, string messageId, CancellationToken ct = default)
    {
        try
        {
            using var response = await Client.GetAsync(
                $"sessions/{sessionId}/media/{Uri.EscapeDataString(messageId)}", ct);

            if (!response.IsSuccessStatusCode) return null;

            var data = await response.Content.ReadAsByteArrayAsync(ct);
            if (data.Length == 0) return null;

            var mime = response.Content.Headers.ContentType?.MediaType ?? "image/jpeg";
            return (data, mime);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Falha ao baixar mídia {MessageId}: {Message}", messageId, ex.Message);
            return null;
        }
    }

    // ── Infra ───────────────────────────────────────────────────────────────

    private async Task<T> GetAsync<T>(string path, CancellationToken ct)
    {
        try
        {
            var result = await Client.GetFromJsonAsync<T>(path, ct);
            return result ?? throw new BridgeException($"Bridge devolveu vazio em {path}");
        }
        // Cancelamento (timeout do chamador ou navegador que desistiu) não é
        // falha da bridge e não deve virar erro de serviço indisponível.
        catch (Exception ex) when (ex is not BridgeException and not OperationCanceledException)
        {
            throw Wrap(path, ex);
        }
    }

    private async Task<T> PostAsync<T>(string path, object? body, CancellationToken ct)
    {
        var response = await PostRawAsync(path, body, ct);
        var result = await response.Content.ReadFromJsonAsync<T>(ct);
        return result ?? throw new BridgeException($"Bridge devolveu vazio em {path}");
    }

    private async Task PostAsync(string path, object? body, CancellationToken ct) =>
        (await PostRawAsync(path, body, ct)).Dispose();

    private async Task<HttpResponseMessage> PostRawAsync(
        string path, object? body, CancellationToken ct)
    {
        try
        {
            var response = await Client.PostAsJsonAsync(path, body ?? new { }, ct);
            if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync(ct);
                response.Dispose();
                throw new BridgeException(
                    $"Bridge retornou {(int)response.StatusCode} em {path}: {detail}");
            }
            return response;
        }
        // Cancelamento (timeout do chamador ou navegador que desistiu) não é
        // falha da bridge e não deve virar erro de serviço indisponível.
        catch (Exception ex) when (ex is not BridgeException and not OperationCanceledException)
        {
            throw Wrap(path, ex);
        }
    }

    private BridgeException Wrap(string path, Exception ex)
    {
        logger.LogError(ex, "Falha ao chamar a bridge em {Path}", path);
        return new BridgeException(
            "Serviço do WhatsApp indisponível. Verifique se a bridge está no ar.", ex);
    }
}

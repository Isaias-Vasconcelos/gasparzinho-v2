using System.Text.Json;
using System.Text.RegularExpressions;
using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Gasparzinho.Web.Services.Ai;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Services.Moderation;

/// <summary>Resultado de uma checagem de conteúdo.</summary>
/// <param name="Blocked">Verdadeiro quando o conteúdo deve ser barrado.</param>
/// <param name="Source">lista | ia | nenhum</param>
/// <param name="Detail">Palavra encontrada ou resposta da IA — para log e auditoria.</param>
public record ModerationVerdict(bool Blocked, string Source, string? Detail)
{
    public static readonly ModerationVerdict Allowed = new(false, "nenhum", null);
}

public partial class ModerationService(
    AppDbContext db,
    AiConfigResolver resolver,
    AiClient ai,
    ILogger<ModerationService> logger)
{
    private const int MaxInputChars = 2000;

    // ── Texto: palavras de baixo calão ──────────────────────────────────────

    /// <summary>
    /// Checa a mensagem contra a lista literal do cliente e, se nada casar,
    /// contra a IA usando o prompt e o token que o cliente informou.
    /// </summary>
    public async Task<ModerationVerdict> CheckTextAsync(
        string tenantId, string? text, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(text)) return ModerationVerdict.Allowed;

        // 1. Lista literal — barata, roda sempre primeiro.
        var words = await db.ProfanityWords
            .AsNoTracking()
            .Where(w => w.TenantId == tenantId)
            .Select(w => w.Word)
            .ToListAsync(ct);

        // Compara sem acento e sem caixa: a lista guarda uma única forma da
        // palavra (o índice do banco não distingue "cu" de "cú"), então a
        // mensagem precisa ser reduzida à mesma chave para não escapar nada.
        var haystack = ProfanityText.Key(text);
        var hit = words.FirstOrDefault(w =>
            !string.IsNullOrWhiteSpace(w) && haystack.Contains(ProfanityText.Key(w)));

        if (hit is not null)
        {
            logger.LogInformation("[palavrão] lista: encontrada \"{Word}\"", hit);
            return new ModerationVerdict(true, "lista", hit);
        }

        // 2. IA com o prompt do cliente.
        var settings = await resolver.ResolveModerationAsync(tenantId, ct);
        if (settings is null) return ModerationVerdict.Allowed;

        try
        {
            var reply = await ai.AskTextAsync(
                settings.Credentials,
                settings.ProfanityPrompt,
                Truncate(text),
                ct: ct);

            var blocked = IsAffirmative(reply);
            logger.LogInformation(
                "[palavrão] IA ({Provider}/{Model}) respondeu \"{Reply}\" → {Result}",
                settings.Credentials.Provider, settings.Credentials.Model, reply,
                blocked ? "BLOQUEAR" : "liberar");

            return blocked
                ? new ModerationVerdict(true, "ia", reply)
                : ModerationVerdict.Allowed;
        }
        catch (AiProviderException ex)
        {
            // Falha de IA nunca pune por engano: libera e registra.
            logger.LogWarning("[palavrão] IA falhou: {Message}", ex.Message);
            if (ex.IsQuota)
                await resolver.MarkQuotaExhaustedAsync(tenantId, settings.Credentials.Origin, ct);
            return ModerationVerdict.Allowed;
        }
    }

    // ── Imagem: conteúdo ilícito ────────────────────────────────────────────

    /// <summary>Analisa uma imagem (ou frame de vídeo) com o prompt visual do cliente.</summary>
    public async Task<ModerationVerdict> CheckImageAsync(
        string tenantId, byte[] image, string mimeType, CancellationToken ct = default)
    {
        if (image.Length == 0) return ModerationVerdict.Allowed;

        var settings = await resolver.ResolveModerationAsync(tenantId, ct);
        if (settings is null) return ModerationVerdict.Allowed;

        try
        {
            var reply = await ai.AskImageAsync(
                settings.Credentials, settings.NsfwPrompt, image, mimeType, ct: ct);

            var blocked = IsAffirmative(reply);
            logger.LogInformation(
                "[imagem] IA ({Provider}/{Model}) respondeu \"{Reply}\" → {Result}",
                settings.Credentials.Provider, settings.Credentials.Model, reply,
                blocked ? "BLOQUEAR" : "liberar");

            return blocked
                ? new ModerationVerdict(true, "ia", reply)
                : ModerationVerdict.Allowed;
        }
        catch (AiProviderException ex)
        {
            logger.LogWarning("[imagem] IA falhou: {Message}", ex.Message);
            if (ex.IsQuota)
                await resolver.MarkQuotaExhaustedAsync(tenantId, settings.Credentials.Origin, ct);
            return ModerationVerdict.Allowed;
        }
    }

    // ── Links ───────────────────────────────────────────────────────────────

    public static bool ContainsLink(string? text) =>
        !string.IsNullOrWhiteSpace(text) && LinkRegex().IsMatch(text);

    [GeneratedRegex(@"(https?://|www\.)\S+|(\S+\.(com|net|org|io|br|co)\b)",
        RegexOptions.IgnoreCase)]
    private static partial Regex LinkRegex();

    // ── Moderação sugestiva (propõe ação para revisão humana) ───────────────

    /// <summary>Pede à IA uma ação proposta e grava como sugestão pendente.</summary>
    public async Task<ModerationSuggestion?> ProposeAsync(
        SuggestionRequest request, CancellationToken ct = default)
    {
        var settings = await resolver.ResolveModerationAsync(request.TenantId, ct);
        if (settings is null) return null;

        var userMessage = BuildSuggestionMessage(request);

        try
        {
            var raw = await ai.AskTextAsync(
                settings.Credentials, AiPrompts.SuggestiveModeration, userMessage,
                maxTokens: 2048, ct: ct);

            var parsed = ParseSuggestion(raw);

            var suggestion = new ModerationSuggestion
            {
                TenantId = request.TenantId,
                SessionId = request.SessionId,
                GroupId = request.GroupId,
                GroupName = request.GroupName,
                MessageId = request.MessageId,
                SenderJid = request.SenderJid,
                SenderPhone = request.SenderJid?.Split('@').FirstOrDefault(),
                MessageText = request.MessageText,
                DetectedReason = request.DetectedReason,
                SuggestedAction = parsed.Action,
                ReplyTemplate = parsed.ReplyTemplate,
                AiReason = parsed.Reason,
                Confidence = parsed.Confidence,
                PromptUsed = AiPrompts.SuggestiveModeration,
                Status = "pending",
            };

            db.ModerationSuggestions.Add(suggestion);
            await db.SaveChangesAsync(ct);
            return suggestion;
        }
        catch (AiProviderException ex)
        {
            logger.LogWarning("[sugestão] IA falhou: {Message}", ex.Message);
            if (ex.IsQuota)
                await resolver.MarkQuotaExhaustedAsync(
                    request.TenantId, settings.Credentials.Origin, ct);
            return null;
        }
    }

    private static string BuildSuggestionMessage(SuggestionRequest r)
    {
        var parts = new List<string> { $"Idioma do grupo: {r.Language}" };
        if (!string.IsNullOrWhiteSpace(r.GroupName)) parts.Add($"Grupo: {r.GroupName}");
        if (!string.IsNullOrWhiteSpace(r.DetectedReason))
            parts.Add($"Motivo detectado pelo filtro: {r.DetectedReason}");
        parts.Add($"Violações anteriores do usuário: {r.PriorViolations}");
        parts.Add($"MENSAGEM:\n{Truncate(Anonymize(r.MessageText))}");
        return string.Join('\n', parts);
    }

    private static readonly HashSet<string> AllowedActions =
        ["warn", "delete", "reply", "flag", "none"];

    /// <summary>Extrai o JSON da resposta, tolerando texto ou markdown ao redor.</summary>
    internal static ParsedSuggestion ParseSuggestion(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return new ParsedSuggestion("flag", null, null, null);

        var match = JsonObjectRegex().Match(raw);
        if (!match.Success)
            return new ParsedSuggestion("flag", null, null, null);

        try
        {
            using var doc = JsonDocument.Parse(match.Value);
            var root = doc.RootElement;

            var action = root.TryGetProperty("action", out var a) ? a.GetString() : null;
            if (action is null || !AllowedActions.Contains(action)) action = "flag";

            var reason = root.TryGetProperty("reason", out var r) ? r.GetString() : null;
            if (reason?.Length > 500) reason = reason[..500];

            float? confidence = null;
            if (root.TryGetProperty("confidence", out var c) &&
                c.ValueKind == JsonValueKind.Number &&
                c.TryGetSingle(out var cf))
                confidence = Math.Clamp(cf, 0f, 1f);

            string? template = null;
            if (action == "reply" &&
                root.TryGetProperty("reply_template", out var t))
            {
                template = t.GetString();
                if (template?.Length > 1000) template = template[..1000];
            }

            return new ParsedSuggestion(action, reason, confidence, template);
        }
        catch (JsonException)
        {
            return new ParsedSuggestion("flag", null, null, null);
        }
    }

    [GeneratedRegex(@"\{[\s\S]*\}")]
    private static partial Regex JsonObjectRegex();

    // ── Utilitários ─────────────────────────────────────────────────────────

    /// <summary>Reconhece SIM/YES no início da resposta, ignorando pontuação.</summary>
    internal static bool IsAffirmative(string? reply)
    {
        if (string.IsNullOrWhiteSpace(reply)) return false;
        var cleaned = reply.Trim().TrimStart('"', '\'', '*', '`', ' ');
        return cleaned.StartsWith("sim", StringComparison.OrdinalIgnoreCase)
            || cleaned.StartsWith("yes", StringComparison.OrdinalIgnoreCase);
    }

    internal static string Truncate(string? text, int max = MaxInputChars)
    {
        if (string.IsNullOrEmpty(text)) return "";
        return text.Length > max ? text[..max] + "…(truncado)" : text;
    }

    /// <summary>Remove dados pessoais antes de enviar a mensagem ao provedor.</summary>
    internal static string Anonymize(string? text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var output = JidRegex().Replace(text, "<usuario>");
        output = PhoneRegex().Replace(output, "<telefone>");
        output = EmailRegex().Replace(output, "<email>");
        return output;
    }

    [GeneratedRegex(@"\d{8,15}@(?:s\.whatsapp\.net|g\.us|lid)", RegexOptions.IgnoreCase)]
    private static partial Regex JidRegex();

    [GeneratedRegex(@"\+?\d{1,3}\s?\(?\d{2,3}\)?[\s-]?\d{4,5}[\s-]?\d{4}")]
    private static partial Regex PhoneRegex();

    [GeneratedRegex(@"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")]
    private static partial Regex EmailRegex();
}

internal record ParsedSuggestion(
    string Action, string? Reason, float? Confidence, string? ReplyTemplate);

/// <summary>Dados de entrada para gerar uma sugestão de moderação.</summary>
public record SuggestionRequest
{
    public required string TenantId { get; init; }
    public required string SessionId { get; init; }
    public required string GroupId { get; init; }
    public string? GroupName { get; init; }
    public string? MessageId { get; init; }
    public string? SenderJid { get; init; }
    public string? MessageText { get; init; }
    public string? DetectedReason { get; init; }
    public int PriorViolations { get; init; }
    public string Language { get; init; } = "pt-BR";
}

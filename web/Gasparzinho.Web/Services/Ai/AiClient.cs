using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

namespace Gasparzinho.Web.Services.Ai;

/// <summary>Falha vinda do provedor de IA, já classificada.</summary>
public class AiProviderException(string message, bool isQuota, Exception? inner = null)
    : Exception(message, inner)
{
    /// <summary>Cota/crédito esgotado ou rate limit — não é erro de configuração.</summary>
    public bool IsQuota { get; } = isQuota;
}

/// <summary>
/// Chama Claude, GPT ou Gemini com a credencial que o cliente informou.
/// Claude usa o SDK oficial da Anthropic; os outros dois, HTTP direto.
/// </summary>
public class AiClient(IHttpClientFactory httpFactory, ILogger<AiClient> logger)
{
    /// <summary>Classificação de texto. Resposta curta, esperada em SIM/NÃO.</summary>
    public Task<string> AskTextAsync(
        AiCredentials creds, string systemPrompt, string userText,
        int maxTokens = 1024, CancellationToken ct = default)
        => creds.Provider switch
        {
            AiProviders.Claude => ClaudeTextAsync(creds, systemPrompt, userText, maxTokens, ct),
            AiProviders.OpenAi => OpenAiAsync(creds, systemPrompt, userText, null, null, maxTokens, ct),
            AiProviders.Gemini => GeminiAsync(creds, systemPrompt, userText, null, null, maxTokens, ct),
            _ => throw new AiProviderException($"Provedor desconhecido: {creds.Provider}", false),
        };

    /// <summary>Análise de imagem (moderação visual).</summary>
    public Task<string> AskImageAsync(
        AiCredentials creds, string systemPrompt, byte[] image, string mimeType,
        int maxTokens = 1024, CancellationToken ct = default)
    {
        var b64 = Convert.ToBase64String(image);
        const string instruction = "Analise esta imagem.";
        return creds.Provider switch
        {
            AiProviders.Claude => ClaudeImageAsync(creds, systemPrompt, b64, mimeType, maxTokens, ct),
            AiProviders.OpenAi => OpenAiAsync(creds, systemPrompt, instruction, b64, mimeType, maxTokens, ct),
            AiProviders.Gemini => GeminiAsync(creds, systemPrompt, instruction, b64, mimeType, maxTokens, ct),
            _ => throw new AiProviderException($"Provedor sem suporte a imagem: {creds.Provider}", false),
        };
    }

    // ── Claude (SDK oficial) ────────────────────────────────────────────────

    private async Task<string> ClaudeTextAsync(
        AiCredentials creds, string systemPrompt, string userText, int maxTokens, CancellationToken ct)
    {
        var client = new AnthropicClient { ApiKey = creds.ApiKey };
        try
        {
            var response = await client.Messages.Create(new MessageCreateParams
            {
                Model = creds.Model,
                MaxTokens = maxTokens,
                // Classificação objetiva: esforço baixo mantém custo e latência sob controle.
                OutputConfig = new OutputConfig { Effort = Effort.Low },
                System = systemPrompt,
                Messages = [new() { Role = Role.User, Content = userText }],
            }, cancellationToken: ct);

            return ExtractClaudeText(response);
        }
        catch (Exception ex) when (ex is not AiProviderException)
        {
            throw Wrap(ex);
        }
    }

    private async Task<string> ClaudeImageAsync(
        AiCredentials creds, string systemPrompt, string base64, string mimeType,
        int maxTokens, CancellationToken ct)
    {
        var client = new AnthropicClient { ApiKey = creds.ApiKey };
        try
        {
            var response = await client.Messages.Create(new MessageCreateParams
            {
                Model = creds.Model,
                MaxTokens = maxTokens,
                OutputConfig = new OutputConfig { Effort = Effort.Low },
                System = systemPrompt,
                Messages =
                [
                    new()
                    {
                        Role = Role.User,
                        Content = new List<ContentBlockParam>
                        {
                            new ImageBlockParam
                            {
                                Source = new Base64ImageSource
                                {
                                    Data = base64,
                                    MediaType = ClaudeMediaType(mimeType),
                                },
                            },
                            new TextBlockParam { Text = "Analise esta imagem." },
                        },
                    },
                ],
            }, cancellationToken: ct);

            return ExtractClaudeText(response);
        }
        catch (Exception ex) when (ex is not AiProviderException)
        {
            throw Wrap(ex);
        }
    }

    private static string ExtractClaudeText(Message response) =>
        string.Concat(response.Content
            .Select(b => b.Value)
            .OfType<TextBlock>()
            .Select(t => t.Text))
        .Trim();

    private static string ClaudeMediaType(string mimeType) =>
        mimeType.ToLowerInvariant() switch
        {
            "image/png"  => "image/png",
            "image/gif"  => "image/gif",
            "image/webp" => "image/webp",
            _            => "image/jpeg",
        };

    // ── OpenAI / GPT ────────────────────────────────────────────────────────

    private async Task<string> OpenAiAsync(
        AiCredentials creds, string systemPrompt, string userText,
        string? base64Image, string? mimeType, int maxTokens, CancellationToken ct)
    {
        object userContent = base64Image is null
            ? userText
            : new object[]
            {
                new { type = "image_url", image_url = new { url = $"data:{mimeType};base64,{base64Image}" } },
                new { type = "text", text = userText },
            };

        var payload = new
        {
            model = creds.Model,
            max_completion_tokens = maxTokens,
            messages = new object[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userContent },
            },
        };

        using var request = new HttpRequestMessage(
            HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
        {
            Content = JsonBody(payload),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", creds.ApiKey);

        using var doc = await SendAsync(request, "OpenAI", ct);
        return doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString()?.Trim() ?? "";
    }

    // ── Gemini ──────────────────────────────────────────────────────────────

    private async Task<string> GeminiAsync(
        AiCredentials creds, string systemPrompt, string userText,
        string? base64Image, string? mimeType, int maxTokens, CancellationToken ct)
    {
        var parts = new List<object>();
        if (base64Image is not null)
            parts.Add(new { inlineData = new { mimeType, data = base64Image } });
        parts.Add(new { text = userText });

        var payload = new
        {
            systemInstruction = new { parts = new[] { new { text = systemPrompt } } },
            contents = new[] { new { role = "user", parts } },
            generationConfig = new { maxOutputTokens = maxTokens },
        };

        var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
                  $"{Uri.EscapeDataString(creds.Model)}:generateContent";

        using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonBody(payload) };
        request.Headers.Add("x-goog-api-key", creds.ApiKey);

        using var doc = await SendAsync(request, "Gemini", ct);

        // Gemini pode devolver candidates sem parts quando bloqueia por safety.
        if (!doc.RootElement.TryGetProperty("candidates", out var candidates) ||
            candidates.GetArrayLength() == 0)
            return "";

        var content = candidates[0].GetProperty("content");
        if (!content.TryGetProperty("parts", out var partsOut)) return "";

        var sb = new StringBuilder();
        foreach (var part in partsOut.EnumerateArray())
            if (part.TryGetProperty("text", out var t))
                sb.Append(t.GetString());

        return sb.ToString().Trim();
    }

    // ── Infra HTTP ──────────────────────────────────────────────────────────

    private static StringContent JsonBody(object payload) =>
        new(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

    private async Task<JsonDocument> SendAsync(
        HttpRequestMessage request, string providerLabel, CancellationToken ct)
    {
        var http = httpFactory.CreateClient("ai");
        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, ct);
        }
        catch (Exception ex)
        {
            throw new AiProviderException($"{providerLabel}: falha de conexão — {ex.Message}", false, ex);
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                var status = (int)response.StatusCode;
                logger.LogWarning("{Provider} retornou {Status}: {Body}", providerLabel, status, Trim(body));
                throw new AiProviderException(
                    $"{providerLabel} retornou {status}: {Trim(body)}",
                    isQuota: status is 429 or 402);
            }

            try
            {
                return JsonDocument.Parse(body);
            }
            catch (JsonException ex)
            {
                throw new AiProviderException($"{providerLabel}: resposta não é JSON válido", false, ex);
            }
        }
    }

    private static string Trim(string s) => s.Length > 300 ? s[..300] + "…" : s;

    /// <summary>Converte exceção do SDK Anthropic em AiProviderException classificada.</summary>
    private static AiProviderException Wrap(Exception ex)
    {
        var message = ex.Message ?? "";
        var lowered = message.ToLowerInvariant();
        var isQuota =
            lowered.Contains("rate limit") || lowered.Contains("rate_limit") ||
            lowered.Contains("quota") || lowered.Contains("credit") ||
            lowered.Contains("insufficient") || lowered.Contains("billing") ||
            lowered.Contains("429");

        return new AiProviderException($"Claude: {Trim(message)}", isQuota, ex);
    }
}

namespace Gasparzinho.Web.Services.Ai;

/// <summary>Provedores de IA aceitos na configuração de moderação.</summary>
public static class AiProviders
{
    public const string Claude = "claude";
    public const string OpenAi = "openai";
    public const string Gemini = "gemini";

    public static readonly string[] All = [Claude, OpenAi, Gemini];

    public static string Label(string? provider) => provider switch
    {
        Claude => "Claude (Anthropic)",
        OpenAi => "GPT (OpenAI)",
        Gemini => "Gemini (Google)",
        _      => provider ?? "—",
    };

    /// <summary>Modelo sugerido quando o cliente não informa um.</summary>
    public static string DefaultModel(string? provider) => provider switch
    {
        Claude => "claude-opus-5",
        OpenAi => "gpt-4o-mini",
        Gemini => "gemini-1.5-flash",
        _      => "claude-opus-5",
    };

    public static bool IsValid(string? provider) =>
        provider is not null && All.Contains(provider);
}

/// <summary>Credencial já resolvida, pronta para chamar o provedor.</summary>
/// <param name="Provider">claude | openai | gemini</param>
/// <param name="Origin">De onde veio a credencial — exibido na tela do cliente.</param>
public record AiCredentials(
    string Provider,
    string ApiKey,
    string Model,
    AiCredentialOrigin Origin)
{
    public static AiCredentials Create(
        string? provider, string apiKey, string? model, AiCredentialOrigin origin)
    {
        var p = AiProviders.IsValid(provider) ? provider! : AiProviders.Claude;
        var m = string.IsNullOrWhiteSpace(model) ? AiProviders.DefaultModel(p) : model!;
        return new AiCredentials(p, apiKey, m, origin);
    }
}

public enum AiCredentialOrigin
{
    /// <summary>Token informado pelo próprio cliente.</summary>
    Tenant,
    /// <summary>Token global mantido pelo superadmin (fallback).</summary>
    System,
}

/// <summary>Prompts efetivos de moderação, já resolvidos com fallback.</summary>
public record ModerationSettings(
    AiCredentials Credentials,
    string ProfanityPrompt,
    string NsfwPrompt);

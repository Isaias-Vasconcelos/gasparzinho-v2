namespace Gasparzinho.Web.Services;

/// <summary>
/// Recursos avançados liberados por perfil. O perfil gratuito fica só com o
/// básico (links, lista de palavras, comandos e saudação).
/// </summary>
public static class FeatureGate
{
    private static readonly Dictionary<string, int> Tiers = new()
    {
        ["free"] = 0,
        ["starter"] = 1,
        ["pro"] = 2,
    };

    public static int TierOf(string? planSlug) =>
        planSlug is not null && Tiers.TryGetValue(planSlug, out var tier) ? tier : 0;

    /// <summary>Recursos que exigem perfil Starter ou superior.</summary>
    public static bool AllowsAdvanced(string? planSlug) => TierOf(planSlug) >= 1;

    /// <summary>
    /// Lista os recursos pedidos que o perfil não permite. Vazio significa
    /// que a configuração pode ser salva como está.
    /// </summary>
    public static List<string> Blocked(string? planSlug, AdvancedFeatures requested)
    {
        if (AllowsAdvanced(planSlug)) return [];

        var blocked = new List<string>();
        if (requested.ScheduledLock) blocked.Add("Bloqueio por horário");
        if (requested.AntiFlood)     blocked.Add("Anti-flood");
        if (requested.BanViewOnce)   blocked.Add("Bloqueio de visualização única");
        if (requested.BanMedia)      blocked.Add("Bloqueio de mídias");
        if (requested.BanNsfw)       blocked.Add("Bloqueio de imagens ilícitas com IA");
        if (requested.AiAssistant)   blocked.Add("Resposta automática com IA");
        if (requested.SuggestMode)   blocked.Add("Moderação sugestiva");
        if (requested.InactivityRemoval) blocked.Add("Remoção por inatividade");
        return blocked;
    }
}

/// <summary>Recursos avançados que a configuração de um grupo pode pedir.</summary>
public record AdvancedFeatures
{
    public bool ScheduledLock { get; init; }
    public bool AntiFlood { get; init; }
    public bool BanViewOnce { get; init; }
    public bool BanMedia { get; init; }
    public bool BanNsfw { get; init; }
    public bool AiAssistant { get; init; }
    public bool SuggestMode { get; init; }
    public bool InactivityRemoval { get; init; }
}

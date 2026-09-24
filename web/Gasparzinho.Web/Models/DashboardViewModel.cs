using Gasparzinho.Web.Services.Ai;

namespace Gasparzinho.Web.Models;

public class DashboardViewModel
{
    public string TenantName { get; set; } = "";
    public string PlanName { get; set; } = "";

    public int SessionCount { get; set; }
    public int MaxSessions { get; set; }

    public int ManagedGroupCount { get; set; }
    public int MaxGroups { get; set; }

    public int PendingSuggestions { get; set; }
    public int BanCount { get; set; }

    public AiCredentialOrigin? ModerationOrigin { get; set; }
    public string? ModerationProvider { get; set; }

    /// <summary>Formata "3 / 5" ou "3 / ilimitado".</summary>
    public static string Usage(int used, int max) =>
        max == -1 ? $"{used} / ilimitado" : $"{used} / {max}";

    public string ModerationStatus => ModerationOrigin switch
    {
        AiCredentialOrigin.Tenant => $"Ativa com o seu token ({AiProviders.Label(ModerationProvider)})",
        AiCredentialOrigin.System => $"Ativa com a IA do sistema ({AiProviders.Label(ModerationProvider)})",
        _ => "Inativa — apenas a lista de palavras está em uso",
    };
}

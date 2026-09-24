using System.ComponentModel.DataAnnotations;

namespace Gasparzinho.Web.Models;

public class SessionRow
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public string? Phone { get; init; }
    public string? DisplayName { get; init; }
    public required string Status { get; init; }
    public int ManagedGroupCount { get; init; }
    public DateTime CreatedAt { get; init; }

    public bool IsConnected => Status == "connected";
    public bool IsWaitingQr => Status == "qr_ready";
    public bool IsBusy => Status is "connecting" or "qr_ready";

    public string StatusLabel => Status switch
    {
        "connected"    => "Conectada",
        "connecting"   => "Conectando",
        "qr_ready"     => "Aguardando leitura do QR",
        _              => "Desconectada",
    };

    public string StatusPill => Status switch
    {
        "connected"  => "pill-ok",
        "connecting" => "pill-info",
        "qr_ready"   => "pill-warn",
        _            => "pill-muted",
    };
}

public class SessionListViewModel
{
    public List<SessionRow> Sessions { get; set; } = [];
    public int MaxSessions { get; set; }
    public string PlanName { get; set; } = "";
    public bool BridgeOffline { get; set; }

    public bool CanCreate =>
        MaxSessions == -1 || Sessions.Count < MaxSessions;

    [Required(ErrorMessage = "Informe um nome para a sessão.")]
    [MaxLength(255)]
    [Display(Name = "Nome da sessão")]
    public string? NewSessionName { get; set; }
}

/// <summary>
/// Tela de leitura do QR code. O código não vem daqui: ele muda a cada poucos
/// segundos e é buscado ao vivo pela própria página.
/// </summary>
public class SessionQrViewModel
{
    public required string SessionId { get; init; }
    public required string SessionName { get; init; }
    public required string Status { get; init; }

    public bool IsConnected => Status == "connected";
}

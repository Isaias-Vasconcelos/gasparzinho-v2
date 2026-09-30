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
    public bool IsWaitingCode => Status == "code_ready";
    public bool IsBusy => Status is "connecting" or "qr_ready" or "code_ready";

    public string StatusLabel => Status switch
    {
        "connected"    => "Conectada",
        "connecting"   => "Conectando",
        "qr_ready"     => "Aguardando leitura do QR",
        "code_ready"   => "Aguardando código no celular",
        _              => "Desconectada",
    };

    public string StatusPill => Status switch
    {
        "connected"  => "pill-ok",
        "connecting" => "pill-info",
        "qr_ready"   => "pill-warn",
        "code_ready" => "pill-warn",
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
/// Tela de conexão, por QR code ou por código de pareamento. Nenhum dos dois
/// vem daqui: eles mudam com o tempo e são buscados ao vivo pela própria página.
/// </summary>
public class SessionQrViewModel
{
    public required string SessionId { get; init; }
    public required string SessionName { get; init; }
    public required string Status { get; init; }
    /// <summary>Aba aberta ao carregar: "qr" ou "code".</summary>
    public string Mode { get; init; } = "qr";

    public bool IsConnected => Status == "connected";
}

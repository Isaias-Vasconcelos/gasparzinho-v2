namespace Gasparzinho.Web.Data.Entities;

/// <summary>Uma conexão WhatsApp (um número). O socket real vive na bridge Node.</summary>
public class WaSession
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Phone { get; set; }
    public string? DisplayName { get; set; }
    /// <summary>disconnected | connecting | qr_ready | code_ready | connected</summary>
    public string Status { get; set; } = "disconnected";
    /// <summary>QR em data-URL, produzido pela bridge. Limpo ao conectar.</summary>
    public string? QrCode { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Configuração de moderação de um grupo específico.</summary>
public class GroupSetting
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string SessionId { get; set; } = "";
    public string GroupId { get; set; } = "";
    public string? GroupName { get; set; }

    // Bloqueio por horário
    public bool LockEnabled { get; set; }
    public string? LockStart { get; set; }
    public string? LockEnd { get; set; }
    /// <summary>JSON array de dias da semana (0=domingo).</summary>
    public string? LockDays { get; set; } = "[0,1,2,3,4,5,6]";
    public string? LockReason { get; set; }

    // Filtros
    public bool BanLinks { get; set; } = true;
    public bool BanProfanity { get; set; } = true;
    public bool BanNsfw { get; set; }
    public bool BanViewOnce { get; set; }
    public bool BanMedia { get; set; }

    public bool AiEnabled { get; set; }
    public bool IsManaged { get; set; }

    /// <summary>0 = bane na primeira infração; N = bane após N advertências.</summary>
    public int WarnChances { get; set; }

    // Anti-flood
    public int FloodLimit { get; set; }
    public int FloodPeriodMin { get; set; } = 60;
    public int FloodCloseMin { get; set; } = 30;

    // Mensagens personalizadas ({motivo}, {grupo}, {usuario}, {contagem}, {max}, {restantes})
    public string? MsgWarn { get; set; }
    public string? MsgBan { get; set; }

    public bool WelcomeEnabled { get; set; }
    public string? WelcomeMessage { get; set; }

    /// <summary>auto = pune na hora; suggest = gera sugestão para revisão humana.</summary>
    public string ModerationMode { get; set; } = "auto";

    // Remoção automática de participantes inativos
    public bool InactivityEnabled { get; set; }
    /// <summary>Dias sem interagir que levam à remoção.</summary>
    public int InactivityDays { get; set; } = 30;
    /// <summary>Motivo informado ao removido e gravado no histórico.</summary>
    public string? InactivityReason { get; set; }
    /// <summary>Anuncia a remoção no próprio grupo, além do privado.</summary>
    public bool InactivityAnnounce { get; set; }
    public DateTime? InactivityLastRunAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Ban
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string SessionId { get; set; } = "";
    public string? GroupId { get; set; }
    public string Phone { get; set; } = "";
    public string? Reason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Warning
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string SessionId { get; set; } = "";
    public string GroupId { get; set; } = "";
    public string Phone { get; set; } = "";
    public int Count { get; set; } = 1;
    public string? LastReason { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Última interação de um participante em um grupo. Alimenta a remoção
/// automática por inatividade. FirstSeenAt cobre quem nunca falou: sem ele,
/// um membro recém-visto seria removido no primeiro ciclo.
/// </summary>
public class MemberActivity
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string SessionId { get; set; } = "";
    public string GroupId { get; set; } = "";
    public string Jid { get; set; } = "";
    /// <summary>Nulo enquanto o membro não enviar nenhuma mensagem.</summary>
    public DateTime? LastMessageAt { get; set; }
    public DateTime FirstSeenAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Cache de pushName por JID, para exibir nomes na lista de membros.</summary>
public class Contact
{
    public string TenantId { get; set; } = "";
    public string Jid { get; set; } = "";
    public string? PushName { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

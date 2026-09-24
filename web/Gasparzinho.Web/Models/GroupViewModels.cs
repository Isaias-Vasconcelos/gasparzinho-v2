using System.ComponentModel.DataAnnotations;
using Gasparzinho.Web.Data.Entities;

namespace Gasparzinho.Web.Models;

/// <summary>Grupo do WhatsApp cruzado com a configuração salva.</summary>
public class GroupRow
{
    public required string GroupId { get; init; }
    public required string Name { get; init; }
    public int Participants { get; init; }
    public bool IsManaged { get; init; }
    public string ModerationMode { get; init; } = "auto";

    /// <summary>Resumo dos filtros ativos, para a listagem.</summary>
    public List<string> ActiveFilters { get; init; } = [];
}

public class GroupListViewModel
{
    public required string SessionId { get; init; }
    public required string SessionName { get; init; }
    public List<GroupRow> Groups { get; set; } = [];

    public int ManagedCount { get; set; }
    public int MaxGroups { get; set; }
    public int MaxGroupsPerSession { get; set; }
    public int ManagedInSession { get; set; }
    public string PlanName { get; set; } = "";

    /// <summary>Preenchido quando a bridge não respondeu.</summary>
    public string? BridgeError { get; set; }
}

/// <summary>Configuração completa de um grupo.</summary>
public class GroupSettingsViewModel
{
    public required string SessionId { get; set; }
    public required string GroupId { get; set; }

    [Display(Name = "Nome do grupo")]
    public string? GroupName { get; set; }

    [Display(Name = "Gerenciar este grupo")]
    public bool IsManaged { get; set; }

    // ── Filtros ─────────────────────────────────────────────────────────────

    [Display(Name = "Bloquear links")]
    public bool BanLinks { get; set; } = true;

    [Display(Name = "Bloquear palavras de baixo calão")]
    public bool BanProfanity { get; set; } = true;

    [Display(Name = "Bloquear imagens ilícitas (IA)")]
    public bool BanNsfw { get; set; }

    [Display(Name = "Bloquear visualização única")]
    public bool BanViewOnce { get; set; }

    [Display(Name = "Bloquear qualquer mídia")]
    public bool BanMedia { get; set; }

    [Display(Name = "Resposta automática com IA")]
    public bool AiEnabled { get; set; }

    // ── Punição ─────────────────────────────────────────────────────────────

    [Display(Name = "Modo de moderação")]
    public string ModerationMode { get; set; } = "auto";

    [Range(0, 20, ErrorMessage = "Use um valor entre 0 e 20.")]
    [Display(Name = "Advertências antes de remover")]
    public int WarnChances { get; set; }

    [Display(Name = "Mensagem de advertência")]
    [MaxLength(2000)]
    public string? MsgWarn { get; set; }

    [Display(Name = "Mensagem de remoção")]
    [MaxLength(2000)]
    public string? MsgBan { get; set; }

    // ── Bloqueio por horário ────────────────────────────────────────────────

    [Display(Name = "Fechar o grupo em horários definidos")]
    public bool LockEnabled { get; set; }

    [Display(Name = "Fecha às")]
    public string? LockStart { get; set; }

    [Display(Name = "Reabre às")]
    public string? LockEnd { get; set; }

    [Display(Name = "Dias da semana")]
    public List<int> LockDays { get; set; } = [0, 1, 2, 3, 4, 5, 6];

    [Display(Name = "Motivo exibido ao fechar")]
    [MaxLength(500)]
    public string? LockReason { get; set; }

    // ── Anti-flood ──────────────────────────────────────────────────────────

    [Range(0, 10000, ErrorMessage = "Use um valor entre 0 e 10000.")]
    [Display(Name = "Mensagens que disparam o anti-flood")]
    public int FloodLimit { get; set; }

    [Range(1, 1440)]
    [Display(Name = "Janela de contagem (minutos)")]
    public int FloodPeriodMin { get; set; } = 60;

    [Range(1, 1440)]
    [Display(Name = "Tempo fechado (minutos)")]
    public int FloodCloseMin { get; set; } = 30;

    // ── Saudação ────────────────────────────────────────────────────────────

    [Display(Name = "Saudar novos membros")]
    public bool WelcomeEnabled { get; set; }

    [Display(Name = "Mensagem de saudação")]
    [MaxLength(2000)]
    public string? WelcomeMessage { get; set; }

    // ── Inatividade ─────────────────────────────────────────────────────────

    [Display(Name = "Remover participantes inativos")]
    public bool InactivityEnabled { get; set; }

    [Range(1, 3650, ErrorMessage = "Use um valor entre 1 e 3650 dias.")]
    [Display(Name = "Dias sem interagir")]
    public int InactivityDays { get; set; } = 30;

    [Display(Name = "Motivo da remoção")]
    [MaxLength(500)]
    public string? InactivityReason { get; set; }

    [Display(Name = "Anunciar a remoção no grupo")]
    public bool InactivityAnnounce { get; set; }

    // ── Contexto (somente leitura) ───────────────────────────────────────────

    public string SessionName { get; set; } = "";
    public bool AdvancedAllowed { get; set; }
    public string PlanName { get; set; } = "";
    public List<Warning> Warnings { get; set; } = [];

    /// <summary>Última varredura de inatividade, para o usuário saber que está rodando.</summary>
    public DateTime? InactivityLastRunAt { get; set; }

    /// <summary>Membros que hoje passariam do prazo, calculado sem remover ninguém.</summary>
    public int InactiveNow { get; set; }

    /// <summary>Participantes com interação registrada neste grupo.</summary>
    public int TrackedMembers { get; set; }

    public static readonly (int Value, string Label)[] WeekDays =
    [
        (0, "Dom"), (1, "Seg"), (2, "Ter"), (3, "Qua"),
        (4, "Qui"), (5, "Sex"), (6, "Sáb"),
    ];

    public static GroupSettingsViewModel FromEntity(GroupSetting entity) => new()
    {
        SessionId = entity.SessionId,
        GroupId = entity.GroupId,
        GroupName = entity.GroupName,
        IsManaged = entity.IsManaged,
        BanLinks = entity.BanLinks,
        BanProfanity = entity.BanProfanity,
        BanNsfw = entity.BanNsfw,
        BanViewOnce = entity.BanViewOnce,
        BanMedia = entity.BanMedia,
        AiEnabled = entity.AiEnabled,
        ModerationMode = entity.ModerationMode,
        WarnChances = entity.WarnChances,
        MsgWarn = entity.MsgWarn,
        MsgBan = entity.MsgBan,
        LockEnabled = entity.LockEnabled,
        LockStart = entity.LockStart,
        LockEnd = entity.LockEnd,
        LockDays = ParseDays(entity.LockDays),
        LockReason = entity.LockReason,
        FloodLimit = entity.FloodLimit,
        FloodPeriodMin = entity.FloodPeriodMin,
        FloodCloseMin = entity.FloodCloseMin,
        WelcomeEnabled = entity.WelcomeEnabled,
        WelcomeMessage = entity.WelcomeMessage,
        InactivityEnabled = entity.InactivityEnabled,
        InactivityDays = entity.InactivityDays <= 0 ? 30 : entity.InactivityDays,
        InactivityReason = entity.InactivityReason,
        InactivityAnnounce = entity.InactivityAnnounce,
        InactivityLastRunAt = entity.InactivityLastRunAt,
    };

    /// <summary>Lê o JSON de dias, caindo na semana inteira se estiver inválido.</summary>
    public static List<int> ParseDays(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [0, 1, 2, 3, 4, 5, 6];
        try
        {
            var parsed = System.Text.Json.JsonSerializer.Deserialize<List<int>>(json);
            return parsed is { Count: > 0 }
                ? parsed.Where(d => d is >= 0 and <= 6).Distinct().Order().ToList()
                : [0, 1, 2, 3, 4, 5, 6];
        }
        catch (System.Text.Json.JsonException)
        {
            return [0, 1, 2, 3, 4, 5, 6];
        }
    }
}

/// <summary>Membros do grupo, para remoção manual.</summary>
public class GroupMembersViewModel
{
    public required string SessionId { get; init; }
    public required string GroupId { get; init; }
    public string? GroupName { get; init; }
    public List<MemberRow> Members { get; set; } = [];
    public string? BridgeError { get; set; }

    /// <summary>Configuração de inatividade do grupo, para destacar quem está no prazo.</summary>
    public bool InactivityEnabled { get; init; }
    public int InactivityDays { get; init; }
}

/// <summary>
/// Membro do grupo. <paramref name="LastActivity"/> é a última mensagem
/// registrada; nulo quando o membro nunca falou desde que passou a ser
/// acompanhado.
/// </summary>
public record MemberRow(
    string Jid,
    string Phone,
    string? Name,
    bool IsAdmin,
    DateTime? LastActivity = null,
    DateTime? FirstSeen = null)
{
    /// <summary>Dias desde a última interação (ou desde que passou a ser acompanhado).</summary>
    public int? IdleDays
    {
        get
        {
            var reference = LastActivity ?? FirstSeen;
            return reference is null ? null : (int)(DateTime.UtcNow - reference.Value).TotalDays;
        }
    }
}

/// <summary>Banimentos registrados.</summary>
public class BanListViewModel
{
    public List<BanRow> Bans { get; set; } = [];
}

public record BanRow(string Id, string Phone, string? GroupName, string? Reason, DateTime CreatedAt);

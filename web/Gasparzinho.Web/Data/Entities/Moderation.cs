namespace Gasparzinho.Web.Data.Entities;

/// <summary>Palavra da lista negra literal do tenant (checada antes de gastar IA).</summary>
public class ProfanityWord
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string Word { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Comando de administrador digitado no grupo (ex: "!ban @pessoa").</summary>
public class CustomCommand
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string TriggerWord { get; set; } = "";
    /// <summary>remove | ban | promote | demote</summary>
    public string Action { get; set; } = "";
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Ação proposta pela IA aguardando revisão humana (modo moderation_mode = "suggest").
/// </summary>
public class ModerationSuggestion
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string SessionId { get; set; } = "";
    public string GroupId { get; set; } = "";
    public string? GroupName { get; set; }
    public string? MessageId { get; set; }
    public string? SenderJid { get; set; }
    public string? SenderPhone { get; set; }
    public string? MessageText { get; set; }
    /// <summary>Filtro que disparou: link, palavrão, mídia inapropriada...</summary>
    public string? DetectedReason { get; set; }
    /// <summary>warn | delete | reply | flag | none</summary>
    public string SuggestedAction { get; set; } = "flag";
    public string? ReplyTemplate { get; set; }
    public string? AiReason { get; set; }
    public float? Confidence { get; set; }
    public string? PromptUsed { get; set; }
    /// <summary>pending | applied | rejected</summary>
    public string Status { get; set; } = "pending";
    public string? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Notification
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string Kind { get; set; } = "";
    /// <summary>info | warning | critical</summary>
    public string Severity { get; set; } = "info";
    public string Title { get; set; } = "";
    public string? Body { get; set; }
    public string Channel { get; set; } = "in_app";
    public string? Metadata { get; set; }
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }
}

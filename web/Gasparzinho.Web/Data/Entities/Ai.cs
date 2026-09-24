namespace Gasparzinho.Web.Data.Entities;

/// <summary>
/// Configuração global de IA, mantida pelo superadmin. Serve de fallback para
/// tenants que não informaram o próprio token de moderação.
/// </summary>
public class SystemAiConfig
{
    /// <summary>Sempre "system" — a tabela tem uma única linha.</summary>
    public string Id { get; set; } = "system";
    public string Provider { get; set; } = "openai";
    public string Model { get; set; } = "gpt-4o-mini";
    public string? ApiKey { get; set; }
    public bool Enabled { get; set; }

    /// <summary>Prompt do filtro de texto (palavras de baixo calão).</summary>
    public string? ProfanityPrompt { get; set; }
    /// <summary>Prompt do filtro visual (imagens ilícitas).</summary>
    public string? NsfwPrompt { get; set; }

    /// <summary>Ligado quando o provedor devolve erro de cota/crédito.</summary>
    public bool CreditsExhausted { get; set; }

    // Instabilidade detectada pelo monitor de saúde
    public bool DegradedMode { get; set; }
    public DateTime? DegradedSince { get; set; }
    public string? DegradedReason { get; set; }
    public DateTime? ExpectedRecoveryAt { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Configuração de IA do próprio cliente. Cobre dois usos independentes:
/// resposta automática no grupo e moderação (texto + imagem), cada um com
/// seu provedor, token e prompts.
/// </summary>
public class TenantAiConfig
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";

    // ── Resposta automática no grupo ────────────────────────────────────────
    public bool Enabled { get; set; }
    public string? ApiKey { get; set; }
    public string Provider { get; set; } = "claude";
    public string Model { get; set; } = "claude-haiku-4-5";
    public string? SystemPrompt { get; set; }
    /// <summary>keyword = só responde após a palavra-chave; always = responde tudo.</summary>
    public string TriggerMode { get; set; } = "keyword";
    public string TriggerKeyword { get; set; } = "!ia";

    // ── Moderação por IA (token e prompts informados pelo cliente) ──────────
    /// <summary>Quando falso, a moderação usa o fallback global do superadmin.</summary>
    public bool ModerationEnabled { get; set; }
    /// <summary>claude | openai | gemini</summary>
    public string? ModerationProvider { get; set; }
    public string? ModerationApiKey { get; set; }
    public string? ModerationModel { get; set; }
    /// <summary>Prompt do cliente para detectar palavras de baixo calão.</summary>
    public string? ProfanityPrompt { get; set; }
    /// <summary>Prompt do cliente para detectar imagens ilícitas.</summary>
    public string? NsfwPrompt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

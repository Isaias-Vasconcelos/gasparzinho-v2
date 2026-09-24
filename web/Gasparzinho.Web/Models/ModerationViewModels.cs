using System.ComponentModel.DataAnnotations;
using Gasparzinho.Web.Data.Entities;
using Gasparzinho.Web.Services.Ai;

namespace Gasparzinho.Web.Models;

/// <summary>Tela de configuração da moderação por IA do cliente.</summary>
public class ModerationConfigViewModel
{
    // ── Resposta automática no grupo ────────────────────────────────────────

    [Display(Name = "Ativar resposta automática por IA")]
    public bool AssistantEnabled { get; set; }

    [Display(Name = "Provedor da resposta")]
    public string? AssistantProvider { get; set; } = AiProviders.Claude;

    [Display(Name = "Modelo da resposta")]
    public string? AssistantModel { get; set; }

    /// <summary>Em branco preserva o token já salvo, como no campo da moderação.</summary>
    [Display(Name = "Token da API da resposta")]
    [DataType(DataType.Password)]
    public string? AssistantApiKey { get; set; }

    [Display(Name = "Prompt da resposta automática")]
    [MaxLength(8000, ErrorMessage = "O prompt pode ter no máximo 8000 caracteres.")]
    public string? AssistantPrompt { get; set; }

    [Display(Name = "Quando responder")]
    public string TriggerMode { get; set; } = "keyword";

    [Display(Name = "Palavra-chave")]
    [MaxLength(100, ErrorMessage = "A palavra-chave pode ter no máximo 100 caracteres.")]
    public string? TriggerKeyword { get; set; } = "!ia";

    /// <summary>Últimos caracteres do token da resposta automática.</summary>
    public string? SavedAssistantKeyHint { get; set; }

    // ── Moderação ───────────────────────────────────────────────────────────

    [Display(Name = "Ativar moderação por IA com meu próprio token")]
    public bool ModerationEnabled { get; set; }

    [Display(Name = "Provedor")]
    public string? ModerationProvider { get; set; } = AiProviders.Claude;

    /// <summary>
    /// Vazio ao carregar a tela. Preenchido só quando o usuário quer trocar o
    /// token — em branco, o token atual é preservado.
    /// </summary>
    [Display(Name = "Token da API")]
    [DataType(DataType.Password)]
    public string? ModerationApiKey { get; set; }

    [Display(Name = "Modelo")]
    public string? ModerationModel { get; set; }

    [Display(Name = "Prompt do filtro de palavras")]
    [MaxLength(8000, ErrorMessage = "O prompt pode ter no máximo 8000 caracteres.")]
    public string? ProfanityPrompt { get; set; }

    [Display(Name = "Prompt do filtro de imagens")]
    [MaxLength(8000, ErrorMessage = "O prompt pode ter no máximo 8000 caracteres.")]
    public string? NsfwPrompt { get; set; }

    // ── Somente leitura (contexto exibido na tela) ───────────────────────────

    /// <summary>Últimos caracteres do token salvo, para o usuário reconhecê-lo.</summary>
    public string? SavedKeyHint { get; set; }

    /// <summary>De onde vem a IA usada hoje na prática.</summary>
    public AiCredentialOrigin? ActiveOrigin { get; set; }
    public string? ActiveProvider { get; set; }
    public string? ActiveModel { get; set; }

    /// <summary>Verdadeiro quando não há IA nenhuma disponível.</summary>
    public bool NoAiAvailable => ActiveOrigin is null;

    /// <summary>O fallback global existe e está utilizável.</summary>
    public bool SystemFallbackAvailable { get; set; }

    public string[] AvailableProviders { get; } = AiProviders.All;

    /// <summary>Modelos sugeridos por provedor, exibidos como atalho na tela.</summary>
    public static readonly Dictionary<string, string[]> ModelSuggestions = new()
    {
        [AiProviders.Claude] = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
        [AiProviders.OpenAi] = ["gpt-4o", "gpt-4o-mini"],
        [AiProviders.Gemini] = ["gemini-1.5-pro", "gemini-1.5-flash"],
    };

    /// <summary>Modos de disparo da resposta automática.</summary>
    public static readonly (string Value, string Label)[] TriggerModes =
    [
        ("keyword", "Só quando a mensagem começar com a palavra-chave"),
        ("always", "Em toda mensagem do grupo"),
    ];

    public static ModerationConfigViewModel FromEntity(TenantAiConfig cfg) => new()
    {
        AssistantEnabled = cfg.Enabled,
        AssistantProvider = cfg.Provider,
        AssistantModel = cfg.Model,
        AssistantPrompt = string.IsNullOrWhiteSpace(cfg.SystemPrompt)
            ? AiPrompts.Assistant : cfg.SystemPrompt,
        TriggerMode = cfg.TriggerMode == "always" ? "always" : "keyword",
        TriggerKeyword = cfg.TriggerKeyword,
        SavedAssistantKeyHint = Mask(cfg.ApiKey),
        ModerationEnabled = cfg.ModerationEnabled,
        ModerationProvider = cfg.ModerationProvider ?? AiProviders.Claude,
        ModerationModel = cfg.ModerationModel,
        ProfanityPrompt = string.IsNullOrWhiteSpace(cfg.ProfanityPrompt)
            ? AiPrompts.Profanity : cfg.ProfanityPrompt,
        NsfwPrompt = string.IsNullOrWhiteSpace(cfg.NsfwPrompt)
            ? AiPrompts.Nsfw : cfg.NsfwPrompt,
        SavedKeyHint = Mask(cfg.ModerationApiKey),
    };

    /// <summary>Mostra só os 4 últimos caracteres do token.</summary>
    public static string? Mask(string? key) =>
        string.IsNullOrWhiteSpace(key) || key.Length < 4
            ? null
            : "••••••••" + key[^4..];
}

/// <summary>Teste rápido do token e do prompt, direto na tela.</summary>
public class ModerationTestViewModel
{
    [Display(Name = "Mensagem de teste")]
    public string? Message { get; set; }

    public string? Result { get; set; }
    public string? Error { get; set; }
    public bool? Blocked { get; set; }
    public string? Source { get; set; }
}

/// <summary>Fila de sugestões pendentes de revisão humana.</summary>
public class SuggestionListViewModel
{
    public List<ModerationSuggestion> Items { get; set; } = [];
    public string Status { get; set; } = "pending";
    public int UsedToday { get; set; }
    public int DailyLimit { get; set; }
    public bool IsUnlimited => DailyLimit == -1;
}

using System.ComponentModel.DataAnnotations;
using Gasparzinho.Web.Data.Entities;
using Gasparzinho.Web.Services.Ai;

namespace Gasparzinho.Web.Models;

public class SuperLoginViewModel
{
    [Required(ErrorMessage = "Informe o usuário.")]
    [Display(Name = "Usuário")]
    public string Username { get; set; } = "";

    [Required(ErrorMessage = "Informe a senha.")]
    [DataType(DataType.Password)]
    [Display(Name = "Senha")]
    public string Password { get; set; } = "";
}

/// <summary>Linha da lista de clientes no painel do superadmin.</summary>
public class TenantRow
{
    public required Tenant Tenant { get; init; }
    public string PlanName { get; init; } = "";
    public int UserCount { get; init; }
    public int SessionCount { get; init; }
    public int ManagedGroupCount { get; init; }
    public string? OwnerUsername { get; init; }
    public string? OwnerUserId { get; init; }

    public bool IsExpired =>
        Tenant.PlanExpiresAt is { } expires && expires < DateTime.UtcNow;
}

public class SuperDashboardViewModel
{
    public List<TenantRow> Tenants { get; set; } = [];
    public List<Plan> Plans { get; set; } = [];
    public int TotalUsers { get; set; }
    public int TotalSessions { get; set; }
    public bool SystemAiEnabled { get; set; }
    public bool SystemAiCreditsExhausted { get; set; }
}

/// <summary>Criação de um cliente: tenant + usuário administrador em um passo.</summary>
public class CreateTenantViewModel
{
    [Required(ErrorMessage = "Informe o nome do cliente.")]
    [MaxLength(255)]
    [Display(Name = "Nome do cliente")]
    public string TenantName { get; set; } = "";

    [Required(ErrorMessage = "Informe o usuário de acesso.")]
    [MaxLength(255)]
    [RegularExpression(@"^[A-Za-z0-9._-]+$",
        ErrorMessage = "Use apenas letras, números, ponto, hífen ou sublinhado.")]
    [Display(Name = "Usuário")]
    public string Username { get; set; } = "";

    [EmailAddress(ErrorMessage = "E-mail inválido.")]
    [MaxLength(255)]
    [Display(Name = "E-mail (opcional)")]
    public string? Email { get; set; }

    [Required(ErrorMessage = "Informe a senha.")]
    [MinLength(8, ErrorMessage = "A senha precisa de pelo menos 8 caracteres.")]
    [DataType(DataType.Password)]
    [Display(Name = "Senha")]
    public string Password { get; set; } = "";

    [Required]
    [Display(Name = "Perfil de limite")]
    public string PlanSlug { get; set; } = "free";

    [Display(Name = "Acesso expira em (opcional)")]
    [DataType(DataType.Date)]
    public DateTime? ExpiresAt { get; set; }

    public List<Plan> AvailablePlans { get; set; } = [];
}

/// <summary>Configuração global de IA — fallback para quem não tem token próprio.</summary>
public class SystemAiViewModel
{
    [Display(Name = "Ativar IA do sistema")]
    public bool Enabled { get; set; }

    [Display(Name = "Provedor")]
    public string Provider { get; set; } = AiProviders.OpenAi;

    [Display(Name = "Modelo")]
    public string Model { get; set; } = "gpt-4o-mini";

    [Display(Name = "Token da API")]
    [DataType(DataType.Password)]
    public string? ApiKey { get; set; }

    [Display(Name = "Prompt do filtro de palavras")]
    [MaxLength(8000)]
    public string? ProfanityPrompt { get; set; }

    [Display(Name = "Prompt do filtro de imagens")]
    [MaxLength(8000)]
    public string? NsfwPrompt { get; set; }

    public string? SavedKeyHint { get; set; }
    public bool CreditsExhausted { get; set; }
    public bool DegradedMode { get; set; }
    public string? DegradedReason { get; set; }

    public string[] AvailableProviders { get; } = AiProviders.All;
}

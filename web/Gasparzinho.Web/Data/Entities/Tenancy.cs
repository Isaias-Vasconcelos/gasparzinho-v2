namespace Gasparzinho.Web.Data.Entities;

/// <summary>
/// Perfil de limite atribuído manualmente pelo superadmin (free, starter, pro).
/// max_* = -1 significa ilimitado. Não há cobrança: é só controle de uso.
/// </summary>
public class Plan
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public int MaxSessions { get; set; } = 1;
    public int? MaxGroups { get; set; } = 2;
    public int? MaxGroupsPerSession { get; set; } = 1;
    /// <summary>JSON array de strings — recursos liberados neste perfil.</summary>
    public string? Features { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Cliente do sistema. Toda linha de dado pertence a um tenant.</summary>
public class Tenant
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = "";
    /// <summary>Slug do perfil de limite (free/starter/pro).</summary>
    public string PlanId { get; set; } = "free";
    /// <summary>Data de expiração do acesso. Nulo = sem prazo.</summary>
    public DateTime? PlanExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class User
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string Username { get; set; } = "";
    public string? Email { get; set; }
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "operator";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Tenant? Tenant { get; set; }
}

/// <summary>Administrador da plataforma — transversal a todos os tenants.</summary>
public class SuperAdmin
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

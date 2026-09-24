using System.Security.Claims;

namespace Gasparzinho.Web.Services.Auth;

public static class AuthSchemes
{
    /// <summary>Cookie do cliente (tenant).</summary>
    public const string Tenant = "TenantCookie";
    /// <summary>Cookie do administrador da plataforma.</summary>
    public const string Super = "SuperCookie";
}

public static class AppClaims
{
    public const string TenantId = "tenant_id";
    public const string TenantName = "tenant_name";
    public const string PlanSlug = "plan_slug";
}

public static class ClaimsPrincipalExtensions
{
    public static string? TenantId(this ClaimsPrincipal user) =>
        user.FindFirst(AppClaims.TenantId)?.Value;

    public static string? TenantName(this ClaimsPrincipal user) =>
        user.FindFirst(AppClaims.TenantName)?.Value;

    public static string? UserId(this ClaimsPrincipal user) =>
        user.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    public static bool IsAdminOfTenant(this ClaimsPrincipal user) =>
        user.IsInRole("admin");
}

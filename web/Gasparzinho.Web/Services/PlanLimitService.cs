using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Services;

/// <summary>
/// Perfis de limite atribuídos manualmente pelo superadmin. Sem cobrança:
/// quando o acesso expira, o tenant cai para o perfil "free".
/// </summary>
public class PlanLimitService(AppDbContext db)
{
    public const int Unlimited = -1;

    /// <summary>Limite diário de sugestões de IA por perfil.</summary>
    private static readonly Dictionary<string, int> DailySuggestionLimits = new()
    {
        ["free"] = 0,
        ["starter"] = 100,
        ["pro"] = Unlimited,
    };

    /// <summary>Perfil em vigor, considerando expiração de acesso.</summary>
    public async Task<Plan> GetEffectivePlanAsync(string tenantId, CancellationToken ct = default)
    {
        var tenant = await db.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == tenantId, ct);

        var slug = tenant?.PlanId ?? "free";

        // Acesso vencido volta para o perfil gratuito.
        if (tenant?.PlanExpiresAt is { } expires && expires < DateTime.UtcNow)
            slug = "free";

        var plan = await db.Plans.AsNoTracking().FirstOrDefaultAsync(p => p.Slug == slug, ct);
        return plan ?? await db.Plans.AsNoTracking().FirstAsync(p => p.Slug == "free", ct);
    }

    public async Task<int> GetDailySuggestionLimitAsync(string tenantId, CancellationToken ct = default)
    {
        var plan = await GetEffectivePlanAsync(tenantId, ct);
        return DailySuggestionLimits.TryGetValue(plan.Slug, out var limit) ? limit : 0;
    }

    public Task<int> CountSuggestionsTodayAsync(string tenantId, CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.Date;
        return db.ModerationSuggestions
            .CountAsync(s => s.TenantId == tenantId && s.CreatedAt >= today, ct);
    }

    /// <summary>Null quando dentro do limite; texto do impedimento quando estourou.</summary>
    public async Task<string?> CheckSuggestionQuotaAsync(string tenantId, CancellationToken ct = default)
    {
        var limit = await GetDailySuggestionLimitAsync(tenantId, ct);
        if (limit == Unlimited) return null;
        if (limit == 0) return "Sugestões por IA não estão liberadas no perfil atual.";

        var used = await CountSuggestionsTodayAsync(tenantId, ct);
        return used >= limit
            ? $"Limite diário de sugestões por IA atingido ({used}/{limit})."
            : null;
    }

    public async Task<string?> CheckSessionQuotaAsync(string tenantId, CancellationToken ct = default)
    {
        var plan = await GetEffectivePlanAsync(tenantId, ct);
        if (plan.MaxSessions == Unlimited) return null;

        var used = await db.Sessions.CountAsync(s => s.TenantId == tenantId, ct);
        return used >= plan.MaxSessions
            ? $"Limite de sessões do perfil {plan.Name} atingido ({used}/{plan.MaxSessions})."
            : null;
    }

    public async Task<string?> CheckManagedGroupQuotaAsync(
        string tenantId, string sessionId, CancellationToken ct = default)
    {
        var plan = await GetEffectivePlanAsync(tenantId, ct);

        if (plan.MaxGroups is { } maxGroups && maxGroups != Unlimited)
        {
            var total = await db.GroupSettings
                .CountAsync(g => g.TenantId == tenantId && g.IsManaged, ct);
            if (total >= maxGroups)
                return $"Limite de grupos do perfil {plan.Name} atingido ({total}/{maxGroups}).";
        }

        if (plan.MaxGroupsPerSession is { } perSession && perSession != Unlimited)
        {
            var inSession = await db.GroupSettings
                .CountAsync(g => g.SessionId == sessionId && g.IsManaged, ct);
            if (inSession >= perSession)
                return $"Limite de grupos por sessão atingido ({inSession}/{perSession}).";
        }

        return null;
    }
}

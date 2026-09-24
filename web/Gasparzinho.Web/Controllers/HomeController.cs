using Gasparzinho.Web.Data;
using Gasparzinho.Web.Models;
using Gasparzinho.Web.Services;
using Gasparzinho.Web.Services.Ai;
using Gasparzinho.Web.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Controllers;

[Authorize(AuthenticationSchemes = AuthSchemes.Tenant)]
public class HomeController(
    AppDbContext db,
    PlanLimitService planLimits,
    AiConfigResolver resolver) : Controller
{
    private string TenantId => User.TenantId()
        ?? throw new InvalidOperationException("Sessão sem tenant.");

    public async Task<IActionResult> Index(CancellationToken ct)
    {
        var plan = await planLimits.GetEffectivePlanAsync(TenantId, ct);
        var active = await resolver.ResolveModerationAsync(TenantId, ct);

        var model = new DashboardViewModel
        {
            TenantName = User.TenantName() ?? "",
            PlanName = plan.Name,
            SessionCount = await db.Sessions.CountAsync(s => s.TenantId == TenantId, ct),
            MaxSessions = plan.MaxSessions,
            ManagedGroupCount = await db.GroupSettings
                .CountAsync(g => g.TenantId == TenantId && g.IsManaged, ct),
            MaxGroups = plan.MaxGroups ?? PlanLimitService.Unlimited,
            PendingSuggestions = await db.ModerationSuggestions
                .CountAsync(s => s.TenantId == TenantId && s.Status == "pending", ct),
            BanCount = await db.Bans.CountAsync(b => b.TenantId == TenantId, ct),
            ModerationOrigin = active?.Credentials.Origin,
            ModerationProvider = active?.Credentials.Provider,
        };

        return View(model);
    }

    [AllowAnonymous]
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error() => View();
}

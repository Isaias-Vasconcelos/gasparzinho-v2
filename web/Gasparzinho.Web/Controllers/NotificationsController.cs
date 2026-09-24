using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Gasparzinho.Web.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Controllers;

/// <summary>Avisos do sistema para o cliente (ex: crédito de IA esgotado).</summary>
[Authorize(AuthenticationSchemes = AuthSchemes.Tenant)]
public class NotificationsController(AppDbContext db) : Controller
{
    private string TenantId => User.TenantId()
        ?? throw new InvalidOperationException("Sessão sem tenant.");

    [HttpGet]
    public async Task<IActionResult> Index(bool unreadOnly = false, CancellationToken ct = default)
    {
        var query = db.Notifications.AsNoTracking().Where(n => n.TenantId == TenantId);
        if (unreadOnly) query = query.Where(n => n.ReadAt == null);

        ViewData["UnreadOnly"] = unreadOnly;

        return View(await query
            .OrderByDescending(n => n.SentAt)
            .Take(200)
            .ToListAsync(ct));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> MarkRead(string id, CancellationToken ct)
    {
        await db.Notifications
            .Where(n => n.Id == id && n.TenantId == TenantId && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, DateTime.UtcNow), ct);

        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
    {
        var updated = await db.Notifications
            .Where(n => n.TenantId == TenantId && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, DateTime.UtcNow), ct);

        TempData["Success"] = $"{updated} aviso(s) marcado(s) como lido(s).";
        return RedirectToAction(nameof(Index));
    }
}

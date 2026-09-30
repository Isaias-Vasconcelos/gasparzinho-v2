using Gasparzinho.Web.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Services.Auth;

/// <summary>
/// Preenche os contadores do menu lateral em toda página do cliente, para não
/// depender de cada controller lembrar de calculá-los. O banco é pedido só
/// quando há cliente logado: o filtro roda também na tela /Setup, quando ainda
/// não existe banco para montar o DbContext.
/// </summary>
public class SidebarBadgeFilter(IServiceProvider services) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(
        ActionExecutingContext context, ActionExecutionDelegate next)
    {
        await next();

        // Só interessa em páginas HTML de um cliente autenticado.
        if (context.Controller is not Controller controller) return;

        var tenantId = context.HttpContext.User.TenantId();
        if (string.IsNullOrWhiteSpace(tenantId)) return;

        try
        {
            var db = services.GetRequiredService<AppDbContext>();

            controller.ViewData["PendingSuggestions"] = await db.ModerationSuggestions
                .CountAsync(s => s.TenantId == tenantId && s.Status == "pending");

            controller.ViewData["UnreadNotifications"] = await db.Notifications
                .CountAsync(n => n.TenantId == tenantId && n.ReadAt == null);
        }
        catch (Exception)
        {
            // Contador é enfeite: se o banco oscilar, a página ainda deve abrir.
        }
    }
}

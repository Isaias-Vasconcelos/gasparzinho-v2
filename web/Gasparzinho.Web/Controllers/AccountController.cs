using System.Security.Claims;
using Gasparzinho.Web.Data;
using Gasparzinho.Web.Models;
using Gasparzinho.Web.Services.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Controllers;

/// <summary>
/// Login do cliente. Não há cadastro público: as contas são criadas pelo
/// superadmin, que entrega usuário e senha.
/// </summary>
public class AccountController(AppDbContext db, ILogger<AccountController> logger) : Controller
{
    [HttpGet]
    public IActionResult Login(string? returnUrl = null)
    {
        if (User.Identity?.IsAuthenticated == true)
            return RedirectToAction("Index", "Home");

        return View(new LoginViewModel { ReturnUrl = returnUrl });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(LoginViewModel model, CancellationToken ct)
    {
        if (!ModelState.IsValid) return View(model);

        var user = await db.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Username == model.Username, ct);

        // Mensagem única para usuário inexistente ou senha errada.
        if (user is null || !BCrypt.Net.BCrypt.Verify(model.Password, user.PasswordHash))
        {
            logger.LogWarning("Tentativa de login falhou para {Username}", model.Username);
            ModelState.AddModelError(string.Empty, "Usuário ou senha inválidos.");
            return View(model);
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Role, user.Role),
            new(AppClaims.TenantId, user.TenantId),
            new(AppClaims.TenantName, user.Tenant?.Name ?? ""),
        };

        var identity = new ClaimsIdentity(claims, AuthSchemes.Tenant);
        await HttpContext.SignInAsync(
            AuthSchemes.Tenant,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = model.RememberMe });

        if (!string.IsNullOrEmpty(model.ReturnUrl) && Url.IsLocalUrl(model.ReturnUrl))
            return Redirect(model.ReturnUrl);

        return RedirectToAction("Index", "Home");
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(AuthSchemes.Tenant);
        return RedirectToAction(nameof(Login));
    }
}

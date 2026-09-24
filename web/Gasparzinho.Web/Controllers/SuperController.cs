using System.Security.Claims;
using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Gasparzinho.Web.Models;
using Gasparzinho.Web.Services.Ai;
using Gasparzinho.Web.Services.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Controllers;

/// <summary>
/// Painel do administrador da plataforma: cria clientes, define o perfil de
/// limite de cada um e mantém a IA global de fallback.
/// </summary>
[Authorize(Policy = "SuperAdmin")]
public class SuperController(
    AppDbContext db,
    ILogger<SuperController> logger) : Controller
{
    // ── Login ───────────────────────────────────────────────────────────────

    [AllowAnonymous]
    [HttpGet]
    public IActionResult Login()
    {
        if (User.Identity?.IsAuthenticated == true)
            return RedirectToAction(nameof(Index));
        return View(new SuperLoginViewModel());
    }

    [AllowAnonymous]
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(SuperLoginViewModel model, CancellationToken ct)
    {
        if (!ModelState.IsValid) return View(model);

        var admin = await db.SuperAdmins
            .FirstOrDefaultAsync(s => s.Username == model.Username, ct);

        if (admin is null || !BCrypt.Net.BCrypt.Verify(model.Password, admin.PasswordHash))
        {
            logger.LogWarning("Login de superadmin falhou para {Username}", model.Username);
            ModelState.AddModelError(string.Empty, "Usuário ou senha inválidos.");
            return View(model);
        }

        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, admin.Id),
            new Claim(ClaimTypes.Name, admin.Username),
        ], AuthSchemes.Super);

        await HttpContext.SignInAsync(AuthSchemes.Super, new ClaimsPrincipal(identity));
        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(AuthSchemes.Super);
        return RedirectToAction(nameof(Login));
    }

    // ── Visão geral ─────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> Index(CancellationToken ct)
    {
        var plans = await db.Plans.AsNoTracking().OrderBy(p => p.MaxSessions).ToListAsync(ct);
        var planNames = plans.ToDictionary(p => p.Slug, p => p.Name);

        var tenants = await db.Tenants.AsNoTracking()
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(ct);

        // Agrega em três consultas, em vez de quatro por cliente.
        var userCounts = await db.Users.AsNoTracking()
            .GroupBy(u => u.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count, ct);

        var sessionCounts = await db.Sessions.AsNoTracking()
            .GroupBy(s => s.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count, ct);

        var groupCounts = await db.GroupSettings.AsNoTracking()
            .Where(g => g.IsManaged)
            .GroupBy(g => g.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count, ct);

        var owners = await db.Users.AsNoTracking()
            .Where(u => u.Role == "admin")
            .Select(u => new { u.TenantId, u.Username, u.Id })
            .ToListAsync(ct);

        var ownerByTenant = owners
            .GroupBy(o => o.TenantId)
            .ToDictionary(g => g.Key, g => g.First());

        var rows = tenants.Select(tenant =>
        {
            ownerByTenant.TryGetValue(tenant.Id, out var owner);
            return new TenantRow
            {
                Tenant = tenant,
                PlanName = planNames.GetValueOrDefault(tenant.PlanId, tenant.PlanId),
                UserCount = userCounts.GetValueOrDefault(tenant.Id),
                SessionCount = sessionCounts.GetValueOrDefault(tenant.Id),
                ManagedGroupCount = groupCounts.GetValueOrDefault(tenant.Id),
                OwnerUsername = owner?.Username,
                OwnerUserId = owner?.Id,
            };
        }).ToList();

        var system = await db.SystemAiConfigs.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == "system", ct);

        return View(new SuperDashboardViewModel
        {
            Tenants = rows,
            Plans = plans,
            TotalUsers = await db.Users.CountAsync(ct),
            TotalSessions = await db.Sessions.CountAsync(ct),
            SystemAiEnabled = system?.Enabled ?? false,
            SystemAiCreditsExhausted = system?.CreditsExhausted ?? false,
        });
    }

    // ── Criar cliente ───────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> CreateTenant(CancellationToken ct) =>
        View(new CreateTenantViewModel
        {
            AvailablePlans = await LoadPlansAsync(ct),
        });

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> CreateTenant(CreateTenantViewModel model, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            model.AvailablePlans = await LoadPlansAsync(ct);
            return View(model);
        }

        // Username é único globalmente porque é ele que o cliente digita no login.
        if (await db.Users.AnyAsync(u => u.Username == model.Username, ct))
        {
            ModelState.AddModelError(nameof(model.Username), "Este usuário já existe.");
            model.AvailablePlans = await LoadPlansAsync(ct);
            return View(model);
        }

        if (!string.IsNullOrWhiteSpace(model.Email) &&
            await db.Users.AnyAsync(u => u.Email == model.Email, ct))
        {
            ModelState.AddModelError(nameof(model.Email), "Este e-mail já está em uso.");
            model.AvailablePlans = await LoadPlansAsync(ct);
            return View(model);
        }

        if (!await db.Plans.AnyAsync(p => p.Slug == model.PlanSlug, ct))
        {
            ModelState.AddModelError(nameof(model.PlanSlug), "Perfil inválido.");
            model.AvailablePlans = await LoadPlansAsync(ct);
            return View(model);
        }

        var tenant = new Tenant
        {
            Name = model.TenantName.Trim(),
            PlanId = model.PlanSlug,
            PlanExpiresAt = model.ExpiresAt,
        };

        var user = new User
        {
            TenantId = tenant.Id,
            Username = model.Username.Trim(),
            Email = string.IsNullOrWhiteSpace(model.Email) ? null : model.Email.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(model.Password),
            Role = "admin",
        };

        // Já cria a linha de configuração de IA com os prompts padrão, para o
        // cliente encontrar a tela de moderação preenchida no primeiro acesso.
        var aiConfig = new TenantAiConfig
        {
            TenantId = tenant.Id,
            ProfanityPrompt = AiPrompts.Profanity,
            NsfwPrompt = AiPrompts.Nsfw,
        };

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        db.Tenants.Add(tenant);
        db.Users.Add(user);
        db.TenantAiConfigs.Add(aiConfig);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        logger.LogInformation("Cliente criado: {Tenant} / usuário {Username}",
            tenant.Name, user.Username);

        TempData["Success"] =
            $"Cliente \"{tenant.Name}\" criado. Entregue o usuário \"{user.Username}\" " +
            "e a senha que você definiu.";
        return RedirectToAction(nameof(Index));
    }

    // ── Alterar perfil / expiração ──────────────────────────────────────────

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateTenantPlan(
        string id, string planSlug, DateTime? expiresAt, CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (tenant is null)
        {
            TempData["Error"] = "Cliente não encontrado.";
            return RedirectToAction(nameof(Index));
        }

        if (!await db.Plans.AnyAsync(p => p.Slug == planSlug, ct))
        {
            TempData["Error"] = "Perfil inválido.";
            return RedirectToAction(nameof(Index));
        }

        tenant.PlanId = planSlug;
        tenant.PlanExpiresAt = expiresAt;
        await db.SaveChangesAsync(ct);

        TempData["Success"] = $"Perfil de \"{tenant.Name}\" atualizado.";
        return RedirectToAction(nameof(Index));
    }

    /// <summary>Redefine a senha do administrador do cliente.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ResetPassword(
        string userId, string newPassword, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 8)
        {
            TempData["Error"] = "A nova senha precisa de pelo menos 8 caracteres.";
            return RedirectToAction(nameof(Index));
        }

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            TempData["Error"] = "Usuário não encontrado.";
            return RedirectToAction(nameof(Index));
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        await db.SaveChangesAsync(ct);

        TempData["Success"] = $"Senha de \"{user.Username}\" redefinida.";
        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteTenant(string id, CancellationToken ct)
    {
        var tenant = await db.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (tenant is null)
        {
            TempData["Error"] = "Cliente não encontrado.";
            return RedirectToAction(nameof(Index));
        }

        // Apaga tudo que pertence ao tenant — não há cascata declarada em
        // todas as tabelas porque o schema legado não a define.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        await db.Sessions.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.GroupSettings.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.ProfanityWords.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.CustomCommands.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.Bans.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.Warnings.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.Contacts.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.Notifications.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.ModerationSuggestions.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.TenantAiConfigs.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.Users.Where(x => x.TenantId == id).ExecuteDeleteAsync(ct);
        await db.Tenants.Where(x => x.Id == id).ExecuteDeleteAsync(ct);

        await transaction.CommitAsync(ct);

        logger.LogWarning("Cliente removido: {Tenant} ({Id})", tenant.Name, id);
        TempData["Success"] = $"Cliente \"{tenant.Name}\" e todos os seus dados foram removidos.";
        return RedirectToAction(nameof(Index));
    }

    // ── IA global (fallback) ────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> SystemAi(CancellationToken ct)
    {
        var system = await db.SystemAiConfigs.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == "system", ct);

        return View(new SystemAiViewModel
        {
            Enabled = system?.Enabled ?? false,
            Provider = system?.Provider ?? AiProviders.OpenAi,
            Model = system?.Model ?? "gpt-4o-mini",
            ProfanityPrompt = system?.ProfanityPrompt ?? AiPrompts.Profanity,
            NsfwPrompt = system?.NsfwPrompt ?? AiPrompts.Nsfw,
            SavedKeyHint = ModerationConfigViewModel.Mask(system?.ApiKey),
            CreditsExhausted = system?.CreditsExhausted ?? false,
            DegradedMode = system?.DegradedMode ?? false,
            DegradedReason = system?.DegradedReason,
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> SystemAi(SystemAiViewModel form, CancellationToken ct)
    {
        if (!ModelState.IsValid) return View(form);

        if (!AiProviders.IsValid(form.Provider))
        {
            ModelState.AddModelError(nameof(form.Provider), "Provedor inválido.");
            return View(form);
        }

        var system = await db.SystemAiConfigs.FirstOrDefaultAsync(x => x.Id == "system", ct);
        if (system is null)
        {
            system = new SystemAiConfig { Id = "system" };
            db.SystemAiConfigs.Add(system);
        }

        var hasNewKey = !string.IsNullOrWhiteSpace(form.ApiKey);
        if (form.Enabled && !hasNewKey && string.IsNullOrWhiteSpace(system.ApiKey))
        {
            ModelState.AddModelError(nameof(form.ApiKey),
                "Informe o token para ativar a IA do sistema.");
            form.SavedKeyHint = ModerationConfigViewModel.Mask(system.ApiKey);
            return View(form);
        }

        system.Enabled = form.Enabled;
        system.Provider = form.Provider;
        system.Model = string.IsNullOrWhiteSpace(form.Model)
            ? AiProviders.DefaultModel(form.Provider)
            : form.Model.Trim();

        if (hasNewKey)
        {
            system.ApiKey = form.ApiKey!.Trim();
            // Token novo merece nova chance: limpa o bloqueio por crédito.
            system.CreditsExhausted = false;
        }

        system.ProfanityPrompt = string.IsNullOrWhiteSpace(form.ProfanityPrompt)
            ? AiPrompts.Profanity : form.ProfanityPrompt.Trim();
        system.NsfwPrompt = string.IsNullOrWhiteSpace(form.NsfwPrompt)
            ? AiPrompts.Nsfw : form.NsfwPrompt.Trim();
        system.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        TempData["Success"] = "Configuração global de IA salva.";
        return RedirectToAction(nameof(SystemAi));
    }

    /// <summary>Reabilita a IA global após recarregar créditos no provedor.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> RecoverAi(CancellationToken ct)
    {
        var system = await db.SystemAiConfigs.FirstOrDefaultAsync(x => x.Id == "system", ct);
        if (system is not null)
        {
            system.CreditsExhausted = false;
            system.DegradedMode = false;
            system.DegradedSince = null;
            system.DegradedReason = null;
            system.ExpectedRecoveryAt = null;
            system.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        TempData["Success"] = "IA do sistema reativada.";
        return RedirectToAction(nameof(SystemAi));
    }

    private Task<List<Plan>> LoadPlansAsync(CancellationToken ct) =>
        db.Plans.AsNoTracking()
            .Where(p => p.IsActive)
            .OrderBy(p => p.MaxSessions)
            .ToListAsync(ct);
}

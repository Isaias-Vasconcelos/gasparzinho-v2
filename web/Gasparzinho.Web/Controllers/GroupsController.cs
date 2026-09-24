using System.Text.Json;
using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Gasparzinho.Web.Models;
using Gasparzinho.Web.Services;
using Gasparzinho.Web.Services.Auth;
using Gasparzinho.Web.Services.WhatsApp;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Controllers;

/// <summary>Seleção dos grupos gerenciados e configuração de moderação de cada um.</summary>
[Authorize(AuthenticationSchemes = AuthSchemes.Tenant)]
public class GroupsController(
    AppDbContext db,
    PlanLimitService planLimits,
    WhatsAppBridgeClient bridge,
    WarningService warnings,
    InactivityService inactivity,
    ILogger<GroupsController> logger) : Controller
{
    private string TenantId => User.TenantId()
        ?? throw new InvalidOperationException("Sessão sem tenant.");

    // ── Listagem ────────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> Index(string? sessionId, CancellationToken ct)
    {
        // Sem sessão escolhida, cai na primeira conectada.
        sessionId ??= await db.Sessions.AsNoTracking()
            .Where(s => s.TenantId == TenantId && s.Status == "connected")
            .Select(s => s.Id)
            .FirstOrDefaultAsync(ct);

        if (sessionId is null)
        {
            TempData["Error"] = "Conecte uma sessão antes de gerenciar grupos.";
            return RedirectToAction("Index", "Sessions");
        }

        var session = await FindSessionAsync(sessionId, ct);
        if (session is null) return NotFound();

        var plan = await planLimits.GetEffectivePlanAsync(TenantId, ct);

        var saved = await db.GroupSettings.AsNoTracking()
            .Where(g => g.SessionId == sessionId)
            .ToListAsync(ct);
        var savedByGroupId = saved.ToDictionary(g => g.GroupId);

        var model = new GroupListViewModel
        {
            SessionId = session.Id,
            SessionName = session.Name,
            PlanName = plan.Name,
            MaxGroups = plan.MaxGroups ?? PlanLimitService.Unlimited,
            MaxGroupsPerSession = plan.MaxGroupsPerSession ?? PlanLimitService.Unlimited,
            ManagedCount = await db.GroupSettings
                .CountAsync(g => g.TenantId == TenantId && g.IsManaged, ct),
            ManagedInSession = saved.Count(g => g.IsManaged),
        };

        try
        {
            var groups = await bridge.GetGroupsAsync(sessionId, ct);
            model.Groups = groups
                .Select(g =>
                {
                    savedByGroupId.TryGetValue(g.Id, out var config);
                    return new GroupRow
                    {
                        GroupId = g.Id,
                        Name = string.IsNullOrWhiteSpace(g.Name) ? g.Id : g.Name,
                        Participants = g.Participants,
                        IsManaged = config?.IsManaged ?? false,
                        ModerationMode = config?.ModerationMode ?? "auto",
                        ActiveFilters = DescribeFilters(config),
                    };
                })
                .OrderByDescending(g => g.IsManaged)
                .ThenBy(g => g.Name)
                .ToList();
        }
        catch (BridgeException ex)
        {
            // Sem a bridge não há como listar os grupos do WhatsApp, mas as
            // configurações já salvas continuam acessíveis.
            logger.LogWarning("Falha ao listar grupos: {Message}", ex.Message);
            model.BridgeError = ex.Message;
            model.Groups = saved
                .Where(g => g.IsManaged)
                .Select(g => new GroupRow
                {
                    GroupId = g.GroupId,
                    Name = g.GroupName ?? g.GroupId,
                    IsManaged = true,
                    ModerationMode = g.ModerationMode,
                    ActiveFilters = DescribeFilters(g),
                })
                .OrderBy(g => g.Name)
                .ToList();
        }

        return View(model);
    }

    /// <summary>Passa a gerenciar o grupo (respeitando os limites do perfil).</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Manage(
        string sessionId, string groupId, string? groupName, CancellationToken ct)
    {
        var session = await FindSessionAsync(sessionId, ct);
        if (session is null) return NotFound();

        var existing = await db.GroupSettings
            .FirstOrDefaultAsync(g => g.SessionId == sessionId && g.GroupId == groupId, ct);

        // Só consome cota se o grupo ainda não estava sendo gerenciado.
        if (existing is null || !existing.IsManaged)
        {
            var quotaError = await planLimits.CheckManagedGroupQuotaAsync(TenantId, sessionId, ct);
            if (quotaError is not null)
            {
                TempData["Error"] = quotaError;
                return RedirectToAction(nameof(Index), new { sessionId });
            }
        }

        if (existing is null)
        {
            db.GroupSettings.Add(new GroupSetting
            {
                TenantId = TenantId,
                SessionId = sessionId,
                GroupId = groupId,
                GroupName = groupName,
                IsManaged = true,
            });
        }
        else
        {
            existing.IsManaged = true;
            if (!string.IsNullOrWhiteSpace(groupName)) existing.GroupName = groupName;
        }

        await db.SaveChangesAsync(ct);
        TempData["Success"] = "Grupo adicionado à moderação.";
        return RedirectToAction(nameof(Settings), new { sessionId, groupId });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Unmanage(string sessionId, string groupId, CancellationToken ct)
    {
        var session = await FindSessionAsync(sessionId, ct);
        if (session is null) return NotFound();

        // Mantém a linha para preservar a configuração caso o grupo volte.
        var existing = await db.GroupSettings
            .FirstOrDefaultAsync(g => g.SessionId == sessionId && g.GroupId == groupId, ct);

        if (existing is not null)
        {
            existing.IsManaged = false;
            await db.SaveChangesAsync(ct);
        }

        TempData["Success"] = "Grupo removido da moderação.";
        return RedirectToAction(nameof(Index), new { sessionId });
    }

    // ── Configuração ────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> Settings(string sessionId, string groupId, CancellationToken ct)
    {
        var session = await FindSessionAsync(sessionId, ct);
        if (session is null) return NotFound();

        var entity = await db.GroupSettings
            .FirstOrDefaultAsync(g => g.SessionId == sessionId && g.GroupId == groupId, ct);

        if (entity is null)
        {
            entity = new GroupSetting
            {
                TenantId = TenantId,
                SessionId = sessionId,
                GroupId = groupId,
            };
            db.GroupSettings.Add(entity);
            await db.SaveChangesAsync(ct);
        }

        var model = GroupSettingsViewModel.FromEntity(entity);
        await FillContextAsync(model, session.Name, ct);
        return View(model);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Settings(GroupSettingsViewModel form, CancellationToken ct)
    {
        var session = await FindSessionAsync(form.SessionId, ct);
        if (session is null) return NotFound();

        if (!ModelState.IsValid)
        {
            await FillContextAsync(form, session.Name, ct);
            return View(form);
        }

        var plan = await planLimits.GetEffectivePlanAsync(TenantId, ct);
        var blocked = FeatureGate.Blocked(plan.Slug, new AdvancedFeatures
        {
            ScheduledLock = form.LockEnabled,
            AntiFlood = form.FloodLimit > 0,
            BanViewOnce = form.BanViewOnce,
            BanMedia = form.BanMedia,
            BanNsfw = form.BanNsfw,
            AiAssistant = form.AiEnabled,
            SuggestMode = form.ModerationMode == "suggest",
            InactivityRemoval = form.InactivityEnabled,
        });

        if (blocked.Count > 0)
        {
            ModelState.AddModelError(string.Empty,
                $"O perfil {plan.Name} não inclui: {string.Join(", ", blocked)}.");
            await FillContextAsync(form, session.Name, ct);
            return View(form);
        }

        // Horário incompleto deixaria o agendador sem o que fazer.
        if (form.LockEnabled &&
            (string.IsNullOrWhiteSpace(form.LockStart) || string.IsNullOrWhiteSpace(form.LockEnd)))
        {
            ModelState.AddModelError(nameof(form.LockStart),
                "Informe os horários de fechamento e reabertura.");
            await FillContextAsync(form, session.Name, ct);
            return View(form);
        }

        if (form.WelcomeEnabled && string.IsNullOrWhiteSpace(form.WelcomeMessage))
        {
            ModelState.AddModelError(nameof(form.WelcomeMessage),
                "Escreva a mensagem de saudação.");
            await FillContextAsync(form, session.Name, ct);
            return View(form);
        }

        var entity = await db.GroupSettings
            .FirstOrDefaultAsync(g => g.SessionId == form.SessionId && g.GroupId == form.GroupId, ct);

        if (entity is null)
        {
            entity = new GroupSetting
            {
                TenantId = TenantId,
                SessionId = form.SessionId,
                GroupId = form.GroupId,
            };
            db.GroupSettings.Add(entity);
        }

        // Sempre disponíveis, em qualquer perfil.
        entity.GroupName = form.GroupName;
        entity.IsManaged = form.IsManaged;
        entity.BanLinks = form.BanLinks;
        entity.BanProfanity = form.BanProfanity;
        entity.WarnChances = Math.Clamp(form.WarnChances, 0, 20);
        entity.MsgWarn = Blank(form.MsgWarn);
        entity.MsgBan = Blank(form.MsgBan);
        entity.WelcomeEnabled = form.WelcomeEnabled;
        entity.WelcomeMessage = Blank(form.WelcomeMessage);

        // Campos avançados chegam desabilitados quando o perfil não os libera —
        // e campo desabilitado não é enviado no POST. Só grava o que veio do
        // formulário se o perfil permite; senão preserva o valor já salvo, para
        // um rebaixamento de perfil não apagar a configuração em silêncio.
        if (FeatureGate.AllowsAdvanced(plan.Slug))
        {
            entity.BanNsfw = form.BanNsfw;
            entity.BanViewOnce = form.BanViewOnce;
            entity.BanMedia = form.BanMedia;
            entity.AiEnabled = form.AiEnabled;
            entity.ModerationMode = form.ModerationMode == "suggest" ? "suggest" : "auto";
            entity.LockEnabled = form.LockEnabled;
            entity.LockStart = Blank(form.LockStart);
            entity.LockEnd = Blank(form.LockEnd);
            entity.LockDays = JsonSerializer.Serialize(
                form.LockDays.Where(d => d is >= 0 and <= 6).Distinct().Order().ToList());
            entity.LockReason = Blank(form.LockReason);
            entity.FloodLimit = Math.Max(0, form.FloodLimit);
            entity.FloodPeriodMin = Math.Clamp(form.FloodPeriodMin, 1, 1440);
            entity.FloodCloseMin = Math.Clamp(form.FloodCloseMin, 1, 1440);
            entity.InactivityEnabled = form.InactivityEnabled;
            entity.InactivityDays = Math.Clamp(form.InactivityDays, 1, 3650);
            entity.InactivityReason = Blank(form.InactivityReason);
            entity.InactivityAnnounce = form.InactivityAnnounce;
        }

        await db.SaveChangesAsync(ct);

        TempData["Success"] = "Configuração do grupo salva.";
        return RedirectToAction(nameof(Settings),
            new { sessionId = form.SessionId, groupId = form.GroupId });
    }

    // ── Abrir / fechar ──────────────────────────────────────────────────────

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Close(
        string sessionId, string groupId, string? reason, int durationMinutes, CancellationToken ct)
    {
        var session = await FindSessionAsync(sessionId, ct);
        if (session is null) return NotFound();

        try
        {
            await bridge.CloseGroupAsync(
                sessionId, groupId, Blank(reason), Math.Max(0, durationMinutes), ct);
            TempData["Success"] = durationMinutes > 0
                ? $"Grupo fechado por {durationMinutes} minuto(s)."
                : "Grupo fechado.";
        }
        catch (BridgeException ex)
        {
            TempData["Error"] = ex.Message;
        }

        return RedirectToAction(nameof(Settings), new { sessionId, groupId });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Open(string sessionId, string groupId, CancellationToken ct)
    {
        var session = await FindSessionAsync(sessionId, ct);
        if (session is null) return NotFound();

        try
        {
            await bridge.OpenGroupAsync(sessionId, groupId, ct);
            TempData["Success"] = "Grupo reaberto.";
        }
        catch (BridgeException ex)
        {
            TempData["Error"] = ex.Message;
        }

        return RedirectToAction(nameof(Settings), new { sessionId, groupId });
    }

    // ── Membros ─────────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> Members(string sessionId, string groupId, CancellationToken ct)
    {
        var session = await FindSessionAsync(sessionId, ct);
        if (session is null) return NotFound();

        var config = await db.GroupSettings.AsNoTracking()
            .FirstOrDefaultAsync(g => g.SessionId == sessionId && g.GroupId == groupId, ct);

        var model = new GroupMembersViewModel
        {
            SessionId = sessionId,
            GroupId = groupId,
            GroupName = config?.GroupName,
            InactivityEnabled = config?.InactivityEnabled ?? false,
            InactivityDays = config?.InactivityDays ?? 0,
        };

        try
        {
            var members = await bridge.GetMembersAsync(sessionId, groupId, ct);

            // Nomes aprendidos das mensagens enriquecem o que a bridge devolve.
            var jids = members.Select(m => m.Id).ToList();
            var known = await db.Contacts.AsNoTracking()
                .Where(c => c.TenantId == TenantId && jids.Contains(c.Jid))
                .ToDictionaryAsync(c => c.Jid, c => c.PushName, ct);

            var activity = await db.MemberActivities.AsNoTracking()
                .Where(a => a.SessionId == sessionId && a.GroupId == groupId)
                .ToDictionaryAsync(a => a.Jid, ct);

            model.Members = members
                .Select(m =>
                {
                    activity.TryGetValue(m.Id, out var seen);
                    return new MemberRow(
                        m.Id,
                        m.Phone,
                        known.GetValueOrDefault(m.Id) ?? m.Name,
                        m.IsAdmin,
                        seen?.LastMessageAt,
                        seen?.FirstSeenAt);
                })
                .OrderByDescending(m => m.IsAdmin)
                .ThenBy(m => m.Name ?? m.Phone)
                .ToList();
        }
        catch (BridgeException ex)
        {
            model.BridgeError = ex.Message;
        }

        return View(model);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> RemoveMember(
        string sessionId, string groupId, string jid, bool ban, CancellationToken ct)
    {
        var session = await FindSessionAsync(sessionId, ct);
        if (session is null) return NotFound();

        try
        {
            if (ban)
            {
                await warnings.BanAsync(sessionId, groupId, jid, TenantId, "remoção manual", ct);
                TempData["Success"] = "Membro removido e registrado nos banimentos.";
            }
            else
            {
                await bridge.RemoveMemberAsync(sessionId, groupId, jid, ct);
                TempData["Success"] = "Membro removido do grupo.";
            }
        }
        catch (BridgeException ex)
        {
            TempData["Error"] = ex.Message;
        }

        return RedirectToAction(nameof(Members), new { sessionId, groupId });
    }

    // ── Inatividade ─────────────────────────────────────────────────────────

    /// <summary>Roda a varredura agora, sem esperar o ciclo automático.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> SweepInactive(
        string sessionId, string groupId, CancellationToken ct)
    {
        var session = await FindSessionAsync(sessionId, ct);
        if (session is null) return NotFound();

        var entity = await db.GroupSettings
            .FirstOrDefaultAsync(g => g.SessionId == sessionId && g.GroupId == groupId, ct);

        if (entity is null || !entity.InactivityEnabled)
        {
            TempData["Error"] =
                "Ative a remoção por inatividade e salve a configuração antes de rodar a varredura.";
            return RedirectToAction(nameof(Settings), new { sessionId, groupId });
        }

        var result = await inactivity.SweepGroupAsync(entity, ct);

        if (result.Error is not null)
        {
            TempData["Error"] = $"Não foi possível varrer o grupo: {result.Error}";
        }
        else if (result.Removed > 0)
        {
            var message =
                $"{result.Removed} participante(s) removido(s): {string.Join(", ", result.RemovedPhones)}.";

            if (result.Deferred > 0)
                message += $" Outros {result.Deferred} ficaram para a próxima varredura — " +
                           "remover muita gente de uma vez faz o WhatsApp bloquear o número.";

            TempData["Success"] = message;
        }
        else
        {
            TempData["Success"] =
                "Varredura concluída — nenhum participante passou do prazo de inatividade.";
        }

        return RedirectToAction(nameof(Settings), new { sessionId, groupId });
    }

    // ── Advertências ────────────────────────────────────────────────────────

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ClearWarning(
        string sessionId, string groupId, string phone, CancellationToken ct)
    {
        await db.Warnings
            .Where(w => w.TenantId == TenantId && w.SessionId == sessionId
                     && w.GroupId == groupId && w.Phone == phone)
            .ExecuteDeleteAsync(ct);

        TempData["Success"] = "Advertências do membro zeradas.";
        return RedirectToAction(nameof(Settings), new { sessionId, groupId });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ClearAllWarnings(
        string sessionId, string groupId, CancellationToken ct)
    {
        await db.Warnings
            .Where(w => w.TenantId == TenantId && w.SessionId == sessionId && w.GroupId == groupId)
            .ExecuteDeleteAsync(ct);

        TempData["Success"] = "Todas as advertências do grupo foram zeradas.";
        return RedirectToAction(nameof(Settings), new { sessionId, groupId });
    }

    // ── Banimentos ──────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> Bans(CancellationToken ct)
    {
        var bans = await db.Bans.AsNoTracking()
            .Where(b => b.TenantId == TenantId)
            .OrderByDescending(b => b.CreatedAt)
            .Take(300)
            .ToListAsync(ct);

        var groupNames = await db.GroupSettings.AsNoTracking()
            .Where(g => g.TenantId == TenantId)
            .Select(g => new { g.GroupId, g.GroupName })
            .ToListAsync(ct);

        var nameByGroupId = groupNames
            .GroupBy(g => g.GroupId)
            .ToDictionary(g => g.Key, g => g.First().GroupName);

        return View(new BanListViewModel
        {
            Bans = bans.Select(b => new BanRow(
                b.Id,
                b.Phone.Split('@')[0],
                b.GroupId is null ? null : nameByGroupId.GetValueOrDefault(b.GroupId),
                b.Reason,
                b.CreatedAt)).ToList(),
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteBan(string id, CancellationToken ct)
    {
        var deleted = await db.Bans
            .Where(b => b.Id == id && b.TenantId == TenantId)
            .ExecuteDeleteAsync(ct);

        TempData[deleted > 0 ? "Success" : "Error"] = deleted > 0
            ? "Registro de banimento removido."
            : "Registro não encontrado.";

        return RedirectToAction(nameof(Bans));
    }

    // ── Apoio ───────────────────────────────────────────────────────────────

    private Task<WaSession?> FindSessionAsync(string sessionId, CancellationToken ct) =>
        db.Sessions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.TenantId == TenantId, ct);

    private async Task FillContextAsync(
        GroupSettingsViewModel model, string sessionName, CancellationToken ct)
    {
        var plan = await planLimits.GetEffectivePlanAsync(TenantId, ct);
        model.SessionName = sessionName;
        model.PlanName = plan.Name;
        model.AdvancedAllowed = FeatureGate.AllowsAdvanced(plan.Slug);
        model.Warnings = await db.Warnings.AsNoTracking()
            .Where(w => w.SessionId == model.SessionId && w.GroupId == model.GroupId)
            .OrderByDescending(w => w.Count)
            .Take(50)
            .ToListAsync(ct);

        var activity = db.MemberActivities.AsNoTracking()
            .Where(a => a.SessionId == model.SessionId && a.GroupId == model.GroupId);

        model.TrackedMembers = await activity.CountAsync(ct);

        // Prévia do que a varredura faria hoje. Não considera administradores
        // (a lista de papéis vem da bridge), então é uma estimativa por cima.
        if (model.InactivityDays > 0)
        {
            var cutoff = DateTime.UtcNow.AddDays(-model.InactivityDays);
            model.InactiveNow = await activity
                .CountAsync(a => (a.LastMessageAt ?? a.FirstSeenAt) < cutoff, ct);
        }
    }

    private static List<string> DescribeFilters(GroupSetting? config)
    {
        if (config is null) return [];

        var filters = new List<string>();
        if (config.BanLinks)      filters.Add("links");
        if (config.BanProfanity)  filters.Add("palavrões");
        if (config.BanNsfw)       filters.Add("imagens ilícitas");
        if (config.BanViewOnce)   filters.Add("visualização única");
        if (config.BanMedia)      filters.Add("mídias");
        if (config.LockEnabled)   filters.Add("horário");
        if (config.FloodLimit > 0) filters.Add("anti-flood");
        if (config.WelcomeEnabled) filters.Add("saudação");
        if (config.AiEnabled)     filters.Add("IA responde");
        if (config.InactivityEnabled) filters.Add("inatividade");
        return filters;
    }

    private static string? Blank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

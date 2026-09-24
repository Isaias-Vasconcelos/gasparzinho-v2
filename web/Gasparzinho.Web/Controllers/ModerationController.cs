using Gasparzinho.Web.Data;
using Gasparzinho.Web.Models;
using Gasparzinho.Web.Services;
using Gasparzinho.Web.Services.Ai;
using Gasparzinho.Web.Services.Auth;
using Gasparzinho.Web.Services.Moderation;
using Gasparzinho.Web.Services.WhatsApp;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Controllers;

/// <summary>
/// Configuração da moderação por IA e revisão das sugestões pendentes.
/// É aqui que o cliente informa provedor, token e os dois prompts.
/// </summary>
[Authorize(AuthenticationSchemes = AuthSchemes.Tenant)]
public class ModerationController(
    AppDbContext db,
    AiConfigResolver resolver,
    AiClient ai,
    ModerationService moderation,
    PlanLimitService planLimits,
    WarningService warnings,
    WhatsAppBridgeClient bridge,
    ILogger<ModerationController> logger) : Controller
{
    private string TenantId => User.TenantId()
        ?? throw new InvalidOperationException("Sessão sem tenant.");

    // ── Configuração ────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> Index(CancellationToken ct)
    {
        var cfg = await resolver.GetOrCreateAsync(TenantId, ct);
        var model = ModerationConfigViewModel.FromEntity(cfg);
        await FillContextAsync(model, ct);
        return View(model);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Index(ModerationConfigViewModel model, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            await FillContextAsync(model, ct);
            return View(model);
        }

        var cfg = await resolver.GetOrCreateAsync(TenantId, ct);

        // Recarrega a entidade rastreada para gravar.
        var tracked = await db.TenantAiConfigs.FirstAsync(x => x.Id == cfg.Id, ct);

        if (!AiProviders.IsValid(model.ModerationProvider))
        {
            ModelState.AddModelError(
                nameof(model.ModerationProvider), "Selecione um provedor válido.");
            await FillContextAsync(model, ct);
            return View(model);
        }

        if (!AiProviders.IsValid(model.AssistantProvider))
        {
            ModelState.AddModelError(
                nameof(model.AssistantProvider), "Selecione um provedor válido para a resposta.");
            await FillContextAsync(model, ct);
            return View(model);
        }

        // Ativar sem token e sem token salvo não faz sentido — avisa em vez de
        // salvar um estado que não funciona.
        var hasNewKey = !string.IsNullOrWhiteSpace(model.ModerationApiKey);
        var hasSavedKey = !string.IsNullOrWhiteSpace(tracked.ModerationApiKey);

        if (model.ModerationEnabled && !hasNewKey && !hasSavedKey)
        {
            ModelState.AddModelError(
                nameof(model.ModerationApiKey),
                "Informe o token da API para ativar a moderação com a sua própria conta.");
            await FillContextAsync(model, ct);
            return View(model);
        }

        var hasNewAssistantKey = !string.IsNullOrWhiteSpace(model.AssistantApiKey);
        var hasSavedAssistantKey = !string.IsNullOrWhiteSpace(tracked.ApiKey);

        // A resposta automática não tem fallback global: sem token do cliente
        // ela simplesmente não roda, então recusar aqui evita a ilusão de ativa.
        if (model.AssistantEnabled && !hasNewAssistantKey && !hasSavedAssistantKey)
        {
            ModelState.AddModelError(
                nameof(model.AssistantApiKey),
                "Informe o token da API para ativar a resposta automática.");
            await FillContextAsync(model, ct);
            return View(model);
        }

        var keyword = model.TriggerKeyword?.Trim();

        if (model.AssistantEnabled && model.TriggerMode == "keyword" &&
            string.IsNullOrWhiteSpace(keyword))
        {
            ModelState.AddModelError(
                nameof(model.TriggerKeyword),
                "Informe a palavra-chave que dispara a resposta.");
            await FillContextAsync(model, ct);
            return View(model);
        }

        // ── Resposta automática ─────────────────────────────────────────────
        tracked.Enabled = model.AssistantEnabled;
        tracked.Provider = model.AssistantProvider!;
        tracked.Model = string.IsNullOrWhiteSpace(model.AssistantModel)
            ? AiProviders.DefaultModel(model.AssistantProvider)
            : model.AssistantModel.Trim();
        tracked.SystemPrompt = Normalize(model.AssistantPrompt, AiPrompts.Assistant);
        tracked.TriggerMode = model.TriggerMode == "always" ? "always" : "keyword";

        // No modo "sempre" o campo chega desabilitado — e campo desabilitado não
        // é enviado. Vazio preserva a palavra salva em vez de apagá-la.
        if (!string.IsNullOrWhiteSpace(keyword))
            tracked.TriggerKeyword = keyword;
        else if (string.IsNullOrWhiteSpace(tracked.TriggerKeyword))
            tracked.TriggerKeyword = "!ia";

        if (hasNewAssistantKey)
            tracked.ApiKey = model.AssistantApiKey!.Trim();

        // ── Moderação ───────────────────────────────────────────────────────
        tracked.ModerationEnabled = model.ModerationEnabled;
        tracked.ModerationProvider = model.ModerationProvider;
        tracked.ModerationModel = string.IsNullOrWhiteSpace(model.ModerationModel)
            ? AiProviders.DefaultModel(model.ModerationProvider)
            : model.ModerationModel.Trim();

        // Token em branco preserva o que já estava salvo.
        if (hasNewKey)
            tracked.ModerationApiKey = model.ModerationApiKey!.Trim();

        tracked.ProfanityPrompt = Normalize(model.ProfanityPrompt, AiPrompts.Profanity);
        tracked.NsfwPrompt = Normalize(model.NsfwPrompt, AiPrompts.Nsfw);

        await db.SaveChangesAsync(ct);

        TempData["Success"] = "Configuração de IA salva.";
        return RedirectToAction(nameof(Index));
    }

    /// <summary>Restaura os prompts padrão sem tocar nos tokens.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ResetPrompts(CancellationToken ct)
    {
        var cfg = await resolver.GetOrCreateAsync(TenantId, ct);
        var tracked = await db.TenantAiConfigs.FirstAsync(x => x.Id == cfg.Id, ct);

        tracked.ProfanityPrompt = AiPrompts.Profanity;
        tracked.NsfwPrompt = AiPrompts.Nsfw;
        tracked.SystemPrompt = AiPrompts.Assistant;
        await db.SaveChangesAsync(ct);

        TempData["Success"] = "Prompts restaurados para o padrão.";
        return RedirectToAction(nameof(Index));
    }

    /// <summary>Testa o prompt da resposta automática com uma pergunta qualquer.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> TestAssistant(string? message, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            TempData["Error"] = "Escreva uma pergunta para testar.";
            return RedirectToAction(nameof(Index));
        }

        var creds = await resolver.ResolveAssistantAsync(TenantId, ct);
        if (creds is null)
        {
            TempData["Error"] =
                "A resposta automática está desativada ou sem token. Salve a configuração antes de testar.";
            return RedirectToAction(nameof(Index));
        }

        var cfg = await db.TenantAiConfigs.AsNoTracking()
            .FirstAsync(x => x.TenantId == TenantId, ct);

        // O teste não vem de um grupo: {grupo} e {usuario} recebem rótulos
        // genéricos para o prompt não chegar com placeholders literais.
        var prompt = TemplateRenderer.Apply(
            string.IsNullOrWhiteSpace(cfg.SystemPrompt) ? AiPrompts.Assistant : cfg.SystemPrompt!,
            new TemplateVars { Grupo = "grupo de teste", Usuario = User.Identity?.Name ?? "usuário" });

        try
        {
            var reply = await ai.AskTextAsync(creds, prompt, message.Trim(), maxTokens: 2048, ct: ct);
            TempData["TestResult"] = string.IsNullOrWhiteSpace(reply)
                ? "A IA respondeu vazio — revise o prompt e o modelo."
                : reply;
        }
        catch (AiProviderException ex)
        {
            logger.LogWarning(ex, "Teste da resposta automática falhou");
            TempData["Error"] = $"Falha no teste: {ex.Message}";
        }

        return RedirectToAction(nameof(Index));
    }

    /// <summary>Remove o token do cliente — a moderação volta ao fallback global.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> RemoveKey(CancellationToken ct)
    {
        var cfg = await resolver.GetOrCreateAsync(TenantId, ct);
        var tracked = await db.TenantAiConfigs.FirstAsync(x => x.Id == cfg.Id, ct);

        tracked.ModerationApiKey = null;
        tracked.ModerationEnabled = false;
        await db.SaveChangesAsync(ct);

        TempData["Success"] = "Token removido. A moderação passou a usar a IA do sistema.";
        return RedirectToAction(nameof(Index));
    }

    /// <summary>Remove o token da resposta automática e a desliga.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> RemoveAssistantKey(CancellationToken ct)
    {
        var cfg = await resolver.GetOrCreateAsync(TenantId, ct);
        var tracked = await db.TenantAiConfigs.FirstAsync(x => x.Id == cfg.Id, ct);

        tracked.ApiKey = null;
        tracked.Enabled = false;
        await db.SaveChangesAsync(ct);

        TempData["Success"] = "Token removido. A resposta automática foi desativada.";
        return RedirectToAction(nameof(Index));
    }

    /// <summary>Testa o token e o prompt com uma mensagem escrita pelo usuário.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Test(string? message, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            TempData["Error"] = "Escreva uma mensagem para testar.";
            return RedirectToAction(nameof(Index));
        }

        try
        {
            var verdict = await moderation.CheckTextAsync(TenantId, message, ct);
            TempData["TestResult"] = verdict.Blocked
                ? $"BLOQUEARIA — detectado por: {verdict.Source}" +
                  (verdict.Detail is null ? "" : $" ({verdict.Detail})")
                : "LIBERARIA — nenhum problema detectado.";
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Teste de moderação falhou");
            TempData["Error"] = $"Falha no teste: {ex.Message}";
        }

        return RedirectToAction(nameof(Index));
    }

    // ── Sugestões pendentes ─────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> Suggestions(string status = "pending", CancellationToken ct = default)
    {
        var query = db.ModerationSuggestions.AsNoTracking()
            .Where(s => s.TenantId == TenantId);

        if (status is "pending" or "applied" or "rejected")
            query = query.Where(s => s.Status == status);

        var model = new SuggestionListViewModel
        {
            Status = status,
            Items = await query
                .OrderByDescending(s => s.CreatedAt)
                .Take(100)
                .ToListAsync(ct),
            UsedToday = await planLimits.CountSuggestionsTodayAsync(TenantId, ct),
            DailyLimit = await planLimits.GetDailySuggestionLimitAsync(TenantId, ct),
        };

        return View(model);
    }

    /// <summary>Aplica no WhatsApp a ação que a IA propôs.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Approve(string id, CancellationToken ct)
    {
        var suggestion = await db.ModerationSuggestions
            .FirstOrDefaultAsync(s => s.Id == id && s.TenantId == TenantId, ct);

        if (suggestion is null)
        {
            TempData["Error"] = "Sugestão não encontrada.";
            return RedirectToAction(nameof(Suggestions));
        }

        if (suggestion.Status != "pending")
        {
            TempData["Error"] = $"Esta sugestão já foi revisada ({suggestion.Status}).";
            return RedirectToAction(nameof(Suggestions));
        }

        try
        {
            await ApplyAsync(suggestion, ct);

            suggestion.Status = "applied";
            suggestion.ReviewedBy = User.UserId();
            suggestion.ReviewedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            TempData["Success"] = "Ação aplicada no grupo.";
        }
        catch (Exception ex) when (ex is BridgeException or InvalidOperationException)
        {
            logger.LogWarning(ex, "Falha ao aplicar sugestão {Id}", id);
            TempData["Error"] = ex.Message;
        }

        return RedirectToAction(nameof(Suggestions));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Reject(string id, CancellationToken ct)
    {
        var suggestion = await db.ModerationSuggestions
            .FirstOrDefaultAsync(s => s.Id == id && s.TenantId == TenantId, ct);

        if (suggestion is null || suggestion.Status != "pending")
        {
            TempData["Error"] = "Sugestão não encontrada ou já revisada.";
            return RedirectToAction(nameof(Suggestions));
        }

        suggestion.Status = "rejected";
        suggestion.ReviewedBy = User.UserId();
        suggestion.ReviewedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        TempData["Success"] = "Sugestão descartada.";
        return RedirectToAction(nameof(Suggestions));
    }

    // ── Apoio ───────────────────────────────────────────────────────────────

    private async Task ApplyAsync(
        Data.Entities.ModerationSuggestion s, CancellationToken ct)
    {
        switch (s.SuggestedAction)
        {
            case "delete":
                if (s.MessageId is null || s.SenderJid is null)
                    throw new InvalidOperationException(
                        "Sugestão sem identificação da mensagem — não é possível apagar.");
                await bridge.DeleteMessageAsync(
                    s.SessionId, s.GroupId, s.MessageId, s.SenderJid, ct);
                break;

            case "warn":
                if (s.SenderJid is null)
                    throw new InvalidOperationException("Sugestão sem autor identificado.");

                var settings = await db.GroupSettings.AsNoTracking()
                    .FirstOrDefaultAsync(
                        g => g.SessionId == s.SessionId && g.GroupId == s.GroupId, ct)
                    ?? throw new InvalidOperationException(
                        "Configuração do grupo não encontrada.");

                await warnings.WarnOrBanAsync(s.SessionId, s.GroupId, s.SenderJid,
                    s.TenantId, settings, s.DetectedReason ?? "sugestão da IA", ct);
                break;

            case "reply":
                var text = s.ReplyTemplate;
                if (string.IsNullOrWhiteSpace(text))
                    throw new InvalidOperationException("A sugestão não trouxe texto de resposta.");
                await bridge.SendTextAsync(s.SessionId, s.GroupId, text,
                    s.SenderJid is null ? null : [s.SenderJid], ct);
                break;

            case "flag":
            case "none":
                // Nada a fazer no WhatsApp — só marca como revisada.
                break;

            default:
                throw new InvalidOperationException($"Ação não suportada: {s.SuggestedAction}");
        }
    }

    /// <summary>Preenche os campos informativos da tela (origem ativa da IA).</summary>
    private async Task FillContextAsync(ModerationConfigViewModel model, CancellationToken ct)
    {
        var cfg = await db.TenantAiConfigs.AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == TenantId, ct);
        model.SavedKeyHint = ModerationConfigViewModel.Mask(cfg?.ModerationApiKey);
        model.SavedAssistantKeyHint = ModerationConfigViewModel.Mask(cfg?.ApiKey);

        var active = await resolver.ResolveModerationAsync(TenantId, ct);
        if (active is not null)
        {
            model.ActiveOrigin = active.Credentials.Origin;
            model.ActiveProvider = active.Credentials.Provider;
            model.ActiveModel = active.Credentials.Model;
        }

        var system = await resolver.GetSystemAsync(ct);
        model.SystemFallbackAvailable =
            system is { Enabled: true, CreditsExhausted: false } &&
            !string.IsNullOrWhiteSpace(system.ApiKey);
    }

    private static string Normalize(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
}

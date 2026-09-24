using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Gasparzinho.Web.Models;
using Gasparzinho.Web.Services.Auth;
using Gasparzinho.Web.Services.Moderation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Controllers;

/// <summary>Lista de palavras bloqueadas e comandos de administrador.</summary>
[Authorize(AuthenticationSchemes = AuthSchemes.Tenant)]
public class SettingsController(AppDbContext db) : Controller
{
    private string TenantId => User.TenantId()
        ?? throw new InvalidOperationException("Sessão sem tenant.");

    [HttpGet]
    public async Task<IActionResult> Index(CancellationToken ct) =>
        View(new SettingsViewModel
        {
            Words = await db.ProfanityWords.AsNoTracking()
                .Where(w => w.TenantId == TenantId)
                .OrderBy(w => w.Word)
                .ToListAsync(ct),
            Commands = await db.CustomCommands.AsNoTracking()
                .Where(c => c.TenantId == TenantId)
                .OrderBy(c => c.TriggerWord)
                .ToListAsync(ct),
        });

    // ── Lista de palavras ───────────────────────────────────────────────────

    /// <summary>Aceita uma palavra ou várias, separadas por vírgula ou linha.</summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> AddWords(string? words, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(words))
        {
            TempData["Error"] = "Informe ao menos uma palavra.";
            return RedirectToAction(nameof(Index));
        }

        var incoming = words
            .Split([',', '\n', '\r', ';'], StringSplitOptions.RemoveEmptyEntries)
            .Select(w => w.Trim().ToLowerInvariant())
            .Where(w => w.Length is > 0 and <= 255)
            .ToList();

        if (incoming.Count == 0)
        {
            TempData["Error"] = "Nenhuma palavra válida encontrada.";
            return RedirectToAction(nameof(Index));
        }

        // A collation do índice uq_tenant_word ignora acento e caixa, então a
        // deduplicação usa a mesma chave — do contrário "cu" e "cú" passariam
        // pela checagem e só o banco reclamaria, no meio do INSERT.
        var known = (await db.ProfanityWords.AsNoTracking()
                .Where(w => w.TenantId == TenantId)
                .Select(w => w.Word)
                .ToListAsync(ct))
            .Select(ProfanityText.Key)
            .ToHashSet();

        var fresh = incoming.Where(w => known.Add(ProfanityText.Key(w))).ToList();
        if (fresh.Count == 0)
        {
            TempData["Error"] = "Todas essas palavras já estavam cadastradas.";
            return RedirectToAction(nameof(Index));
        }

        db.ProfanityWords.AddRange(fresh.Select(w => new ProfanityWord
        {
            TenantId = TenantId,
            Word = w,
        }));
        await db.SaveChangesAsync(ct);

        var skipped = incoming.Count - fresh.Count;
        TempData["Success"] = skipped > 0
            ? $"{fresh.Count} palavra(s) adicionada(s); {skipped} ignorada(s) — "
              + "a lista não diferencia acento nem maiúsculas."
            : $"{fresh.Count} palavra(s) adicionada(s).";

        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteWord(string id, CancellationToken ct)
    {
        await db.ProfanityWords
            .Where(w => w.Id == id && w.TenantId == TenantId)
            .ExecuteDeleteAsync(ct);

        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ClearWords(CancellationToken ct)
    {
        var removed = await db.ProfanityWords
            .Where(w => w.TenantId == TenantId)
            .ExecuteDeleteAsync(ct);

        TempData["Success"] = $"{removed} palavra(s) removida(s).";
        return RedirectToAction(nameof(Index));
    }

    // ── Comandos ────────────────────────────────────────────────────────────

    private static readonly string[] ValidActions = ["remove", "ban", "promote", "demote"];

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> AddCommand(
        string? triggerWord, string? action, string? description, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(triggerWord) || string.IsNullOrWhiteSpace(action))
        {
            TempData["Error"] = "Informe o gatilho e a ação.";
            return RedirectToAction(nameof(Index));
        }

        if (!ValidActions.Contains(action))
        {
            TempData["Error"] = "Ação inválida.";
            return RedirectToAction(nameof(Index));
        }

        var trigger = triggerWord.Trim().ToLowerInvariant();

        // O gatilho é comparado com a primeira palavra da mensagem — espaço
        // dentro dele impediria qualquer correspondência.
        if (trigger.Contains(' '))
        {
            TempData["Error"] = "O gatilho deve ser uma única palavra, sem espaços.";
            return RedirectToAction(nameof(Index));
        }

        if (await db.CustomCommands.AnyAsync(
                c => c.TenantId == TenantId && c.TriggerWord == trigger, ct))
        {
            TempData["Error"] = $"O comando \"{trigger}\" já existe.";
            return RedirectToAction(nameof(Index));
        }

        db.CustomCommands.Add(new CustomCommand
        {
            TenantId = TenantId,
            TriggerWord = trigger,
            Action = action,
            Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
        });
        await db.SaveChangesAsync(ct);

        TempData["Success"] = $"Comando \"{trigger}\" criado.";
        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteCommand(string id, CancellationToken ct)
    {
        await db.CustomCommands
            .Where(c => c.Id == id && c.TenantId == TenantId)
            .ExecuteDeleteAsync(ct);

        return RedirectToAction(nameof(Index));
    }
}

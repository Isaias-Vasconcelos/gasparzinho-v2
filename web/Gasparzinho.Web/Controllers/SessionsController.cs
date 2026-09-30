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

/// <summary>Conexões WhatsApp do cliente: criar, parear via QR e desconectar.</summary>
[Authorize(AuthenticationSchemes = AuthSchemes.Tenant)]
public class SessionsController(
    AppDbContext db,
    PlanLimitService planLimits,
    WhatsAppBridgeClient bridge,
    ILogger<SessionsController> logger) : Controller
{
    /// <summary>Teto de espera da bridge nas consultas da tela do QR.</summary>
    private static readonly TimeSpan BridgeStatusTimeout = TimeSpan.FromSeconds(8);

    private string TenantId => User.TenantId()
        ?? throw new InvalidOperationException("Sessão sem tenant.");

    [HttpGet]
    public async Task<IActionResult> Index(CancellationToken ct)
    {
        var plan = await planLimits.GetEffectivePlanAsync(TenantId, ct);
        return View(new SessionListViewModel
        {
            Sessions = await LoadSessionsAsync(ct),
            MaxSessions = plan.MaxSessions,
            PlanName = plan.Name,
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(string? newSessionName, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(newSessionName))
        {
            TempData["Error"] = "Informe um nome para a sessão.";
            return RedirectToAction(nameof(Index));
        }

        var quotaError = await planLimits.CheckSessionQuotaAsync(TenantId, ct);
        if (quotaError is not null)
        {
            TempData["Error"] = quotaError;
            return RedirectToAction(nameof(Index));
        }

        var session = new WaSession
        {
            TenantId = TenantId,
            Name = newSessionName.Trim(),
            Status = "disconnected",
        };

        db.Sessions.Add(session);
        await db.SaveChangesAsync(ct);

        TempData["Success"] = $"Sessão \"{session.Name}\" criada. Conecte para ler o QR code.";
        return RedirectToAction(nameof(Index));
    }

    /// <summary>
    /// Manda a bridge iniciar o pareamento e leva à tela de conexão. Com
    /// <paramref name="phone"/> o pareamento é por código digitado no celular;
    /// sem ele, por QR.
    /// </summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Connect(string id, string? phone, CancellationToken ct)
    {
        var session = await FindAsync(id, ct);
        if (session is null)
        {
            TempData["Error"] = "Sessão não encontrada.";
            return RedirectToAction(nameof(Index));
        }

        if (session.Status == "connected")
        {
            TempData["Error"] = "Esta sessão já está conectada.";
            return RedirectToAction(nameof(Index));
        }

        string? pairingPhone = null;
        if (phone is not null)
        {
            pairingPhone = NormalizePhone(phone);
            if (pairingPhone is null)
            {
                TempData["Error"] = "Número inválido. Informe DDI + DDD + número, só com dígitos (ex: 5511999998888).";
                return RedirectToAction(nameof(Qr), new { id = session.Id, mode = "code" });
            }
        }

        // Se já existe pareamento em andamento, não rebaixamos o status: o QR
        // guardado pode estar sendo lido agora em outra aba. A bridge trata a
        // chamada abaixo como idempotente e devolve a conexão que já existe.
        if (session.Status == "disconnected")
        {
            session.Status = "connecting";
            session.QrCode = null;
            await db.SaveChangesAsync(ct);
        }

        try
        {
            await bridge.ConnectAsync(session.Id, pairingPhone, ct);
        }
        catch (BridgeException ex)
        {
            // A bridge é quem gera o QR e o código — sem ela não há pareamento.
            session.Status = "disconnected";
            session.QrCode = null;
            await db.SaveChangesAsync(ct);

            logger.LogWarning("Falha ao conectar sessão {Id}: {Message}", id, ex.Message);
            TempData["Error"] = ex.Message;
            return RedirectToAction(nameof(Index));
        }

        return RedirectToAction(nameof(Qr),
            new { id = session.Id, mode = pairingPhone is null ? "qr" : "code" });
    }

    /// <summary>Só dígitos, com DDI: é o formato que o WhatsApp aceita.</summary>
    private static string? NormalizePhone(string phone)
    {
        var digits = new string(phone.Where(char.IsAsciiDigit).ToArray());
        return digits.Length is >= 10 and <= 15 ? digits : null;
    }

    /// <summary>
    /// Tela de conexão (QR ou código). O código não é renderizado aqui de
    /// propósito: ele vale pouco tempo, e o que estiver no banco quando a
    /// página carrega já pode ter vencido. Quem preenche é a consulta de
    /// <see cref="Status"/>.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Qr(string id, string? mode, CancellationToken ct)
    {
        var session = await FindAsync(id, ct);
        if (session is null) return NotFound();

        return View(new SessionQrViewModel
        {
            SessionId = session.Id,
            SessionName = session.Name,
            Status = session.Status,
            Mode = mode == "code" ? "code" : "qr",
        });
    }

    /// <summary>
    /// Estado atual em JSON, consultado pela tela do QR. A bridge é a fonte da
    /// verdade: o banco só guarda o último webhook recebido, que pode estar
    /// atrasado em relação ao código que o WhatsApp aceita neste instante.
    /// </summary>
    [HttpGet]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Status(string id, CancellationToken ct)
    {
        var session = await FindAsync(id, ct);
        if (session is null) return NotFound();

        try
        {
            // Timeout curto: a tela consulta a cada segundo e meio, não pode
            // ficar presa esperando uma bridge travada.
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(BridgeStatusTimeout);

            var live = await bridge.GetStatusAsync(session.Id, cts.Token);
            await SyncFromBridgeAsync(session, live, ct);

            return Json(new
            {
                status = live.Status,
                qrCode = live.QrCode,
                qrExpiresInMs = live.QrExpiresInMs,
                mode = live.Mode,
                pairingCode = live.PairingCode,
                pairingPhone = live.PairingPhone,
                error = live.Error,
                phone = live.Phone ?? session.Phone,
                displayName = live.DisplayName ?? session.DisplayName,
                bridgeOnline = true,
            });
        }
        catch (Exception ex) when (
            (ex is BridgeException or OperationCanceledException) && !ct.IsCancellationRequested)
        {
            // Sem bridge (ou bridge lenta demais), devolvemos o último estado
            // conhecido e sinalizamos a queda, para a tela avisar em vez de
            // piscar um erro genérico.
            logger.LogWarning("Bridge indisponível ao consultar {Id}: {Message}", id, ex.Message);

            return Json(new
            {
                status = session.Status,
                qrCode = (string?)null,
                qrExpiresInMs = 0,
                mode = "qr",
                pairingCode = (string?)null,
                pairingPhone = (string?)null,
                error = (string?)null,
                phone = session.Phone,
                displayName = session.DisplayName,
                bridgeOnline = false,
            });
        }
    }

    /// <summary>
    /// Alinha o banco ao que a bridge reporta. Resolve o caso em que a bridge
    /// reiniciou e a sessão ficou presa como "conectada" no painel.
    /// </summary>
    private async Task SyncFromBridgeAsync(WaSession session, BridgeStatus live, CancellationToken ct)
    {
        var changed = false;

        if (session.Status != live.Status)
        {
            session.Status = live.Status;
            changed = true;
        }

        // O QR em si não é gravado a cada consulta: ele muda a cada poucos
        // segundos e quem o persiste para a lista de sessões é o webhook.
        if (live.Status != "qr_ready" && session.QrCode is not null)
        {
            session.QrCode = null;
            changed = true;
        }

        if (!string.IsNullOrWhiteSpace(live.Phone) && session.Phone != live.Phone)
        {
            session.Phone = live.Phone;
            changed = true;
        }

        if (!string.IsNullOrWhiteSpace(live.DisplayName) && session.DisplayName != live.DisplayName)
        {
            session.DisplayName = live.DisplayName;
            changed = true;
        }

        if (changed) await db.SaveChangesAsync(ct);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Disconnect(string id, CancellationToken ct)
    {
        var session = await FindAsync(id, ct);
        if (session is null)
        {
            TempData["Error"] = "Sessão não encontrada.";
            return RedirectToAction(nameof(Index));
        }

        try
        {
            await bridge.DisconnectAsync(session.Id, ct);
        }
        catch (BridgeException ex)
        {
            // Ainda marcamos como desconectada: o estado no banco não deve
            // ficar preso em "connected" se a bridge caiu.
            logger.LogWarning("Bridge falhou ao desconectar {Id}: {Message}", id, ex.Message);
        }

        session.Status = "disconnected";
        session.QrCode = null;
        await db.SaveChangesAsync(ct);

        TempData["Success"] = "Sessão desconectada.";
        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        var session = await FindAsync(id, ct);
        if (session is null)
        {
            TempData["Error"] = "Sessão não encontrada.";
            return RedirectToAction(nameof(Index));
        }

        try { await bridge.DisconnectAsync(session.Id, ct); }
        catch (BridgeException) { /* já pode estar fora do ar */ }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.GroupSettings.Where(g => g.SessionId == id).ExecuteDeleteAsync(ct);
        await db.Warnings.Where(w => w.SessionId == id).ExecuteDeleteAsync(ct);
        await db.Sessions.Where(s => s.Id == id).ExecuteDeleteAsync(ct);
        await transaction.CommitAsync(ct);

        TempData["Success"] = $"Sessão \"{session.Name}\" removida.";
        return RedirectToAction(nameof(Index));
    }

    private Task<WaSession?> FindAsync(string id, CancellationToken ct) =>
        db.Sessions.FirstOrDefaultAsync(s => s.Id == id && s.TenantId == TenantId, ct);

    private async Task<List<SessionRow>> LoadSessionsAsync(CancellationToken ct)
    {
        // Conta grupos gerenciados por sessão em uma consulta só.
        var counts = await db.GroupSettings.AsNoTracking()
            .Where(g => g.TenantId == TenantId && g.IsManaged)
            .GroupBy(g => g.SessionId)
            .Select(g => new { SessionId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.SessionId, x => x.Count, ct);

        // Materializa antes de projetar: o dicionário acima é memória local e
        // não pode entrar na tradução para SQL.
        var sessions = await db.Sessions.AsNoTracking()
            .Where(s => s.TenantId == TenantId)
            .OrderBy(s => s.CreatedAt)
            .ToListAsync(ct);

        return sessions.Select(s => new SessionRow
        {
            Id = s.Id,
            Name = s.Name,
            Phone = s.Phone,
            DisplayName = s.DisplayName,
            Status = s.Status,
            CreatedAt = s.CreatedAt,
            ManagedGroupCount = counts.GetValueOrDefault(s.Id),
        }).ToList();
    }
}

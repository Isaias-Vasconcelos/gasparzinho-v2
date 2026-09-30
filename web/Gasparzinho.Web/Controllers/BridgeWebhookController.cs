using Gasparzinho.Web.Data;
using Gasparzinho.Web.Services.WhatsApp;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Controllers;

/// <summary>
/// Recebe os eventos da bridge Node. Autenticado por token compartilhado,
/// não por cookie — quem chama é o serviço, não um navegador.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/bridge")]
public class BridgeWebhookController(
    AppDbContext db,
    BridgeEventQueue queue,
    IConfiguration config,
    ILogger<BridgeWebhookController> logger) : ControllerBase
{
    /// <summary>
    /// Moderar pode levar mais tempo que a espera da bridge (vídeo: download da
    /// mídia + extração do quadro + IA). Por isso o evento é enfileirado e a
    /// resposta sai na hora — aguardar aqui fazia o abort da bridge cancelar a
    /// requisição e, com ela, a chamada à IA no meio da análise.
    /// </summary>
    [HttpPost("message")]
    public IActionResult Message([FromBody] IncomingMessage message)
    {
        if (!IsAuthorized()) return Unauthorized();

        if (string.IsNullOrWhiteSpace(message.SessionId) ||
            string.IsNullOrWhiteSpace(message.GroupId) ||
            string.IsNullOrWhiteSpace(message.SenderJid))
            return BadRequest(new { error = "Evento incompleto." });

        queue.Enqueue($"mensagem do grupo {message.GroupId}", (services, ct) =>
            services.GetRequiredService<MessagePipeline>().HandleAsync(message, ct));

        return Ok(new { ok = true });
    }

    [HttpPost("participants-added")]
    public IActionResult ParticipantsAdded([FromBody] ParticipantsAdded evt)
    {
        if (!IsAuthorized()) return Unauthorized();

        queue.Enqueue($"saudação do grupo {evt.GroupId}", (services, ct) =>
            services.GetRequiredService<MessagePipeline>().HandleParticipantsAddedAsync(evt, ct));

        return Ok(new { ok = true });
    }

    /// <summary>A bridge informa mudança de conexão e o QR code atual.</summary>
    [HttpPost("session-status")]
    public async Task<IActionResult> SessionStatus(
        [FromBody] SessionStatusUpdate update, CancellationToken ct)
    {
        if (!IsAuthorized()) return Unauthorized();

        if (!KnownStatuses.Contains(update.Status))
            return BadRequest(new { error = $"Status desconhecido: {update.Status}" });

        var session = await db.Sessions.FirstOrDefaultAsync(s => s.Id == update.SessionId, ct);
        if (session is null) return NotFound();

        session.Status = update.Status;
        // Só sobrescreve telefone e nome quando a bridge realmente os informou.
        if (!string.IsNullOrWhiteSpace(update.Phone)) session.Phone = update.Phone;
        if (!string.IsNullOrWhiteSpace(update.DisplayName)) session.DisplayName = update.DisplayName;

        // O QR guardado aqui serve à lista de sessões e ao caso de a bridge
        // cair; a tela de pareamento sempre lê o código ao vivo da bridge.
        session.QrCode = update.Status == "qr_ready" ? update.QrCode : null;

        await db.SaveChangesAsync(ct);
        return Ok(new { ok = true });
    }

    /// <summary>Estados que a bridge pode reportar; qualquer outro é recusado.</summary>
    private static readonly HashSet<string> KnownStatuses =
        ["disconnected", "connecting", "qr_ready", "code_ready", "connected"];

    /// <summary>Compara o token compartilhado; sem token configurado, nada é aceito.</summary>
    private bool IsAuthorized()
    {
        var expected = config["Bridge:Token"];
        if (string.IsNullOrWhiteSpace(expected))
        {
            logger.LogError(
                "Bridge:Token não configurado — webhooks recusados. " +
                "Defina o mesmo valor no .NET e na bridge.");
            return false;
        }

        return Request.Headers.TryGetValue("X-Bridge-Token", out var provided) &&
               provided.Count == 1 &&
               CryptoEquals(provided[0], expected);
    }

    /// <summary>Comparação em tempo constante, para não vazar o token por timing.</summary>
    private static bool CryptoEquals(string? a, string b)
    {
        if (a is null || a.Length != b.Length) return false;
        var diff = 0;
        for (var i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
        return diff == 0;
    }
}

public class SessionStatusUpdate
{
    public string SessionId { get; set; } = "";
    public string Status { get; set; } = "disconnected";
    public string? Phone { get; set; }
    public string? DisplayName { get; set; }
    public string? QrCode { get; set; }
}

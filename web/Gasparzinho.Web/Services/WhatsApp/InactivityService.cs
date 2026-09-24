using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Services.WhatsApp;

/// <summary>Resultado de uma varredura de inatividade em um grupo.</summary>
/// <param name="Checked">Participantes que passaram do prazo nesta varredura.</param>
/// <param name="Removed">Quantos foram efetivamente removidos.</param>
/// <param name="RemovedPhones">Números removidos, para exibir na tela e no aviso.</param>
/// <param name="Deferred">Excedente do teto por ciclo, adiado para a próxima varredura.</param>
/// <param name="Error">Preenchido quando a bridge não respondeu.</param>
public record InactivitySweepResult(
    int Checked, int Removed, List<string> RemovedPhones,
    int Deferred = 0, string? Error = null)
{
    public static InactivitySweepResult Skipped(string? error = null) => new(0, 0, [], 0, error);
}

/// <summary>
/// Remoção automática de quem não interage. A atividade é registrada a cada
/// mensagem de grupo gerenciado; a varredura compara a última interação com o
/// prazo configurado e remove quem passou dele.
/// </summary>
public class InactivityService(
    AppDbContext db,
    WhatsAppBridgeClient bridge,
    ILogger<InactivityService> logger)
{
    /// <summary>
    /// Teto de remoções por varredura. Tirar centenas de pessoas de uma vez faz
    /// o WhatsApp tratar o número como abusivo; o excedente sai no próximo ciclo.
    /// </summary>
    private const int MaxRemovalsPerSweep = 50;

    /// <summary>Intervalo entre remoções, pelo mesmo motivo do teto acima.</summary>
    private static readonly TimeSpan RemovalDelay = TimeSpan.FromSeconds(2);

    /// <summary>
    /// Marca a interação do participante. Chamado para toda mensagem de grupo
    /// gerenciado, inclusive de administradores — trocar de papel não deve
    /// zerar o histórico de quem já falava.
    /// </summary>
    public async Task TouchAsync(
        string tenantId, string sessionId, string groupId, string jid,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(jid)) return;

        var now = DateTime.UtcNow;

        var existing = await db.MemberActivities.FirstOrDefaultAsync(
            a => a.SessionId == sessionId && a.GroupId == groupId && a.Jid == jid, ct);

        if (existing is not null)
        {
            existing.LastMessageAt = now;
            await db.SaveChangesAsync(ct);
            return;
        }

        var entry = db.MemberActivities.Add(new MemberActivity
        {
            TenantId = tenantId,
            SessionId = sessionId,
            GroupId = groupId,
            Jid = jid,
            LastMessageAt = now,
            FirstSeenAt = now,
        });

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Corrida entre mensagens simultâneas do mesmo membro: o índice
            // único barrou a segunda inserção. Desanexa para que o próximo
            // SaveChanges do pipeline (advertência, contato) não tente de novo.
            entry.State = EntityState.Detached;
        }
    }

    /// <summary>
    /// Avalia um grupo e remove os inativos. Precisa da bridge para saber quem
    /// está no grupo hoje e quem é administrador (nunca removido).
    /// </summary>
    public async Task<InactivitySweepResult> SweepGroupAsync(
        GroupSetting settings, CancellationToken ct = default)
    {
        if (!settings.InactivityEnabled || !settings.IsManaged || settings.InactivityDays <= 0)
            return InactivitySweepResult.Skipped();

        List<BridgeMember> members;
        try
        {
            members = await bridge.GetMembersAsync(settings.SessionId, settings.GroupId, ct);
        }
        catch (BridgeException ex)
        {
            logger.LogWarning(
                "Inatividade: não foi possível ler os membros de {Group}: {Message}",
                settings.GroupId, ex.Message);
            return InactivitySweepResult.Skipped(ex.Message);
        }

        var now = DateTime.UtcNow;
        var cutoff = now.AddDays(-settings.InactivityDays);

        var tracked = await db.MemberActivities
            .Where(a => a.SessionId == settings.SessionId && a.GroupId == settings.GroupId)
            .ToListAsync(ct);

        var trackedByJid = tracked.ToDictionary(a => a.Jid);

        // Quem ainda não tem registro entra agora com FirstSeenAt = hoje, então
        // a contagem começa a partir desta varredura e ninguém é removido sem
        // ter tido a chance de interagir.
        var fresh = members
            .Where(m => !trackedByJid.ContainsKey(m.Id))
            .Select(m => new MemberActivity
            {
                TenantId = settings.TenantId,
                SessionId = settings.SessionId,
                GroupId = settings.GroupId,
                Jid = m.Id,
                FirstSeenAt = now,
            })
            .ToList();

        if (fresh.Count > 0) db.MemberActivities.AddRange(fresh);

        // Registros de quem já saiu do grupo não servem para nada. Só limpa
        // quando a bridge devolveu alguém — lista vazia costuma ser falha.
        if (members.Count > 0)
        {
            var present = members.Select(m => m.Id).ToHashSet();
            var gone = tracked.Where(a => !present.Contains(a.Jid)).ToList();
            if (gone.Count > 0) db.MemberActivities.RemoveRange(gone);
        }

        var candidates = members
            .Where(m => !m.IsAdmin)
            .Select(m => new
            {
                Member = m,
                Reference = trackedByJid.TryGetValue(m.Id, out var activity)
                    ? activity.LastMessageAt ?? activity.FirstSeenAt
                    : now,
            })
            .Where(x => x.Reference < cutoff)
            .ToList();

        await db.SaveChangesAsync(ct);

        var reason = string.IsNullOrWhiteSpace(settings.InactivityReason)
            ? $"inatividade — sem interagir por {settings.InactivityDays} dia(s)"
            : settings.InactivityReason!.Trim();

        var removedPhones = new List<string>();
        var batch = candidates.Take(MaxRemovalsPerSweep).ToList();
        var deferred = candidates.Count - batch.Count;

        if (deferred > 0)
            logger.LogInformation(
                "Inatividade: {Total} elegíveis em {Group}; removendo {Batch} agora e " +
                "adiando {Deferred} para o próximo ciclo",
                candidates.Count, settings.GroupId, batch.Count, deferred);

        var first = true;

        foreach (var candidate in batch)
        {
            if (ct.IsCancellationRequested) break;

            // Espaça as remoções para não parecer comportamento automatizado
            // abusivo ao WhatsApp.
            if (!first) await Task.Delay(RemovalDelay, ct);
            first = false;

            var jid = candidate.Member.Id;
            var phone = string.IsNullOrWhiteSpace(candidate.Member.Phone)
                ? jid.Split('@')[0]
                : candidate.Member.Phone;

            try
            {
                await bridge.RemoveMemberAsync(settings.SessionId, settings.GroupId, jid, ct);
            }
            catch (BridgeException ex)
            {
                // Perder o admin no meio da varredura é o caso comum; segue com
                // os próximos e o próximo ciclo tenta de novo.
                logger.LogWarning(
                    "Inatividade: falha ao remover {Jid} de {Group}: {Message}",
                    jid, settings.GroupId, ex.Message);
                continue;
            }

            removedPhones.Add(phone);

            // A linha de atividade some junto: se a pessoa voltar ao grupo,
            // recomeça o prazo do zero em vez de sair de novo na hora.
            if (trackedByJid.TryGetValue(jid, out var stale))
                db.MemberActivities.Remove(stale);

            var vars = new TemplateVars
            {
                Motivo = reason,
                Grupo = settings.GroupName ?? "o grupo",
                Usuario = $"@{phone}",
                Dias = settings.InactivityDays,
            };

            await AnnounceAsync(settings, jid, phone, vars, ct);
        }

        await db.SaveChangesAsync(ct);
        await StampRunAsync(settings, now, reason, removedPhones, ct);

        if (removedPhones.Count > 0)
            logger.LogInformation(
                "Inatividade: {Count} participante(s) removido(s) de {Group}",
                removedPhones.Count, settings.GroupId);

        return new InactivitySweepResult(
            candidates.Count, removedPhones.Count, removedPhones, deferred);
    }

    /// <summary>Avisa o removido no privado e, se pedido, o próprio grupo.</summary>
    private async Task AnnounceAsync(
        GroupSetting settings, string jid, string phone, TemplateVars vars, CancellationToken ct)
    {
        var direct =
            $"👋 Você foi removido de *{vars.Grupo}* por: *{vars.Motivo}*.\n\n" +
            $"O grupo remove automaticamente quem não interage há {settings.InactivityDays} dia(s).\n" +
            "_Esta é uma mensagem automática do sistema de moderação._";

        try { await bridge.SendTextAsync(settings.SessionId, jid, direct, null, ct); }
        catch (BridgeException) { /* o membro pode ter bloqueado o bot */ }

        if (!settings.InactivityAnnounce) return;

        var group = $"👋 @{phone} foi removido por: {vars.Motivo}.";
        try { await bridge.SendTextAsync(settings.SessionId, settings.GroupId, group, [jid], ct); }
        catch (BridgeException) { /* o grupo pode estar fechado */ }
    }

    /// <summary>Grava a data da varredura e, quando houve remoção, um aviso no painel.</summary>
    private async Task StampRunAsync(
        GroupSetting settings, DateTime now, string reason,
        List<string> removedPhones, CancellationToken ct)
    {
        // ExecuteUpdate em vez de mexer na entidade: ela pode ter vindo sem
        // rastreamento e um SaveChanges aqui gravaria mais do que a data.
        await db.GroupSettings
            .Where(g => g.Id == settings.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(g => g.InactivityLastRunAt, now), ct);

        if (removedPhones.Count == 0) return;

        db.Notifications.Add(new Notification
        {
            TenantId = settings.TenantId,
            Kind = "inactivity_removal",
            Severity = "info",
            Title = $"{removedPhones.Count} participante(s) removido(s) por inatividade",
            Body = $"Grupo: {settings.GroupName ?? settings.GroupId}\n" +
                   $"Prazo configurado: {settings.InactivityDays} dia(s)\n" +
                   $"Motivo: {reason}\n" +
                   $"Números: {string.Join(", ", removedPhones)}",
        });
        await db.SaveChangesAsync(ct);
    }
}

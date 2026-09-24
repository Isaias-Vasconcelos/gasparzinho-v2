using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Services.WhatsApp;

/// <summary>
/// Advertências e banimento. Com warn_chances = 0 o membro é removido na
/// primeira infração; acima disso acumula advertências até o limite.
/// </summary>
public class WarningService(
    AppDbContext db,
    WhatsAppBridgeClient bridge,
    ILogger<WarningService> logger)
{
    public async Task WarnOrBanAsync(
        string sessionId, string groupId, string senderJid, string tenantId,
        GroupSetting settings, string reason, CancellationToken ct = default)
    {
        var chances = settings.WarnChances;
        var phone = senderJid.Split('@')[0];
        var groupName = settings.GroupName ?? "o grupo";

        var vars = new TemplateVars
        {
            Motivo = reason,
            Grupo = groupName,
            Usuario = $"@{phone}",
        };

        // Sem tolerância: remove imediatamente.
        if (chances <= 0)
        {
            await BanAsync(sessionId, groupId, senderJid, tenantId, reason, ct);
            await AnnounceAsync(sessionId, groupId, senderJid, settings.MsgBan, vars,
                fallbackDirect:
                    $"⛔ Você foi removido de *{groupName}* por: *{reason}*.\n\n" +
                    "_Esta é uma mensagem automática do sistema de moderação._",
                fallbackGroup: $"⛔ @{phone} foi removido por: {reason}.",
                ct);
            return;
        }

        var warning = await db.Warnings.FirstOrDefaultAsync(
            w => w.SessionId == sessionId && w.GroupId == groupId && w.Phone == senderJid, ct);

        int count;
        if (warning is null)
        {
            db.Warnings.Add(new Warning
            {
                TenantId = tenantId,
                SessionId = sessionId,
                GroupId = groupId,
                Phone = senderJid,
                Count = 1,
                LastReason = reason,
            });
            count = 1;
        }
        else
        {
            count = warning.Count + 1;
            warning.Count = count;
            warning.LastReason = reason;
            warning.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync(ct);

        var warnVars = vars with { Contagem = count, Max = chances, Restantes = chances - count };

        if (count >= chances)
        {
            await BanAsync(sessionId, groupId, senderJid, tenantId,
                $"{reason} ({count}/{chances} advertências)", ct);

            await db.Warnings
                .Where(w => w.SessionId == sessionId && w.GroupId == groupId && w.Phone == senderJid)
                .ExecuteDeleteAsync(ct);

            await AnnounceAsync(sessionId, groupId, senderJid, settings.MsgBan,
                warnVars with { Restantes = 0 },
                fallbackDirect:
                    $"⛔ Você foi removido de *{groupName}* por atingir {chances} advertência(s).\n\n" +
                    $"Último motivo: *{reason}*.",
                fallbackGroup:
                    $"⛔ @{phone} foi removido após atingir {chances} advertência(s).",
                ct);
            return;
        }

        await AnnounceAsync(sessionId, groupId, senderJid, settings.MsgWarn, warnVars,
            fallbackDirect:
                $"⚠️ *Advertência em {groupName}*\n\nMotivo: *{reason}*\n" +
                $"Advertências: *{count}/{chances}*\nChances restantes: *{chances - count}*\n\n" +
                $"_Ao atingir {chances} advertências você será removido automaticamente._",
            fallbackGroup:
                $"⚠️ @{phone} – advertência {count}/{chances}. Motivo: {reason}.",
            ct);
    }

    /// <summary>Remove do grupo e registra o banimento.</summary>
    public async Task BanAsync(
        string sessionId, string groupId, string senderJid, string tenantId,
        string reason, CancellationToken ct = default)
    {
        try
        {
            await bridge.RemoveMemberAsync(sessionId, groupId, senderJid, ct);
        }
        catch (BridgeException ex)
        {
            // Registra o ban mesmo se a remoção falhou (ex: bot perdeu o admin).
            logger.LogWarning("Remoção falhou, banimento segue registrado: {Message}", ex.Message);
        }

        var already = await db.Bans.AnyAsync(
            b => b.TenantId == tenantId && b.GroupId == groupId && b.Phone == senderJid, ct);

        if (!already)
        {
            db.Bans.Add(new Ban
            {
                TenantId = tenantId,
                SessionId = sessionId,
                GroupId = groupId,
                Phone = senderJid,
                Reason = reason,
            });
            await db.SaveChangesAsync(ct);
        }
    }

    /// <summary>Avisa o usuário no privado e o grupo, usando o template se houver.</summary>
    private async Task AnnounceAsync(
        string sessionId, string groupId, string senderJid, string? template,
        TemplateVars vars, string fallbackDirect, string fallbackGroup, CancellationToken ct)
    {
        var hasTemplate = !string.IsNullOrWhiteSpace(template);

        var direct = hasTemplate ? TemplateRenderer.Apply(template!, vars) : fallbackDirect;
        var group = hasTemplate ? TemplateRenderer.Apply(template!, vars) : fallbackGroup;

        try { await bridge.SendTextAsync(sessionId, senderJid, direct, null, ct); }
        catch (BridgeException) { /* usuário pode ter bloqueado o bot */ }

        try { await bridge.SendTextAsync(sessionId, groupId, group, [senderJid], ct); }
        catch (BridgeException) { /* grupo pode estar fechado */ }
    }
}

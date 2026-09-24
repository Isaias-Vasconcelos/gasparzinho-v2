using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Gasparzinho.Web.Services.Ai;
using Gasparzinho.Web.Services.Moderation;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Services.WhatsApp;

/// <summary>
/// Aplica os filtros de moderação a cada mensagem de grupo recebida da bridge.
/// Ordem dos filtros preservada do sistema anterior: link → palavrão →
/// visualização única → mídia proibida → imagem ilícita.
/// </summary>
public class MessagePipeline(
    AppDbContext db,
    ModerationService moderation,
    WhatsAppBridgeClient bridge,
    AiConfigResolver aiResolver,
    AiClient ai,
    WarningService warnings,
    InactivityService inactivity,
    FloodTracker floodTracker,
    ILogger<MessagePipeline> logger)
{
    public async Task HandleAsync(IncomingMessage msg, CancellationToken ct = default)
    {
        var session = await db.Sessions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == msg.SessionId, ct);
        if (session is null) return;

        var tenantId = session.TenantId;

        if (!msg.FromMe && !string.IsNullOrWhiteSpace(msg.PushName))
            await UpsertContactAsync(tenantId, msg.SenderJid, msg.PushName!, ct);

        var settings = await db.GroupSettings.AsNoTracking()
            .FirstOrDefaultAsync(
                g => g.SessionId == msg.SessionId && g.GroupId == msg.GroupId && g.IsManaged, ct);
        if (settings is null) return;

        // Marca a interação antes de qualquer filtro: mesmo a mensagem que
        // acaba barrada prova que o participante está ativo no grupo.
        if (!msg.FromMe)
            await inactivity.TouchAsync(tenantId, msg.SessionId, msg.GroupId, msg.SenderJid, ct);

        // Mensagens do próprio bot e de administradores nunca são moderadas —
        // apenas podem disparar comandos e a resposta automática.
        if (msg.FromMe || msg.IsAdmin)
        {
            await HandleCommandAsync(msg, tenantId, ct);
            if (!msg.FromMe)
                await HandleAssistantAsync(msg, tenantId, settings, ct);
            return;
        }

        // Anti-flood conta toda mensagem de não administrador, inclusive as que
        // acabam barradas adiante.
        await CheckFloodAsync(msg, settings, ct);

        var isSuggestMode = settings.ModerationMode == "suggest";

        // 1. Links
        if (settings.BanLinks && ModerationService.ContainsLink(msg.Text))
        {
            await ActAsync(msg, tenantId, settings, "link",
                deleteMessage: !isSuggestMode, ct);
            return;
        }

        // 2. Palavras de baixo calão (lista literal + IA com o prompt do cliente)
        if (settings.BanProfanity)
        {
            var verdict = await moderation.CheckTextAsync(tenantId, msg.Text, ct);
            if (verdict.Blocked)
            {
                await ActAsync(msg, tenantId, settings, "palavrão", deleteMessage: false, ct);
                return;
            }
        }

        // 3. Visualização única
        if (settings.BanViewOnce && msg.IsViewOnce)
        {
            await ActAsync(msg, tenantId, settings, "visualização única",
                deleteMessage: !isSuggestMode, ct);
            return;
        }

        // 4. Mídia proibida por completo
        if (settings.BanMedia && msg.HasMedia)
        {
            await ActAsync(msg, tenantId, settings, "mídia proibida",
                deleteMessage: !isSuggestMode, ct);
            return;
        }

        // 5. Imagem ilícita — só baixa a mídia se o filtro estiver ligado
        if (settings.BanNsfw && msg.HasMedia && msg.MessageId is not null)
        {
            var media = await bridge.DownloadMediaAsync(msg.SessionId, msg.MessageId, ct);
            if (media is { } m)
            {
                var verdict = await moderation.CheckImageAsync(tenantId, m.Data, m.MimeType, ct);
                if (verdict.Blocked)
                {
                    await ActAsync(msg, tenantId, settings, "mídia inapropriada",
                        deleteMessage: !isSuggestMode, ct);
                    return;
                }
            }
        }

        await HandleAssistantAsync(msg, tenantId, settings, ct);
    }

    /// <summary>Pune na hora (modo auto) ou registra sugestão (modo suggest).</summary>
    private async Task ActAsync(
        IncomingMessage msg, string tenantId, GroupSetting settings,
        string reason, bool deleteMessage, CancellationToken ct)
    {
        if (deleteMessage && msg.MessageId is not null)
        {
            try
            {
                await bridge.DeleteMessageAsync(
                    msg.SessionId, msg.GroupId, msg.MessageId, msg.SenderJid, ct);
            }
            catch (BridgeException ex)
            {
                logger.LogWarning("Não foi possível apagar a mensagem: {Message}", ex.Message);
            }
        }

        if (settings.ModerationMode == "suggest")
        {
            var priorCount = await db.Warnings.AsNoTracking()
                .Where(w => w.SessionId == msg.SessionId
                         && w.GroupId == msg.GroupId
                         && w.Phone == msg.SenderJid)
                .Select(w => w.Count)
                .FirstOrDefaultAsync(ct);

            await moderation.ProposeAsync(new SuggestionRequest
            {
                TenantId = tenantId,
                SessionId = msg.SessionId,
                GroupId = msg.GroupId,
                GroupName = settings.GroupName,
                MessageId = msg.MessageId,
                SenderJid = msg.SenderJid,
                MessageText = msg.Text,
                DetectedReason = reason,
                PriorViolations = priorCount,
            }, ct);
            return;
        }

        await warnings.WarnOrBanAsync(msg.SessionId, msg.GroupId, msg.SenderJid,
            tenantId, settings, reason, ct);
    }

    /// <summary>Fecha o grupo temporariamente quando o volume estoura o limite.</summary>
    private async Task CheckFloodAsync(
        IncomingMessage msg, GroupSetting settings, CancellationToken ct)
    {
        var exceeded = floodTracker.RegisterAndCheck(
            msg.SessionId, msg.GroupId, settings.FloodLimit, settings.FloodPeriodMin);

        if (!exceeded) return;

        var reason = $"🚫 Flood detectado: {settings.FloodLimit} mensagens " +
                     $"em até {settings.FloodPeriodMin} min";
        try
        {
            await bridge.CloseGroupAsync(
                msg.SessionId, msg.GroupId, reason, settings.FloodCloseMin, ct);
            logger.LogInformation(
                "Anti-flood fechou o grupo {Group} por {Minutes} min",
                msg.GroupId, settings.FloodCloseMin);
        }
        catch (BridgeException ex)
        {
            logger.LogWarning("Anti-flood não pôde fechar o grupo: {Message}", ex.Message);
        }
    }

    /// <summary>Comando de administrador digitado no grupo (ex: "!ban @pessoa").</summary>
    private async Task HandleCommandAsync(
        IncomingMessage msg, string tenantId, CancellationToken ct)
    {
        var trigger = msg.Text?.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault()?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(trigger)) return;

        var command = await db.CustomCommands.AsNoTracking()
            .FirstOrDefaultAsync(c => c.TenantId == tenantId && c.TriggerWord == trigger, ct);
        if (command is null) return;

        var targetJid = msg.Mentions.FirstOrDefault();
        if (targetJid is null)
        {
            var parts = msg.Text!.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length > 1)
                targetJid = $"{parts[1].TrimStart('@')}@s.whatsapp.net";
        }

        if (targetJid is null)
        {
            await SafeSendAsync(msg.SessionId, msg.GroupId,
                $"Marque alguém com @ ou informe o número.\nEx: {trigger} @pessoa", null, ct);
            return;
        }

        var phone = targetJid.Split('@')[0];
        try
        {
            switch (command.Action)
            {
                case "remove":
                    await bridge.RemoveMemberAsync(msg.SessionId, msg.GroupId, targetJid, ct);
                    await SafeSendAsync(msg.SessionId, msg.GroupId,
                        $"✅ @{phone} foi removido.", [targetJid], ct);
                    break;

                case "ban":
                    await warnings.BanAsync(msg.SessionId, msg.GroupId, targetJid,
                        tenantId, "comando de administrador", ct);
                    await SafeSendAsync(msg.SessionId, msg.GroupId,
                        $"⛔ @{phone} foi banido.", [targetJid], ct);
                    break;

                case "promote":
                    await bridge.UpdateRoleAsync(msg.SessionId, msg.GroupId, targetJid, "promote", ct);
                    await SafeSendAsync(msg.SessionId, msg.GroupId,
                        $"⬆️ @{phone} agora é administrador.", [targetJid], ct);
                    break;

                case "demote":
                    await bridge.UpdateRoleAsync(msg.SessionId, msg.GroupId, targetJid, "demote", ct);
                    await SafeSendAsync(msg.SessionId, msg.GroupId,
                        $"⬇️ @{phone} deixou de ser administrador.", [targetJid], ct);
                    break;

                default:
                    logger.LogWarning("Ação de comando desconhecida: {Action}", command.Action);
                    break;
            }
        }
        catch (BridgeException ex)
        {
            await SafeSendAsync(msg.SessionId, msg.GroupId, $"❌ Erro: {ex.Message}", null, ct);
        }
    }

    /// <summary>Resposta automática da IA no grupo.</summary>
    private async Task HandleAssistantAsync(
        IncomingMessage msg, string tenantId, GroupSetting settings, CancellationToken ct)
    {
        if (!settings.AiEnabled || string.IsNullOrWhiteSpace(msg.Text)) return;

        var cfg = await db.TenantAiConfigs.AsNoTracking()
            .FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (cfg is not { Enabled: true } || string.IsNullOrWhiteSpace(cfg.ApiKey)) return;

        var text = msg.Text.Trim();
        var userText = text;

        if (cfg.TriggerMode == "keyword")
        {
            var keyword = string.IsNullOrWhiteSpace(cfg.TriggerKeyword) ? "!ia" : cfg.TriggerKeyword;
            if (!text.StartsWith(keyword, StringComparison.OrdinalIgnoreCase)) return;

            var stripped = text[keyword.Length..].Trim();
            userText = string.IsNullOrWhiteSpace(stripped) ? text : stripped;
        }

        var creds = await aiResolver.ResolveAssistantAsync(tenantId, ct);
        if (creds is null) return;

        try
        {
            // O prompt é do cliente; {grupo} e {usuario} entram resolvidos para
            // a IA saber onde está e com quem fala.
            var template = string.IsNullOrWhiteSpace(cfg.SystemPrompt)
                ? AiPrompts.Assistant
                : cfg.SystemPrompt!;

            var systemPrompt = TemplateRenderer.Apply(template, new TemplateVars
            {
                Grupo = settings.GroupName ?? msg.GroupId,
                Usuario = string.IsNullOrWhiteSpace(msg.PushName)
                    ? msg.SenderJid.Split('@')[0]
                    : msg.PushName!,
            });

            var reply = await ai.AskTextAsync(creds, systemPrompt, userText, maxTokens: 2048, ct: ct);
            if (!string.IsNullOrWhiteSpace(reply))
                await SafeSendAsync(msg.SessionId, msg.GroupId, reply, null, ct);
        }
        catch (AiProviderException ex)
        {
            logger.LogWarning("[assistente] IA falhou: {Message}", ex.Message);
            if (ex.IsQuota)
                await aiResolver.MarkQuotaExhaustedAsync(tenantId, creds.Origin, ct);
        }
    }

    /// <summary>Saudação de novos membros.</summary>
    public async Task HandleParticipantsAddedAsync(
        ParticipantsAdded evt, CancellationToken ct = default)
    {
        if (evt.Participants.Count == 0) return;

        var settings = await db.GroupSettings.AsNoTracking()
            .FirstOrDefaultAsync(
                g => g.SessionId == evt.SessionId && g.GroupId == evt.GroupId && g.IsManaged, ct);

        if (settings is not { WelcomeEnabled: true } ||
            string.IsNullOrWhiteSpace(settings.WelcomeMessage))
            return;

        var jids = evt.Participants.Where(j => j.Contains('@')).ToArray();
        if (jids.Length == 0) return;

        var tags = string.Join(' ', jids.Select(j => $"@{j.Split('@')[0]}"));
        var text = TemplateRenderer.Apply(settings.WelcomeMessage!, new TemplateVars
        {
            Usuario = tags,
            Grupo = settings.GroupName ?? evt.GroupId,
        });

        await SafeSendAsync(evt.SessionId, evt.GroupId, text, jids, ct);
    }

    private async Task UpsertContactAsync(
        string tenantId, string jid, string pushName, CancellationToken ct)
    {
        var trimmed = pushName.Trim();
        if (trimmed.Length > 255) trimmed = trimmed[..255];

        var existing = await db.Contacts
            .FirstOrDefaultAsync(c => c.TenantId == tenantId && c.Jid == jid, ct);

        if (existing is null)
            db.Contacts.Add(new Contact { TenantId = tenantId, Jid = jid, PushName = trimmed });
        else
            existing.PushName = trimmed;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Corrida entre mensagens simultâneas do mesmo contato — irrelevante.
        }
    }

    private async Task SafeSendAsync(
        string sessionId, string chatId, string text, string[]? mentions, CancellationToken ct)
    {
        try
        {
            await bridge.SendTextAsync(sessionId, chatId, text, mentions, ct);
        }
        catch (BridgeException ex)
        {
            logger.LogWarning("Falha ao enviar mensagem: {Message}", ex.Message);
        }
    }
}

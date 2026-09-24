using Gasparzinho.Web.Data;
using Gasparzinho.Web.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Services.Ai;

/// <summary>
/// Decide qual token e quais prompts usar na moderação de um tenant:
/// 1. token do próprio cliente, se ele informou e habilitou;
/// 2. senão, token global do superadmin;
/// 3. senão, nada — só a lista literal de palavras vale.
/// </summary>
public class AiConfigResolver(AppDbContext db, ILogger<AiConfigResolver> logger)
{
    /// <summary>Garante que o tenant tenha uma linha de configuração.</summary>
    public async Task<TenantAiConfig> GetOrCreateAsync(string tenantId, CancellationToken ct = default)
    {
        var cfg = await db.TenantAiConfigs.FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
        if (cfg is not null) return cfg;

        cfg = new TenantAiConfig
        {
            TenantId = tenantId,
            ProfanityPrompt = AiPrompts.Profanity,
            NsfwPrompt = AiPrompts.Nsfw,
        };
        db.TenantAiConfigs.Add(cfg);
        await db.SaveChangesAsync(ct);
        return cfg;
    }

    public Task<SystemAiConfig?> GetSystemAsync(CancellationToken ct = default) =>
        db.SystemAiConfigs.FirstOrDefaultAsync(x => x.Id == "system", ct);

    /// <summary>
    /// Resolve credencial + prompts de moderação. Devolve null quando não há
    /// nenhuma IA utilizável (nem do cliente, nem global).
    /// </summary>
    public async Task<ModerationSettings?> ResolveModerationAsync(
        string tenantId, CancellationToken ct = default)
    {
        var tenantCfg = await db.TenantAiConfigs
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);

        // 1. Credencial do próprio cliente.
        if (tenantCfg is { ModerationEnabled: true } &&
            !string.IsNullOrWhiteSpace(tenantCfg.ModerationApiKey))
        {
            return new ModerationSettings(
                AiCredentials.Create(
                    tenantCfg.ModerationProvider,
                    tenantCfg.ModerationApiKey!,
                    tenantCfg.ModerationModel,
                    AiCredentialOrigin.Tenant),
                Fallback(tenantCfg.ProfanityPrompt, AiPrompts.Profanity),
                Fallback(tenantCfg.NsfwPrompt, AiPrompts.Nsfw));
        }

        // 2. Credencial global do superadmin.
        var system = await db.SystemAiConfigs
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == "system", ct);

        if (system is { Enabled: true, CreditsExhausted: false } &&
            !string.IsNullOrWhiteSpace(system.ApiKey))
        {
            // Mesmo usando o token global, o prompt do cliente tem prioridade:
            // ele conhece as regras do próprio grupo.
            return new ModerationSettings(
                AiCredentials.Create(
                    system.Provider, system.ApiKey!, system.Model, AiCredentialOrigin.System),
                Fallback(tenantCfg?.ProfanityPrompt, system.ProfanityPrompt, AiPrompts.Profanity),
                Fallback(tenantCfg?.NsfwPrompt, system.NsfwPrompt, AiPrompts.Nsfw));
        }

        logger.LogDebug("Tenant {TenantId} sem IA de moderação disponível", tenantId);
        return null;
    }

    /// <summary>Credenciais da resposta automática no grupo (sem fallback global).</summary>
    public async Task<AiCredentials?> ResolveAssistantAsync(
        string tenantId, CancellationToken ct = default)
    {
        var cfg = await db.TenantAiConfigs
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);

        if (cfg is not { Enabled: true } || string.IsNullOrWhiteSpace(cfg.ApiKey))
            return null;

        return AiCredentials.Create(
            cfg.Provider, cfg.ApiKey!, cfg.Model, AiCredentialOrigin.Tenant);
    }

    /// <summary>Marca crédito esgotado na origem correta da credencial.</summary>
    public async Task MarkQuotaExhaustedAsync(
        string tenantId, AiCredentialOrigin origin, CancellationToken ct = default)
    {
        if (origin == AiCredentialOrigin.System)
        {
            var system = await db.SystemAiConfigs.FirstOrDefaultAsync(x => x.Id == "system", ct);
            if (system is null || system.CreditsExhausted) return;

            system.CreditsExhausted = true;
            system.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            logger.LogWarning("Créditos da IA global esgotados — moderação global desativada");
            return;
        }

        // Token do cliente: avisa o cliente, sem desligar nada dos outros.
        db.Notifications.Add(new Notification
        {
            TenantId = tenantId,
            Kind = "ai_quota_exhausted",
            Severity = "critical",
            Title = "Créditos da sua IA esgotaram",
            Body = "A moderação por IA parou porque o token informado ficou sem crédito. " +
                   "Recarregue a conta no provedor ou informe outro token em Moderação.",
        });
        await db.SaveChangesAsync(ct);
        logger.LogWarning("Créditos da IA do tenant {TenantId} esgotados", tenantId);
    }

    private static string Fallback(params string?[] candidates) =>
        candidates.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c)) ?? "";
}

using System.Text.Json;
using Gasparzinho.Web.Data.Entities;
using Gasparzinho.Web.Services.Ai;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Data;

/// <summary>
/// Cria o schema quando ele não existe e aplica as colunas novas ao banco que
/// já roda em produção. Cada ALTER é tolerante a "já existe" porque o banco
/// legado pode estar em qualquer estágio da migração.
/// </summary>
public static class DbInitializer
{
    /// <summary>
    /// Tabelas que podem faltar num banco legado. EnsureCreated não cria
    /// tabelas isoladas quando o banco já tem conteúdo, então cada uma é
    /// garantida aqui com CREATE TABLE IF NOT EXISTS.
    /// </summary>
    private static readonly string[] TableDefinitions =
    [
        """
        CREATE TABLE IF NOT EXISTS warnings (
          id          VARCHAR(36)  NOT NULL PRIMARY KEY,
          tenant_id   VARCHAR(36)  NOT NULL,
          session_id  VARCHAR(36)  NOT NULL,
          group_id    VARCHAR(255) NOT NULL,
          phone       VARCHAR(255) NOT NULL,
          count       INT                   DEFAULT 1,
          last_reason TEXT,
          updated_at  DATETIME              DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_session_group_phone (session_id, group_id, phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
        """
        CREATE TABLE IF NOT EXISTS member_activity (
          id              VARCHAR(36)  NOT NULL PRIMARY KEY,
          tenant_id       VARCHAR(36)  NOT NULL,
          session_id      VARCHAR(36)  NOT NULL,
          group_id        VARCHAR(255) NOT NULL,
          jid             VARCHAR(255) NOT NULL,
          last_message_at DATETIME              DEFAULT NULL,
          first_seen_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_activity_session_group_jid (session_id, group_id, jid),
          KEY ix_activity_last_message (session_id, group_id, last_message_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """,
    ];

    /// <summary>Colunas adicionadas pela versão .NET, ausentes no schema legado.</summary>
    private static readonly string[] Migrations =
    [
        "ALTER TABLE ai_configs ADD COLUMN moderation_enabled TINYINT(1) DEFAULT 0",
        "ALTER TABLE ai_configs ADD COLUMN moderation_provider VARCHAR(50) DEFAULT NULL",
        "ALTER TABLE ai_configs ADD COLUMN moderation_api_key TEXT DEFAULT NULL",
        "ALTER TABLE ai_configs ADD COLUMN moderation_model VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE ai_configs ADD COLUMN profanity_prompt TEXT DEFAULT NULL",
        "ALTER TABLE ai_configs ADD COLUMN nsfw_prompt TEXT DEFAULT NULL",
        "ALTER TABLE group_settings ADD COLUMN inactivity_enabled TINYINT(1) DEFAULT 0",
        "ALTER TABLE group_settings ADD COLUMN inactivity_days INT DEFAULT 30",
        "ALTER TABLE group_settings ADD COLUMN inactivity_reason TEXT DEFAULT NULL",
        "ALTER TABLE group_settings ADD COLUMN inactivity_announce TINYINT(1) DEFAULT 0",
        "ALTER TABLE group_settings ADD COLUMN inactivity_last_run_at DATETIME DEFAULT NULL",
    ];

    public static async Task InitializeAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var logger = scope.ServiceProvider
            .GetRequiredService<ILoggerFactory>().CreateLogger("DbInitializer");

        // Cria o schema inteiro só quando o banco ainda não existe.
        var created = await db.Database.EnsureCreatedAsync();
        if (created) logger.LogInformation("Schema criado do zero");

        // Num banco legado, completa o que está faltando.
        foreach (var sql in TableDefinitions)
            await db.Database.ExecuteSqlRawAsync(sql);

        foreach (var sql in Migrations)
        {
            try
            {
                await db.Database.ExecuteSqlRawAsync(sql);
                logger.LogInformation("Coluna adicionada: {Sql}", sql);
            }
            catch (Exception ex)
            {
                // Coluna já existente é o caso normal em bancos já migrados.
                logger.LogDebug("Migração ignorada ({Reason}): {Sql}", ex.GetType().Name, sql);
            }
        }

        await SeedPlansAsync(db, logger);
        await SeedSystemAiAsync(db, logger);
        await SeedSuperAdminAsync(db, config, logger);
    }

    private static async Task SeedPlansAsync(AppDbContext db, ILogger logger)
    {
        var defaults = new[]
        {
            new Plan
            {
                Name = "Gratuito", Slug = "free",
                MaxSessions = 1, MaxGroups = 1, MaxGroupsPerSession = 1,
                Features = JsonSerializer.Serialize(new[]
                {
                    "1 sessão WhatsApp", "1 grupo gerenciado", "Bloqueio de links",
                    "Filtro de palavrões (lista)", "Comandos personalizados",
                    "Saudação automática de novos membros", "Painel",
                }),
            },
            new Plan
            {
                Name = "Starter", Slug = "starter",
                MaxSessions = 5, MaxGroups = 10, MaxGroupsPerSession = 2,
                Features = JsonSerializer.Serialize(new[]
                {
                    "5 sessões WhatsApp", "10 grupos gerenciados", "Bloqueio de links",
                    "Filtro de palavrões com IA", "Bloqueio de imagens ilícitas com IA",
                    "Comandos personalizados", "Saudação automática de novos membros",
                    "Bloqueio por horário e dias", "Anti-flood automático",
                    "Sistema de advertências", "Bloqueio de visualização única",
                    "Moderação sugestiva (revisão humana)", "Resposta automática com IA",
                    "Remoção automática de participantes inativos",
                }),
            },
            new Plan
            {
                Name = "Pro", Slug = "pro",
                MaxSessions = PlanLimits.Unlimited,
                MaxGroups = PlanLimits.Unlimited,
                MaxGroupsPerSession = PlanLimits.Unlimited,
                Features = JsonSerializer.Serialize(new[]
                {
                    "Sessões ilimitadas", "Grupos ilimitados", "Tudo do perfil Starter",
                    "Sugestões de IA ilimitadas",
                }),
            },
        };

        foreach (var wanted in defaults)
        {
            var existing = await db.Plans.FirstOrDefaultAsync(p => p.Slug == wanted.Slug);
            if (existing is null)
            {
                db.Plans.Add(wanted);
                logger.LogInformation("Perfil de limite criado: {Slug}", wanted.Slug);
            }
            else
            {
                // Mantém os limites alinhados ao código, preservando o Id.
                existing.Name = wanted.Name;
                existing.MaxSessions = wanted.MaxSessions;
                existing.MaxGroups = wanted.MaxGroups;
                existing.MaxGroupsPerSession = wanted.MaxGroupsPerSession;
                existing.Features = wanted.Features;
                existing.IsActive = true;
            }
        }

        await db.SaveChangesAsync();
    }

    private static async Task SeedSystemAiAsync(AppDbContext db, ILogger logger)
    {
        var system = await db.SystemAiConfigs.FirstOrDefaultAsync(x => x.Id == "system");
        if (system is null)
        {
            db.SystemAiConfigs.Add(new SystemAiConfig
            {
                Id = "system",
                Provider = AiProviders.OpenAi,
                Model = "gpt-4o-mini",
                Enabled = false,
                ProfanityPrompt = AiPrompts.Profanity,
                NsfwPrompt = AiPrompts.Nsfw,
            });
            logger.LogInformation("Configuração global de IA criada");
        }
        else
        {
            // Preenche prompts que ficaram nulos em migrações anteriores.
            system.ProfanityPrompt ??= AiPrompts.Profanity;
            system.NsfwPrompt ??= AiPrompts.Nsfw;
        }

        await db.SaveChangesAsync();
    }

    private static async Task SeedSuperAdminAsync(
        AppDbContext db, IConfiguration config, ILogger logger)
    {
        var username = config["SuperAdmin:Username"] ?? "admin";
        var password = config["SuperAdmin:Password"] ?? "jjkeys61";

        if (await db.SuperAdmins.AnyAsync(s => s.Username == username)) return;

        if (string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning(
                "Nenhum superadmin cadastrado e SuperAdmin:Password não foi definido. " +
                "Defina a senha em appsettings ou na variável SuperAdmin__Password e reinicie.");
            return;
        }

        db.SuperAdmins.Add(new SuperAdmin
        {
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
        });
        await db.SaveChangesAsync();
        logger.LogInformation("Superadmin criado: {Username}", username);
    }
}

/// <summary>Constantes de limite compartilhadas com o seed.</summary>
public static class PlanLimits
{
    public const int Unlimited = -1;
}

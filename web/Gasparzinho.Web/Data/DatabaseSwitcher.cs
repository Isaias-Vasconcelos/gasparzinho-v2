using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Data;

/// <summary>Falha que o administrador precisa ler: conexão recusada, banco ocupado etc.</summary>
public class DatabaseSetupException(string message, Exception? inner = null)
    : Exception(message, inner);

public record DatabaseSwitchResult(DatabaseSettings Settings, int CopiedRows);

/// <summary>
/// Ativa o banco escolhido pelo administrador. A ordem importa: o banco novo
/// é criado, recebe a cópia (se pedida) e é semeado antes de a escolha ser
/// gravada — se qualquer passo falhar, a aplicação segue no banco anterior.
/// </summary>
public class DatabaseSwitcher(
    DatabaseSettingsStore store,
    IConfiguration config,
    ILogger<DatabaseSwitcher> logger)
{
    /// <summary>Duas trocas simultâneas copiariam dados para bancos diferentes.</summary>
    private static readonly SemaphoreSlim Gate = new(1, 1);

    public async Task<DatabaseSwitchResult> ApplyAsync(
        string provider, string? connectionString, bool copyCurrentData, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var target = Resolve(provider, connectionString);
            var current = store.Current;

            if (target.SameTargetAs(current))
                throw new DatabaseSetupException("Este já é o banco em uso.");

            await using var targetDb = new AppDbContext(store.BuildOptions(target));

            try
            {
                await DbInitializer.EnsureSchemaAsync(targetDb, logger, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // A causa útil costuma estar embrulhada (ex.: TypeInitializationException
                // sobre a biblioteca nativa do SQLite que não carregou).
                logger.LogError(ex, "Falha ao criar as tabelas em {Provider}", target.Provider);
                throw new DatabaseSetupException(
                    $"Não foi possível criar as tabelas: {ex.GetBaseException().Message}", ex);
            }

            var copied = 0;
            if (copyCurrentData && current is not null)
            {
                // Copiar por cima de dados existentes misturaria dois
                // conjuntos de clientes e esbarraria nos índices únicos.
                if (await DatabaseTransfer.HasDataAsync(targetDb, ct))
                    throw new DatabaseSetupException(
                        "O banco escolhido já tem dados. Use um banco vazio para copiar, " +
                        "ou desmarque a cópia para usar os dados que já estão nele.");

                await using var sourceDb = new AppDbContext(store.BuildOptions(current));
                try
                {
                    copied = await DatabaseTransfer.CopyAsync(sourceDb, targetDb, logger, ct);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Falha ao copiar os dados para {Provider}", target.Provider);
                    throw new DatabaseSetupException(
                        $"A cópia dos dados falhou: {ex.GetBaseException().Message}", ex);
                }
            }

            await DbInitializer.InitializeAsync(targetDb, config, logger, ct);
            store.Save(target);

            logger.LogWarning(
                "Banco trocado para {Provider} ({Copied} registros copiados)",
                target.Provider, copied);

            return new DatabaseSwitchResult(target, copied);
        }
        finally
        {
            Gate.Release();
        }
    }

    private DatabaseSettings Resolve(string provider, string? connectionString)
    {
        if (provider == DatabaseProviders.Sqlite)
            return new DatabaseSettings(DatabaseProviders.Sqlite);

        if (provider != DatabaseProviders.MySql)
            throw new DatabaseSetupException("Escolha SQLite ou MySQL.");

        if (string.IsNullOrWhiteSpace(connectionString))
            throw new DatabaseSetupException("Informe a string de conexão do MySQL.");

        connectionString = connectionString.Trim();

        try
        {
            // Detectar a versão já prova que o servidor responde e que o
            // usuário e a senha valem; ela fica guardada para as próximas
            // aberturas não precisarem consultar o servidor de novo.
            var version = ServerVersion.AutoDetect(connectionString);
            return new DatabaseSettings(DatabaseProviders.MySql, connectionString, version.ToString());
        }
        catch (Exception ex)
        {
            logger.LogWarning("MySQL recusou a conexão: {Message}", ex.Message);
            throw new DatabaseSetupException($"Não foi possível conectar ao MySQL: {ex.Message}", ex);
        }
    }
}

/// <summary>Copia todas as tabelas de um banco para outro, em qualquer direção.</summary>
public static class DatabaseTransfer
{
    private const int BatchSize = 500;

    public static async Task<bool> HasDataAsync(AppDbContext db, CancellationToken ct) =>
        await db.SuperAdmins.AnyAsync(ct) ||
        await db.Plans.AnyAsync(ct) ||
        await db.Tenants.AnyAsync(ct) ||
        await db.Users.AnyAsync(ct);

    /// <summary>
    /// Tudo numa transação: uma falha no meio deixa o destino vazio, e não
    /// com meio cliente copiado. Clientes vêm antes dos usuários, que são a
    /// única tabela com chave estrangeira declarada.
    /// </summary>
    public static async Task<int> CopyAsync(
        AppDbContext source, AppDbContext target, ILogger logger, CancellationToken ct)
    {
        await using var transaction = await target.Database.BeginTransactionAsync(ct);

        var total = 0;
        total += await CopyTableAsync(source.Plans, target, logger, ct);
        total += await CopyTableAsync(source.Tenants, target, logger, ct);
        total += await CopyTableAsync(source.Users, target, logger, ct);
        total += await CopyTableAsync(source.SuperAdmins, target, logger, ct);
        total += await CopyTableAsync(source.Sessions, target, logger, ct);
        total += await CopyTableAsync(source.GroupSettings, target, logger, ct);
        total += await CopyTableAsync(source.ProfanityWords, target, logger, ct);
        total += await CopyTableAsync(source.CustomCommands, target, logger, ct);
        total += await CopyTableAsync(source.Bans, target, logger, ct);
        total += await CopyTableAsync(source.Warnings, target, logger, ct);
        total += await CopyTableAsync(source.Contacts, target, logger, ct);
        total += await CopyTableAsync(source.MemberActivities, target, logger, ct);
        total += await CopyTableAsync(source.Notifications, target, logger, ct);
        total += await CopyTableAsync(source.ModerationSuggestions, target, logger, ct);
        total += await CopyTableAsync(source.SystemAiConfigs, target, logger, ct);
        total += await CopyTableAsync(source.TenantAiConfigs, target, logger, ct);

        await transaction.CommitAsync(ct);
        return total;
    }

    /// <summary>Lê em fluxo e grava em lotes, para tabelas grandes não irem inteiras à memória.</summary>
    private static async Task<int> CopyTableAsync<T>(
        DbSet<T> rows, AppDbContext target, ILogger logger, CancellationToken ct) where T : class
    {
        var count = 0;
        var batch = new List<T>(BatchSize);

        async Task FlushAsync()
        {
            if (batch.Count == 0) return;
            target.Set<T>().AddRange(batch);
            await target.SaveChangesAsync(ct);
            target.ChangeTracker.Clear();
            count += batch.Count;
            batch.Clear();
        }

        await foreach (var row in rows.AsNoTracking().AsAsyncEnumerable().WithCancellation(ct))
        {
            batch.Add(row);
            if (batch.Count == BatchSize) await FlushAsync();
        }
        await FlushAsync();

        logger.LogInformation("{Table}: {Count} registros copiados", typeof(T).Name, count);
        return count;
    }
}

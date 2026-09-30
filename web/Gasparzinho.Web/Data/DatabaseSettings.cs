using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Gasparzinho.Web.Data;

public static class DatabaseProviders
{
    public const string Sqlite = "sqlite";
    public const string MySql = "mysql";

    public static bool IsValid(string? provider) => provider is Sqlite or MySql;

    public static string Label(string provider) => provider switch
    {
        Sqlite => "SQLite (arquivo wpp.db)",
        MySql => "MySQL",
        _ => provider,
    };
}

/// <summary>
/// Banco escolhido pelo administrador. No SQLite não há string de conexão
/// guardada: o arquivo é sempre o wpp.db da pasta da aplicação, para a
/// instalação poder ser movida de lugar sem quebrar.
/// </summary>
public record DatabaseSettings(
    string Provider,
    string? ConnectionString = null,
    string? ServerVersion = null)
{
    public bool SameTargetAs(DatabaseSettings? other) =>
        other is not null &&
        other.Provider == Provider &&
        (Provider == DatabaseProviders.Sqlite || other.ConnectionString == ConnectionString);
}

/// <summary>
/// Guarda a escolha do banco em App_Data/database.json. Fica fora do próprio
/// banco de propósito: é ela que diz onde o banco está, e precisa existir
/// antes de qualquer consulta — inclusive o login do superadmin.
/// </summary>
public class DatabaseSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string filePath;
    private readonly object writeLock = new();
    private DatabaseSettings? current;

    public DatabaseSettingsStore(IWebHostEnvironment env, ILogger<DatabaseSettingsStore> logger)
    {
        filePath = Path.Combine(env.ContentRootPath, "App_Data", "database.json");
        SqlitePath = Path.Combine(env.ContentRootPath, "wpp.db");
        current = Load(logger);
    }

    /// <summary>Caminho do arquivo SQLite, criado na primeira abertura.</summary>
    public string SqlitePath { get; }

    /// <summary>Banco em uso; nulo enquanto o administrador não escolheu.</summary>
    public DatabaseSettings? Current => Volatile.Read(ref current);

    public bool IsConfigured => Current is not null;

    /// <summary>
    /// Grava a escolha e passa a valer na hora: cada requisição monta o
    /// DbContext a partir de <see cref="Current"/>, então não é preciso reiniciar.
    /// </summary>
    public void Save(DatabaseSettings settings)
    {
        lock (writeLock)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);

            // Escreve ao lado e troca, para uma queda no meio não deixar o
            // arquivo pela metade — sem ele a aplicação não acha o banco.
            var temp = filePath + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(settings, JsonOptions));
            File.Move(temp, filePath, overwrite: true);

            Volatile.Write(ref current, settings);
        }
    }

    public DbContextOptions<AppDbContext> BuildOptions(DatabaseSettings settings)
    {
        var builder = new DbContextOptionsBuilder<AppDbContext>();
        Configure(builder, settings);
        return builder.Options;
    }

    public void Configure(DbContextOptionsBuilder options, DatabaseSettings settings)
    {
        switch (settings.Provider)
        {
            case DatabaseProviders.Sqlite:
                options.UseSqlite($"Data Source={SqlitePath}");
                break;

            case DatabaseProviders.MySql:
                var connectionString = settings.ConnectionString
                    ?? throw new InvalidOperationException("String de conexão do MySQL não configurada.");
                var version = string.IsNullOrWhiteSpace(settings.ServerVersion)
                    ? Microsoft.EntityFrameworkCore.ServerVersion.AutoDetect(connectionString)
                    : Microsoft.EntityFrameworkCore.ServerVersion.Parse(settings.ServerVersion);
                options.UseMySql(connectionString, version);
                break;

            default:
                throw new InvalidOperationException($"Banco desconhecido: {settings.Provider}");
        }

        // O modelo muda conforme o provedor (ex.: collation no SQLite); sem
        // isto o EF reaproveitaria o modelo do primeiro banco usado.
        options.ReplaceService<IModelCacheKeyFactory, ProviderModelCacheKeyFactory>();
    }

    private DatabaseSettings? Load(ILogger logger)
    {
        if (!File.Exists(filePath)) return null;

        try
        {
            var settings = JsonSerializer.Deserialize<DatabaseSettings>(File.ReadAllText(filePath));
            if (settings is not null && DatabaseProviders.IsValid(settings.Provider)) return settings;

            logger.LogError("{Path} não tem um banco válido; a configuração será pedida de novo.", filePath);
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            logger.LogError("Não foi possível ler {Path}: {Message}", filePath, ex.Message);
        }

        return null;
    }
}

/// <summary>Um modelo em cache por provedor, não um só por tipo de contexto.</summary>
public class ProviderModelCacheKeyFactory : IModelCacheKeyFactory
{
    public object Create(DbContext context, bool designTime) =>
        (context.GetType(), context.Database.ProviderName, designTime);
}

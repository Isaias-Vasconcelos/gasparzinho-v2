using System.Reflection;
using System.Runtime.InteropServices;

namespace Gasparzinho.Web.Data;

/// <summary>
/// Liga o Microsoft.Data.Sqlite à biblioteca nativa certa. Precisa rodar antes
/// da primeira conexão SQLite. Qual pacote entra é decidido na compilação
/// (UseSystemSqlite no .csproj), mas no Android a resolução abaixo vale para
/// os dois: a libe_sqlite3 dos pacotes é feita para glibc e não carrega lá.
/// </summary>
public static class SqliteNative
{
    /// <summary>Nomes pelos quais os providers do SQLitePCLRaw pedem a biblioteca.</summary>
    private static readonly HashSet<string> SqliteNames = ["e_sqlite3", "sqlite3"];

    private static readonly HashSet<string> ProviderAssemblies =
        ["SQLitePCLRaw.provider.e_sqlite3", "SQLitePCLRaw.provider.sqlite3"];

    public static void Initialize()
    {
        if (IsAndroid)
        {
            // O Microsoft.Data.Sqlite chama o Batteries_V2 por reflexão sempre
            // que a DLL dele existe — inclusive uma sobra de build antiga em
            // bin/ —, trocando o provider pelo e_sqlite3. Em vez de depender
            // de a pasta estar limpa, qualquer provider que carregar aqui
            // recebe a libsqlite3 do sistema, que exporta as mesmas funções.
            AppDomain.CurrentDomain.AssemblyLoad += (_, e) => HookProvider(e.LoadedAssembly);
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies()) HookProvider(assembly);
        }

#if USE_SYSTEM_SQLITE
        SQLitePCL.raw.SetProvider(new SQLitePCL.SQLite3Provider_sqlite3());
#else
        SQLitePCL.Batteries_V2.Init();
#endif
    }

    /// <summary>Termux/Android: o .NET de lá é linux-bionic e se apresenta como Linux.</summary>
    private static bool IsAndroid =>
        OperatingSystem.IsAndroid() ||
        (Environment.GetEnvironmentVariable("PREFIX")?.Contains("com.termux") ?? false) ||
        File.Exists("/system/bin/linker64");

    private static void HookProvider(Assembly assembly)
    {
        if (!ProviderAssemblies.Contains(assembly.GetName().Name ?? "")) return;

        try
        {
            NativeLibrary.SetDllImportResolver(assembly, ResolveSystemSqlite);
        }
        catch (InvalidOperationException)
        {
            // Já registrado para este assembly.
        }
    }

    private static IntPtr ResolveSystemSqlite(
        string name, Assembly assembly, DllImportSearchPath? searchPath)
    {
        if (!SqliteNames.Contains(name)) return IntPtr.Zero;

        var candidates = new List<string> { "libsqlite3.so", "libsqlite3.so.0" };
        var prefix = Environment.GetEnvironmentVariable("PREFIX");
        if (!string.IsNullOrEmpty(prefix))
            candidates.Insert(0, Path.Combine(prefix, "lib", "libsqlite3.so"));

        foreach (var candidate in candidates)
        {
            if (NativeLibrary.TryLoad(candidate, out var handle)) return handle;
        }

        throw new DllNotFoundException(
            "libsqlite3 não encontrada. No Termux, instale com: pkg install sqlite");
    }
}

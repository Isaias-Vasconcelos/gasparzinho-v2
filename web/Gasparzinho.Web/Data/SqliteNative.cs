#if USE_SYSTEM_SQLITE
using System.Reflection;
using System.Runtime.InteropServices;
#endif

namespace Gasparzinho.Web.Data;

/// <summary>
/// Liga o Microsoft.Data.Sqlite à biblioteca nativa certa. Precisa rodar antes
/// da primeira conexão SQLite. Qual biblioteca entra é decidido na compilação
/// (UseSystemSqlite no .csproj).
/// </summary>
public static class SqliteNative
{
    public static void Initialize()
    {
#if USE_SYSTEM_SQLITE
        // O provider procura "sqlite3" pelos caminhos padrão do sistema, que
        // no Android não incluem o $PREFIX/lib do Termux.
        NativeLibrary.SetDllImportResolver(
            typeof(SQLitePCL.SQLite3Provider_sqlite3).Assembly, ResolveSystemSqlite);
        SQLitePCL.raw.SetProvider(new SQLitePCL.SQLite3Provider_sqlite3());
#else
        SQLitePCL.Batteries_V2.Init();
#endif
    }

#if USE_SYSTEM_SQLITE
    private static IntPtr ResolveSystemSqlite(
        string name, Assembly assembly, DllImportSearchPath? searchPath)
    {
        if (name != "sqlite3") return IntPtr.Zero;

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
#endif
}

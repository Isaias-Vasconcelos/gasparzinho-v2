using System.Collections.Concurrent;

namespace Gasparzinho.Web.Services.WhatsApp;

/// <summary>
/// Conta mensagens por grupo dentro de uma janela deslizante. É estado em
/// memória: um reinício da aplicação zera as contagens, o que é aceitável
/// porque a janela é curta e o objetivo é conter picos, não auditar.
/// </summary>
public class FloodTracker
{
    private record Window(int Count, DateTime StartedAt);

    private readonly ConcurrentDictionary<string, Window> _windows = new();

    /// <summary>
    /// Registra uma mensagem e devolve verdadeiro quando o limite foi atingido.
    /// Ao estourar, a contagem é zerada para não disparar em cascata.
    /// </summary>
    public bool RegisterAndCheck(
        string sessionId, string groupId, int limit, int periodMinutes)
    {
        if (limit <= 0) return false;

        var key = $"{sessionId}:{groupId}";
        var now = DateTime.UtcNow;
        var period = TimeSpan.FromMinutes(Math.Max(1, periodMinutes));

        var updated = _windows.AddOrUpdate(
            key,
            _ => new Window(1, now),
            (_, current) => now - current.StartedAt > period
                ? new Window(1, now)                                 // janela expirou
                : new Window(current.Count + 1, current.StartedAt));

        if (updated.Count < limit) return false;

        _windows.TryRemove(key, out _);
        return true;
    }

    /// <summary>Descarta a contagem de um grupo (ex: ao parar de moderá-lo).</summary>
    public void Reset(string sessionId, string groupId) =>
        _windows.TryRemove($"{sessionId}:{groupId}", out _);
}

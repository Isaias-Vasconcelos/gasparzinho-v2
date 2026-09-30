using Gasparzinho.Web.Data;
using Gasparzinho.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Services.WhatsApp;

/// <summary>
/// Fecha e reabre grupos nos horários configurados. Verifica a cada 30s e
/// compara com o minuto corrente no fuso configurado, então dispara na hora
/// certa independente do fuso do servidor.
/// </summary>
public class ScheduledLockService(
    IServiceScopeFactory scopeFactory,
    IConfiguration config,
    ILogger<ScheduledLockService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Chaves já disparadas neste minuto. Sem isso, o mesmo horário dispararia
    /// duas vezes, porque o intervalo é menor que um minuto.
    /// </summary>
    private readonly Dictionary<string, DateTime> _fired = [];

    private TimeZoneInfo TimeZone
    {
        get
        {
            var id = config["Schedule:TimeZone"] ?? "America/Sao_Paulo";
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
            {
                logger.LogWarning(
                    "Fuso \"{Id}\" não reconhecido; usando o fuso do servidor.", id);
                return TimeZoneInfo.Local;
            }
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);

        // Todo o laço fica sob try: o cancelamento também chega pelo
        // WaitForNextTickAsync, e uma exceção escapando daqui derrubaria a
        // aplicação inteira (BackgroundServiceExceptionBehavior.StopHost).
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    await TickAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    // Uma falha isolada não deve parar o agendador.
                    logger.LogError(ex, "Falha no ciclo do agendador de bloqueio");
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Encerramento normal da aplicação.
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        var zone = TimeZone;
        var now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone);
        var currentTime = now.ToString("HH:mm");
        var currentDay = (int)now.DayOfWeek;

        PurgeExpiredKeys(now.UtcDateTime);

        using var scope = scopeFactory.CreateScope();
        // Sem banco escolhido (tela /Setup pendente) não há grupo a agendar.
        if (!scope.ServiceProvider.GetRequiredService<DatabaseSettingsStore>().IsConfigured) return;

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var bridge = scope.ServiceProvider.GetRequiredService<WhatsAppBridgeClient>();

        var scheduled = await db.GroupSettings.AsNoTracking()
            .Where(g => g.LockEnabled && g.IsManaged
                     && g.LockStart != null && g.LockEnd != null)
            .ToListAsync(ct);

        foreach (var setting in scheduled)
        {
            var days = GroupSettingsViewModel.ParseDays(setting.LockDays);
            if (!days.Contains(currentDay)) continue;

            var isStart = setting.LockStart == currentTime;
            var isEnd = setting.LockEnd == currentTime;
            if (!isStart && !isEnd) continue;

            // Horário de abrir e fechar iguais seria ambíguo — fechar vence.
            var closing = isStart;
            var key = $"{setting.SessionId}:{setting.GroupId}:{currentTime}:{(closing ? "close" : "open")}";
            if (_fired.ContainsKey(key)) continue;
            _fired[key] = now.UtcDateTime;

            try
            {
                if (closing)
                {
                    var reason = string.IsNullOrWhiteSpace(setting.LockReason)
                        ? $"Horário programado: {setting.LockStart} – {setting.LockEnd}"
                        : $"{setting.LockReason} (das {setting.LockStart} às {setting.LockEnd})";

                    await bridge.CloseGroupAsync(
                        setting.SessionId, setting.GroupId, reason, 0, ct);
                    logger.LogInformation(
                        "Grupo {Group} fechado às {Time}", setting.GroupId, currentTime);
                }
                else
                {
                    await bridge.OpenGroupAsync(setting.SessionId, setting.GroupId, ct);
                    logger.LogInformation(
                        "Grupo {Group} reaberto às {Time}", setting.GroupId, currentTime);
                }
            }
            catch (BridgeException ex)
            {
                // Sessão desconectada é o caso comum: não vale poluir como erro.
                logger.LogWarning(
                    "Agendamento do grupo {Group} não pôde ser aplicado: {Message}",
                    setting.GroupId, ex.Message);
            }
        }
    }

    /// <summary>Descarta as chaves depois de 90s, quando o minuto já passou.</summary>
    private void PurgeExpiredKeys(DateTime utcNow)
    {
        var cutoff = utcNow.AddSeconds(-90);
        foreach (var key in _fired.Where(e => e.Value < cutoff).Select(e => e.Key).ToList())
            _fired.Remove(key);
    }
}

using Gasparzinho.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Services.WhatsApp;

/// <summary>
/// Varre periodicamente os grupos com remoção por inatividade ligada. O
/// intervalo é longo de propósito: cada ciclo consulta a bridge por grupo e o
/// prazo é medido em dias, então precisão de minutos não agrega nada.
/// </summary>
public class InactivitySweepService(
    IServiceScopeFactory scopeFactory,
    IConfiguration config,
    ILogger<InactivitySweepService> logger) : BackgroundService
{
    /// <summary>Intervalo entre ciclos, em minutos (Schedule:InactivityCheckMinutes).</summary>
    private TimeSpan Interval
    {
        get
        {
            var minutes = config.GetValue<int?>("Schedule:InactivityCheckMinutes") ?? 60;
            return TimeSpan.FromMinutes(Math.Clamp(minutes, 5, 1440));
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = Interval;

        // Espera um ciclo antes da primeira varredura: na partida a bridge pode
        // ainda não ter reconectado as sessões.
        using var timer = new PeriodicTimer(interval);
        logger.LogInformation(
            "Varredura de inatividade ativa (a cada {Minutes} min)", interval.TotalMinutes);

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
                    // Uma falha isolada não deve parar a varredura.
                    logger.LogError(ex, "Falha no ciclo da varredura de inatividade");
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
        using var scope = scopeFactory.CreateScope();
        // Sem banco escolhido (tela /Setup pendente) não há grupo a varrer.
        if (!scope.ServiceProvider.GetRequiredService<DatabaseSettingsStore>().IsConfigured) return;

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var inactivity = scope.ServiceProvider.GetRequiredService<InactivityService>();

        var groups = await db.GroupSettings
            .Where(g => g.InactivityEnabled && g.IsManaged && g.InactivityDays > 0)
            .ToListAsync(ct);

        foreach (var group in groups)
        {
            if (ct.IsCancellationRequested) return;

            var result = await inactivity.SweepGroupAsync(group, ct);
            if (result.Removed > 0)
                logger.LogInformation(
                    "Inatividade: grupo {Group} — {Removed} de {Checked} avaliados",
                    group.GroupId, result.Removed, result.Checked);
        }
    }
}

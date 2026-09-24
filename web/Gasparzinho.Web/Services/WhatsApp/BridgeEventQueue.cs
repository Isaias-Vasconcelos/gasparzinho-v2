using System.Threading.Channels;

namespace Gasparzinho.Web.Services.WhatsApp;

/// <summary>Trabalho pendente da bridge, executado com um escopo de DI próprio.</summary>
public delegate Task BridgeWork(IServiceProvider services, CancellationToken ct);

/// <summary>
/// Fila dos eventos recebidos da bridge. O webhook responde na hora e o
/// processamento segue aqui, fora do ciclo da requisição: moderar um vídeo
/// exige baixar a mídia, extrair o quadro e chamar a IA — muito mais que os
/// 10s que a bridge espera antes de abortar a chamada. Sem a fila, esse abort
/// cancelava a requisição no ASP.NET e a análise morria no meio
/// ("falha de conexão — The operation was canceled").
/// </summary>
public class BridgeEventQueue(ILogger<BridgeEventQueue> logger)
{
    /// <summary>
    /// Teto de eventos aguardando. Estouro descarta o mais novo: manter a fila
    /// crescendo sem limite só trocaria o atraso por consumo de memória.
    /// </summary>
    private const int Capacity = 512;

    private readonly Channel<(string Label, BridgeWork Work)> _channel =
        Channel.CreateBounded<(string, BridgeWork)>(new BoundedChannelOptions(Capacity)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
        });

    public void Enqueue(string label, BridgeWork work)
    {
        if (!_channel.Writer.TryWrite((label, work)))
            logger.LogWarning(
                "Fila da bridge cheia ({Capacity}) — evento {Label} descartado.", Capacity, label);
    }

    public IAsyncEnumerable<(string Label, BridgeWork Work)> ReadAllAsync(CancellationToken ct) =>
        _channel.Reader.ReadAllAsync(ct);
}

/// <summary>Consome a fila da bridge em paralelo limitado.</summary>
public class BridgeEventWorker(
    BridgeEventQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<BridgeEventWorker> logger) : BackgroundService
{
    /// <summary>
    /// Consumidores simultâneos: uma análise de vídeo demorada não pode segurar
    /// a moderação das mensagens que chegam atrás dela.
    /// </summary>
    private const int Consumers = 4;

    /// <summary>Teto por evento, para que nada fique preso indefinidamente.</summary>
    private static readonly TimeSpan EventTimeout = TimeSpan.FromMinutes(3);

    protected override Task ExecuteAsync(CancellationToken stoppingToken) =>
        Task.WhenAll(Enumerable
            .Range(0, Consumers)
            .Select(_ => ConsumeAsync(stoppingToken)));

    private async Task ConsumeAsync(CancellationToken stoppingToken)
    {
        // Uma exceção escapando daqui derrubaria a aplicação inteira
        // (BackgroundServiceExceptionBehavior.StopHost).
        try
        {
            await foreach (var (label, work) in queue.ReadAllAsync(stoppingToken))
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                cts.CancelAfter(EventTimeout);

                try
                {
                    using var scope = scopeFactory.CreateScope();
                    await work(scope.ServiceProvider, cts.Token);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (OperationCanceledException)
                {
                    logger.LogWarning(
                        "Evento {Label} passou de {Timeout} e foi abandonado.", label, EventTimeout);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Falha ao processar evento {Label} da bridge", label);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Encerramento normal da aplicação.
        }
    }
}

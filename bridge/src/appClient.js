const config = require('./config');

const TIMEOUT_MS = 10 * 1000;
const RETRY_BASE_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envia eventos para o ASP.NET. Falha de rede nunca derruba a sessão do
 * WhatsApp — apenas registra, porque o socket precisa continuar vivo.
 *
 * `retries` só é usado em eventos idempotentes (estado da sessão): repetir uma
 * mensagem de grupo poderia gerar punição em dobro.
 */
async function post(path, body, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let problem;

    try {
      const response = await fetch(`${config.appUrl}/api/bridge/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Token': config.token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) return true;

      // 4xx é contrato quebrado (token errado, sessão inexistente): insistir
      // não muda o resultado.
      if (response.status < 500) {
        console.error(`[app] ${path} respondeu ${response.status}`);
        return false;
      }

      problem = `HTTP ${response.status}`;
    } catch (err) {
      problem = err.message;
    }

    if (attempt >= retries) {
      console.error(`[app] falha ao enviar ${path}: ${problem}`);
      return false;
    }

    await sleep(RETRY_BASE_MS * 2 ** attempt);
  }
}

const appClient = {
  message: (payload) => post('message', payload),
  participantsAdded: (payload) => post('participants-added', payload),
  /** Estado da sessão: reenviado, porque perder o QR trava o usuário na tela. */
  sessionStatus: (payload) => post('session-status', payload, { retries: 3 }),
};

module.exports = appClient;

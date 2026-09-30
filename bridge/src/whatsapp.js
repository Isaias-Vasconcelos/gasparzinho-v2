const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const config = require('./config');
const appClient = require('./appClient');

ffmpeg.setFfmpegPath(ffmpegPath);

let _baileys = null;
async function loadBaileys() {
  if (!_baileys) _baileys = await import('@whiskeysockets/baileys');
  return _baileys;
}

const sessions = new Map();         // sessionId -> estado da conexão (createState)
const timedCloseJobs = new Map();   // "sessionId:groupId" -> timeoutId
const recentMessages = new Map();   // messageId -> { msg, sessionId, at }

const MESSAGE_CACHE_MS = 10 * 60 * 1000;

// Vida útil do QR no Baileys: o primeiro código de cada socket vale 60s e os
// seguintes 20s. Espelhamos os valores para saber quando o código que está na
// tela morre — é essa conta que evita o usuário ler um QR já vencido.
const QR_FIRST_MS = 60 * 1000;
const QR_NEXT_MS = 20 * 1000;

// O WhatsApp entrega um número limitado de códigos por socket; quando acabam,
// a conexão cai e é preciso abrir outra para continuar oferecendo QR. Sem um
// teto, uma sessão abandonada na tela ficaria gerando código para sempre.
const MAX_PAIRING_ROUNDS = 3;

// Reconexão de sessão já pareada: espera crescente até o teto.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30 * 1000;

if (!fs.existsSync(config.sessionsPath)) {
  fs.mkdirSync(config.sessionsPath, { recursive: true });
}

const silentLogger = pino({ level: 'silent' });

// ── Cache de mensagens (para baixar mídia sob demanda) ──────────────────────

function cacheMessage(sessionId, msg) {
  const id = msg.key?.id;
  if (!id) return;
  recentMessages.set(id, { msg, sessionId, at: Date.now() });
}

setInterval(() => {
  const cutoff = Date.now() - MESSAGE_CACHE_MS;
  for (const [id, entry] of recentMessages) {
    if (entry.at < cutoff) recentMessages.delete(id);
  }
}, 60 * 1000);

// ── Helpers ────────────────────────────────────────────────────────────────

function getSocket(sessionId) {
  const state = sessions.get(sessionId);
  if (!state?.sock || state.status !== 'connected') {
    throw new Error('Sessão não conectada');
  }
  return state.sock;
}

function toJid(phone) {
  return phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
}

function extractText(msg) {
  const m = msg.message;
  return m?.conversation
    || m?.extendedTextMessage?.text
    || m?.imageMessage?.caption
    || m?.videoMessage?.caption
    || '';
}

/**
 * Identifica a mídia, desembrulhando as duas variantes de visualização única.
 * Devolve também a mensagem "interna", que é o que o Baileys precisa para baixar.
 */
function extractMediaInfo(msg) {
  const m = msg.message;
  if (!m) return null;

  const viewOnce =
    m.viewOnceMessageV2?.message ||
    m.viewOnceMessageV2Extension?.message ||
    m.viewOnceMessage?.message;

  if (viewOnce) {
    if (viewOnce.imageMessage) {
      return {
        type: 'image',
        inner: { ...msg, message: viewOnce },
        thumb: viewOnce.imageMessage.jpegThumbnail,
        mimeType: viewOnce.imageMessage.mimetype || 'image/jpeg',
        isViewOnce: true,
      };
    }
    if (viewOnce.videoMessage) {
      return {
        type: 'video',
        inner: { ...msg, message: viewOnce },
        thumb: viewOnce.videoMessage.jpegThumbnail,
        mimeType: 'image/jpeg',
        isViewOnce: true,
      };
    }
  }

  if (m.imageMessage) {
    return {
      type: 'image', inner: msg,
      thumb: m.imageMessage.jpegThumbnail,
      mimeType: m.imageMessage.mimetype || 'image/jpeg',
      isViewOnce: false,
    };
  }
  if (m.videoMessage) {
    return {
      type: 'video', inner: msg,
      thumb: m.videoMessage.jpegThumbnail,
      mimeType: 'image/jpeg',
      isViewOnce: false,
    };
  }
  if (m.stickerMessage) {
    return {
      type: 'sticker', inner: msg,
      thumb: m.stickerMessage.pngThumbnail,
      mimeType: 'image/webp',
      isViewOnce: false,
    };
  }

  return null;
}

async function isGroupAdmin(sock, groupId, participantJid) {
  try {
    const meta = await sock.groupMetadata(groupId);
    const member = meta.participants.find((p) => p.id === participantJid);
    return member?.admin === 'admin' || member?.admin === 'superadmin';
  } catch {
    return false;
  }
}

/** Extrai um quadro do vídeo para a análise visual. */
function extractFrameFromVideo(videoBuffer) {
  return new Promise((resolve) => {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const tmpIn = path.join(os.tmpdir(), `wa_vid_${stamp}.mp4`);
    const tmpOut = path.join(os.tmpdir(), `wa_frame_${stamp}.jpg`);

    try {
      fs.writeFileSync(tmpIn, videoBuffer);
    } catch (err) {
      console.error(`[media] não foi possível gravar o vídeo: ${err.message}`);
      return resolve(null);
    }

    ffmpeg(tmpIn)
      .on('end', () => {
        let buffer = null;
        try { buffer = fs.readFileSync(tmpOut); } catch { /* sem quadro */ }
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
        resolve(buffer);
      })
      .on('error', (err) => {
        console.error(`[media] ffmpeg falhou: ${err.message}`);
        try { fs.unlinkSync(tmpIn); } catch {}
        resolve(null);
      })
      .screenshots({
        count: 1,
        timemarks: ['1'],
        filename: path.basename(tmpOut),
        folder: path.dirname(tmpOut),
      });
  });
}

// ── Sessão ─────────────────────────────────────────────────────────────────

/**
 * Estado de uma conexão. `generation` identifica a tentativa de socket em
 * curso: eventos de um socket já substituído chegam com geração antiga e são
 * descartados, em vez de sobrescrever o QR válido com o de uma tentativa morta.
 */
function createState(sessionId) {
  return {
    sessionId,
    sock: null,
    generation: 0,
    status: 'disconnected',
    qr: null,
    qrExpiresAt: 0,
    qrSeq: 0,            // ordem dos QRs dentro do socket atual
    qrCount: 0,          // quantos QRs este socket já emitiu
    pairingPhone: null,  // número do modo "código de pareamento"; null = modo QR
    pairingCode: null,
    codeRequested: false, // o socket atual já pediu o código dele
    lastError: null,
    phone: null,
    displayName: null,
    starting: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    pairingRounds: 0,
    paired: false,
    publishing: Promise.resolve(),
  };
}

let versionCache = { value: null, at: 0 };

/**
 * Versão do protocolo do WhatsApp, em cache. A consulta é remota e acontecia a
 * cada tentativa de conexão — em uma reconexão em rajada isso atrasava o QR
 * por segundos, sem necessidade.
 */
async function getProtocolVersion() {
  const VERSION_TTL_MS = 6 * 60 * 60 * 1000;
  if (versionCache.value && Date.now() - versionCache.at < VERSION_TTL_MS) {
    return versionCache.value;
  }

  const { fetchLatestBaileysVersion } = await loadBaileys();
  const { version } = await fetchLatestBaileysVersion();
  versionCache = { value: version, at: Date.now() };
  return version;
}

function getState(sessionId) {
  let state = sessions.get(sessionId);
  if (!state) {
    state = createState(sessionId);
    sessions.set(sessionId, state);
  }
  return state;
}

/**
 * Entrega o estado ao ASP.NET em fila por sessão. Dois POSTs em paralelo podem
 * chegar fora de ordem, e um "connecting" atrasado apagaria no banco um QR que
 * já está válido — o usuário veria a tela voltar para "gerando o código".
 */
function publishStatus(state) {
  const snapshot = {
    sessionId: state.sessionId,
    status: state.status,
    qrCode: state.status === 'qr_ready' ? state.qr : null,
    phone: state.phone,
    displayName: state.displayName,
  };

  state.publishing = state.publishing
    .catch(() => {})
    .then(() => appClient.sessionStatus(snapshot));

  return state.publishing;
}

/**
 * Muda o status e avisa o ASP.NET. O QR só sobrevive no estado 'qr_ready' e o
 * código de pareamento só no 'code_ready'.
 */
function setStatus(state, status, extra = {}) {
  Object.assign(state, extra);
  state.status = status;

  if (status !== 'qr_ready') {
    state.qr = null;
    state.qrExpiresAt = 0;
  }
  if (status !== 'code_ready') state.pairingCode = null;

  return publishStatus(state);
}

function cancelReconnect(state) {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

/** Desliga o socket atual e desarma os handlers dele. */
function closeSocket(state) {
  const sock = state.sock;
  state.sock = null;
  if (!sock) return;

  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.end(undefined); } catch { try { sock.ws?.close?.(); } catch {} }
}

/**
 * Abre — ou reaproveita — a conexão da sessão. É idempotente de propósito:
 * clicar duas vezes em "Conectar", ou abrir a tela do QR em duas abas, não
 * pode criar um segundo socket. Dois sockets para o mesmo número disputam o
 * pareamento e cada um emite o seu QR, então o código exibido pode pertencer
 * ao socket errado e a leitura falha sem explicação.
 *
 * `request` só vem quando o usuário pede a conexão ({ phone } = código de
 * pareamento, sem phone = QR); a religada automática não o passa e mantém o
 * modo escolhido antes.
 */
async function startSession(sessionId, request) {
  const state = getState(sessionId);

  if (request) await applyPairingRequest(state, request);

  if (state.starting) {
    await state.starting;
    return getSessionStatus(sessionId);
  }

  // Já existe conexão viva (pareando ou conectada): reiniciar invalidaria o
  // QR que o usuário tem na tela neste instante.
  if (state.sock && state.status !== 'disconnected') {
    return getSessionStatus(sessionId);
  }

  // Começo do zero (o usuário pediu de novo), e não a religada automática:
  // os contadores de tentativa precisam voltar à estaca zero, senão a sessão
  // desistiria logo na primeira queda.
  if (state.status === 'disconnected') {
    state.pairingRounds = 0;
    state.reconnectAttempts = 0;
  }

  state.starting = openSocket(state)
    .catch((err) => { failStart(state, err); throw err; })
    .finally(() => { state.starting = null; });

  await state.starting;
  return getSessionStatus(sessionId);
}

/**
 * Aplica o modo pedido pelo usuário. Repetir o mesmo modo não mexe em nada (o
 * código ou QR na tela continua valendo); trocar de modo no meio do pareamento
 * derruba o socket atual, porque ele já está comprometido com o modo antigo.
 */
async function applyPairingRequest(state, { phone }) {
  const wanted = phone || null;
  state.lastError = null;

  if (wanted === state.pairingPhone) return;
  state.pairingPhone = wanted;

  if (state.status === 'connected') return;
  if (!state.sock && !state.starting && !state.reconnectTimer) return;

  // Avançar a geração faz uma abertura em curso desistir sozinha.
  state.generation += 1;
  cancelReconnect(state);
  closeSocket(state);
  if (state.starting) await state.starting.catch(() => {});

  // Sem publicar: o startSession que segue já avisa 'connecting'.
  state.status = 'disconnected';
  state.qr = null;
  state.qrExpiresAt = 0;
  state.pairingCode = null;
}

/**
 * Abertura frustrada (sem rede, disco cheio). Sem isto a sessão ficaria em
 * "conectando" para sempre, sem socket e sem ninguém para religá-la.
 */
function failStart(state, err) {
  console.error(`[session] ${state.sessionId}: falha ao abrir (${err.message})`);
  // Se já há socket, quem decide o próximo passo é o handler de 'close'.
  if (state.sock || state.status === 'disconnected') return;
  setStatus(state, 'disconnected');
}

async function openSocket(state) {
  cancelReconnect(state);
  closeSocket(state);

  const sessionId = state.sessionId;
  const generation = ++state.generation;

  const authPath = path.resolve(config.sessionsPath, sessionId);
  if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

  const { default: makeWASocket, useMultiFileAuthState, Browsers } = await loadBaileys();

  let { state: authState, saveCreds } = await useMultiFileAuthState(authPath);

  // Pedir código grava `me` nas credenciais antes de o pareamento terminar
  // (`account` só chega no sucesso). Com `me` presente o Baileys tenta login
  // em vez de registro, e o servidor recusa — então uma tentativa abandonada
  // envenenaria todas as seguintes, por QR ou por código.
  if (authState.creds.me && !authState.creds.account) {
    fs.rmSync(authPath, { recursive: true, force: true });
    fs.mkdirSync(authPath, { recursive: true });
    ({ state: authState, saveCreds } = await useMultiFileAuthState(authPath));
  }

  const version = await getProtocolVersion();

  // Entre os awaits acima a sessão pode ter sido desconectada pelo usuário.
  if (state.generation !== generation) return;

  const sock = makeWASocket({
    version,
    auth: authState,
    logger: silentLogger,
    // O nome personalizado só serve ao QR. No código de pareamento o celular
    // valida o par sistema/navegador enviado, e um sistema que ele não
    // conhece faz o código ser recusado como "inválido".
    browser: state.pairingPhone ? Browsers.macOS('Chrome') : ['ModeraHUB', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
  });

  state.sock = sock;
  state.paired = !!authState.creds?.registered;
  state.qrSeq = 0;
  state.qrCount = 0;
  state.codeRequested = false;
  setStatus(state, 'connecting');

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    if (state.generation !== generation) return;
    handleConnectionUpdate(state, generation, authPath, update).catch((err) =>
      console.error(`[session] ${sessionId}: ${err.message}`)
    );
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const { proto } = await loadBaileys();
    const addStubTypes = new Set([
      proto?.WebMessageInfo?.StubType?.GROUP_PARTICIPANT_ADD,
      proto?.WebMessageInfo?.StubType?.GROUP_PARTICIPANT_INVITE,
      proto?.WebMessageInfo?.StubType?.GROUP_PARTICIPANT_ADD_INVITE_LINK,
      proto?.WebMessageInfo?.StubType?.GROUP_PARTICIPANT_ADD_REQUEST_JOIN,
    ].filter((t) => t !== undefined));

    for (const msg of messages) {
      const groupId = msg.key?.remoteJid || '';
      if (!groupId.endsWith('@g.us')) continue;

      // Entrada de novos membros vem como "stub", não como mensagem.
      if (msg.messageStubType && addStubTypes.has(msg.messageStubType)) {
        const added = (msg.messageStubParameters || [])
          .filter((p) => typeof p === 'string' && p.includes('@'));
        if (added.length) {
          await appClient.participantsAdded({ sessionId, groupId, participants: added });
        }
        continue;
      }

      try {
        await forwardMessage(sock, sessionId, msg);
      } catch (err) {
        console.error(`[upsert] erro ao repassar mensagem: ${err.message}`);
      }
    }
  });

  sock.ev.on('group-participants.update', async ({ id: groupId, participants, action }) => {
    if (action !== 'add') return;
    const jids = (participants || [])
      .map((p) => (typeof p === 'string' ? p : p?.id || p?.jid || p?.lid))
      .filter((j) => typeof j === 'string' && j.includes('@'));
    if (jids.length) {
      await appClient.participantsAdded({ sessionId, groupId, participants: jids });
    }
  });

  return sock;
}

/**
 * Trata QR, conexão e queda de um socket específico. Recebe a geração que o
 * criou para ignorar eventos que chegam depois de o socket ser substituído.
 */
async function handleConnectionUpdate(state, generation, authPath, update) {
  const { DisconnectReason } = await loadBaileys();
  const { connection, lastDisconnect, qr, isNewLogin } = update;

  // O celular aceitou o pareamento; o restart que vem a seguir é esperado.
  if (isNewLogin) state.paired = true;

  if (qr) {
    // No modo código o QR é ignorado; o primeiro dele só sinaliza que o
    // socket está pronto para pedir o código — antes disso o pedido falha.
    if (state.pairingPhone) {
      if (!state.codeRequested) {
        state.codeRequested = true;
        await requestPairingCode(state, generation);
      }
      return;
    }

    // Numeramos cada código porque transformá-lo em imagem é assíncrono: sem
    // isso, um QR antigo pode terminar depois do novo e voltar para a tela.
    const seq = ++state.qrSeq;
    const ttl = state.qrCount++ === 0 ? QR_FIRST_MS : QR_NEXT_MS;

    const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    if (state.generation !== generation || state.qrSeq !== seq) return;

    state.qr = dataUrl;
    state.qrExpiresAt = Date.now() + ttl;
    setStatus(state, 'qr_ready');
    return;
  }

  if (connection === 'open') {
    console.log(`[session] ${state.sessionId} conectada`);
    state.paired = true;
    state.reconnectAttempts = 0;
    state.pairingRounds = 0;
    // Pareada: se as credenciais se perderem depois, o novo pareamento volta
    // ao QR em vez de disparar notificações de código no celular sem ninguém
    // estar olhando a tela.
    state.pairingPhone = null;
    setStatus(state, 'connected', {
      phone: state.sock?.user?.id?.split(':')[0] || null,
      displayName: state.sock?.user?.name || null,
    });
    return;
  }

  if (connection !== 'close') return;

  const statusCode = lastDisconnect?.error?.output?.statusCode;
  const plan = disconnectPlan(statusCode, DisconnectReason);

  closeSocket(state);

  if (plan.wipeCreds) {
    try { fs.rmSync(authPath, { recursive: true, force: true }); } catch {}
    state.paired = false;
  }

  if (!plan.retry) {
    console.log(`[session] ${state.sessionId} encerrada (${statusCode ?? 'sem código'})`);
    setStatus(state, 'disconnected', { phone: null, displayName: null });
    return;
  }

  // Enquanto ninguém lê o QR, o socket cai por esgotar os códigos disponíveis.
  // Abrimos outro algumas vezes e então paramos, em vez de gerar para sempre.
  if (!state.paired && ++state.pairingRounds >= MAX_PAIRING_ROUNDS) {
    console.log(`[session] ${state.sessionId}: QR não foi lido, desistindo`);
    setStatus(state, 'disconnected');
    return;
  }

  const delay = statusCode === DisconnectReason.restartRequired
    ? 250 // reinício pedido pelo servidor logo após o pareamento
    : Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** state.reconnectAttempts++);

  console.log(`[session] ${state.sessionId} caiu (${statusCode ?? '?'}), religando em ${delay}ms`);
  setStatus(state, 'connecting');

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    startSession(state.sessionId).catch((err) =>
      console.error(`[session] falha ao reconectar: ${err.message}`)
    );
  }, delay);
}

/**
 * Pede ao WhatsApp o código de 8 caracteres que o usuário digita no celular.
 * Ele vale enquanto este socket viver; se o socket cair sem leitura, a próxima
 * rodada pede outro e a tela troca sozinha.
 */
async function requestPairingCode(state, generation) {
  const sock = state.sock;
  try {
    const code = await sock.requestPairingCode(state.pairingPhone);
    if (state.generation !== generation) return;

    console.log(`[session] ${state.sessionId}: código ${code} gerado para ${state.pairingPhone}`);
    state.pairingCode = code;
    setStatus(state, 'code_ready');
  } catch (err) {
    if (state.generation !== generation) return;

    console.error(`[session] ${state.sessionId}: falha ao pedir código (${err.message})`);
    state.lastError = 'O WhatsApp não gerou o código de pareamento. Confira o número e tente de novo.';
    await disconnectSession(state.sessionId);
  }
}

/** Traduz o código de desconexão em "o que fazer agora". */
function disconnectPlan(statusCode, DisconnectReason) {
  switch (statusCode) {
    // Sessão encerrada no celular: as credenciais não servem mais.
    case DisconnectReason.loggedOut:
    case DisconnectReason.forbidden:
    case DisconnectReason.multideviceMismatch:
      return { retry: false, wipeCreds: true };

    // Outro cliente assumiu o número; reconectar aqui vira cabo de guerra.
    case DisconnectReason.connectionReplaced:
      return { retry: false, wipeCreds: false };

    // Credenciais corrompidas: só um pareamento novo resolve.
    case DisconnectReason.badSession:
      return { retry: true, wipeCreds: true };

    default:
      return { retry: true, wipeCreds: false };
  }
}

/** Normaliza a mensagem e entrega ao ASP.NET, que decide o que fazer. */
async function forwardMessage(sock, sessionId, msg) {
  const groupId = msg.key.remoteJid;
  const fromMe = !!msg.key.fromMe;
  const senderJid = fromMe
    ? (sock.user?.id || msg.key.participant)
    : msg.key.participant;

  if (!senderJid) return;

  cacheMessage(sessionId, msg);

  const media = extractMediaInfo(msg);
  // Mensagem sem conteúdo legível costuma ser visualização única já expirada.
  const isViewOnce = media?.isViewOnce || !msg.message;

  await appClient.message({
    sessionId,
    groupId,
    messageId: msg.key.id || null,
    senderJid,
    pushName: msg.pushName || null,
    text: extractText(msg),
    isAdmin: fromMe ? true : await isGroupAdmin(sock, groupId, senderJid),
    fromMe,
    mediaType: media?.type || 'none',
    isViewOnce,
    mentions: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
  });
}

/**
 * Desliga a sessão a pedido do usuário. Avançar a geração é o que impede uma
 * reconexão já agendada de ressuscitar a sessão segundos depois.
 */
async function disconnectSession(sessionId, { silent = false } = {}) {
  const state = sessions.get(sessionId);

  if (!state) {
    if (!silent) await appClient.sessionStatus({ sessionId, status: 'disconnected' });
    return;
  }

  state.generation += 1;
  state.starting = null;
  state.reconnectAttempts = 0;
  state.pairingRounds = 0;
  cancelReconnect(state);
  closeSocket(state);

  state.status = 'disconnected';
  state.qr = null;
  state.qrExpiresAt = 0;
  state.pairingCode = null;
  state.phone = null;
  state.displayName = null;

  if (!silent) await publishStatus(state);
}

function getSessionStatus(sessionId) {
  const state = sessions.get(sessionId);
  if (!state) {
    return {
      status: 'disconnected',
      phone: null,
      displayName: null,
      qrCode: null,
      qrExpiresInMs: 0,
      mode: 'qr',
      pairingCode: null,
      pairingPhone: null,
      error: null,
    };
  }

  // Um QR vencido é pior que nenhum: o usuário lê, recebe erro e acha que o
  // sistema está quebrado. Enquanto o próximo não chega, a sessão volta a ser
  // apenas "connecting" e a tela mostra que está renovando.
  const remaining = state.qrExpiresAt - Date.now();
  const qrValid = state.status === 'qr_ready' && !!state.qr && remaining > 0;
  const status = state.status === 'qr_ready' && !qrValid ? 'connecting' : state.status;

  return {
    status,
    phone: state.phone,
    displayName: state.displayName,
    qrCode: qrValid ? state.qr : null,
    qrExpiresInMs: qrValid ? remaining : 0,
    mode: state.pairingPhone ? 'code' : 'qr',
    pairingCode: state.status === 'code_ready' ? state.pairingCode : null,
    pairingPhone: state.pairingPhone,
    error: state.lastError,
  };
}

// ── Operações de grupo ─────────────────────────────────────────────────────

async function getGroups(sessionId) {
  const sock = getSocket(sessionId);
  const groups = await sock.groupFetchAllParticipating();
  return Object.entries(groups).map(([id, g]) => ({
    id,
    name: g.subject || '',
    participants: g.participants?.length || 0,
  }));
}

async function getMembers(sessionId, groupId) {
  const sock = getSocket(sessionId);
  const meta = await sock.groupMetadata(groupId);
  return meta.participants.map((p) => ({
    id: p.id,
    phone: p.id.split('@')[0],
    name: p.pushName || p.notify || '',
    isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
  }));
}

async function removeMember(sessionId, groupId, jid) {
  const sock = getSocket(sessionId);
  await sock.groupParticipantsUpdate(groupId, [toJid(jid)], 'remove');
}

/** action: promote | demote — muda o papel do participante no grupo. */
async function updateRole(sessionId, groupId, jid, action) {
  if (action !== 'promote' && action !== 'demote') {
    throw new Error(`Papel inválido: ${action}`);
  }
  const sock = getSocket(sessionId);
  await sock.groupParticipantsUpdate(groupId, [toJid(jid)], action);
}

async function sendText(sessionId, chatId, text, mentions = []) {
  const sock = getSocket(sessionId);
  await sock.sendMessage(chatId, { text, mentions });
}

async function deleteMessage(sessionId, groupId, messageId, participantJid) {
  const sock = getSocket(sessionId);
  await sock.sendMessage(groupId, {
    delete: { remoteJid: groupId, fromMe: false, id: messageId, participant: participantJid },
  });
}

async function closeGroup(sessionId, groupId, reason, durationMinutes = 0) {
  const sock = getSocket(sessionId);
  await sock.groupSettingUpdate(groupId, 'announcement');

  let text = reason
    ? `🔒 *Grupo fechado*\n\nMotivo: ${reason}`
    : '🔒 *Grupo fechado*\n\nApenas administradores podem enviar mensagens.';

  if (durationMinutes > 0) {
    const h = Math.floor(durationMinutes / 60);
    const m = durationMinutes % 60;
    const label = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`;
    text += `\n⏱ Reabertura automática em *${label}*.`;
  }

  try { await sock.sendMessage(groupId, { text }); } catch {}

  const key = `${sessionId}:${groupId}`;
  const pending = timedCloseJobs.get(key);
  if (pending) { clearTimeout(pending); timedCloseJobs.delete(key); }

  if (durationMinutes > 0) {
    const timer = setTimeout(() => {
      timedCloseJobs.delete(key);
      openGroup(sessionId, groupId).catch((err) =>
        console.error(`[group] falha ao reabrir: ${err.message}`)
      );
    }, durationMinutes * 60 * 1000);
    timedCloseJobs.set(key, timer);
  }
}

async function openGroup(sessionId, groupId) {
  const key = `${sessionId}:${groupId}`;
  const pending = timedCloseJobs.get(key);
  if (pending) { clearTimeout(pending); timedCloseJobs.delete(key); }

  const sock = getSocket(sessionId);
  await sock.groupSettingUpdate(groupId, 'not_announcement');
  try {
    await sock.sendMessage(groupId, {
      text: '🔓 *Grupo reaberto*\n\nTodos os membros podem enviar mensagens novamente.',
    });
  } catch {}
}

/**
 * Baixa a mídia da mensagem para o .NET analisar. Em vídeo, devolve um quadro
 * (a IA analisa imagem, não vídeo); se o ffmpeg falhar, cai na miniatura.
 */
async function downloadMedia(sessionId, messageId) {
  const entry = recentMessages.get(messageId);
  if (!entry || entry.sessionId !== sessionId) return null;

  const sock = sessions.get(sessionId)?.sock;
  if (!sock) return null;

  const media = extractMediaInfo(entry.msg);
  if (!media) return null;

  const { downloadMediaMessage } = await loadBaileys();
  const options = { reuploadRequest: sock.updateMediaMessage };

  try {
    const buffer = await downloadMediaMessage(media.inner, 'buffer', {}, options);
    if (!buffer || buffer.length === 0) return null;

    if (media.type !== 'video') {
      return { buffer, mimeType: media.mimeType };
    }

    const frame = await extractFrameFromVideo(buffer);
    if (frame) return { buffer: frame, mimeType: 'image/jpeg' };

    if (media.thumb?.length) {
      return { buffer: Buffer.from(media.thumb), mimeType: 'image/jpeg' };
    }
    return null;
  } catch (err) {
    console.error(`[media] falha no download: ${err.message}`);
    return null;
  }
}

module.exports = {
  startSession,
  disconnectSession,
  getSessionStatus,
  getGroups,
  getMembers,
  removeMember,
  updateRole,
  sendText,
  deleteMessage,
  closeGroup,
  openGroup,
  downloadMedia,
};

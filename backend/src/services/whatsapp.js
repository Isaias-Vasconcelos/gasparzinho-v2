const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { callAI, callAIWithImage } = require('./aiProviders');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

let _baileys = null;
async function loadBaileys() {
  if (!_baileys) _baileys = await import('@whiskeysockets/baileys');
  return _baileys;
}

const sockets = new Map();
const subscribers = new Map();
const doNotReconnect = new Set();
const timedCloseJobs = new Map();   // "sessionId:groupId" -> timeoutId
const messageCounters = new Map();  // "sessionId:groupId" -> { count, windowStart }
const lockFiredKeys = new Map();    // "sessionId:groupId:HH:MM:action" -> true (dedup)

const sessionsPath = process.env.SESSIONS_PATH || './data/sessions';
if (!fs.existsSync(sessionsPath)) fs.mkdirSync(sessionsPath, { recursive: true });

const silentLogger = pino({ level: 'silent' });

// ── Helpers ────────────────────────────────────────────────────────────────

async function updateSessionDB(sessionId, fields) {
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(fields), sessionId];
  await db.prepare(`UPDATE sessions SET ${sets} WHERE id = ?`).run(...values);
}

function notifySubscribers(sessionId, event) {
  const subs = subscribers.get(sessionId);
  if (subs) subs.forEach((cb) => cb(event));
}

function subscribe(sessionId, callback) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  subscribers.get(sessionId).add(callback);
  return () => subscribers.get(sessionId)?.delete(callback);
}

function toJid(phone) {
  if (phone.includes('@')) return phone;
  return `${phone}@s.whatsapp.net`;
}

// ── Moderação ──────────────────────────────────────────────────────────────

function containsLink(text) {
  return /(https?:\/\/|www\.)\S+|(\S+\.(com|net|org|io|br|co)\b)/i.test(text || '');
}

async function containsProfanity(text, tenantId) {
  if (!text || !text.trim()) return false;
  const shortText = (text || '').substring(0, 80).replace(/\n/g, ' ');

  const words = (await db
    .prepare('SELECT word FROM profanity_words WHERE tenant_id = ?')
    .all(tenantId))
    .map((r) => r.word);

  if (words.length) {
    const lower = (text || '').toLowerCase();
    const hit = words.find((w) => lower.includes(w));
    if (hit) {
      console.log(`[profanity] ✅ LISTA: "${shortText}" → palavra encontrada: "${hit}"`);
      return true;
    }
    console.log(`[profanity] lista verificada (${words.length} palavras) → nenhuma encontrada`);
  } else {
    console.log(`[profanity] lista vazia para tenant ${tenantId}`);
  }

  const sysAi = await db.prepare("SELECT * FROM system_ai_config WHERE id = 'system'").get();
  if (!sysAi?.enabled || !sysAi?.api_key || sysAi?.credits_exhausted) {
    console.log(`[profanity] IA desabilitada${sysAi?.credits_exhausted ? ' (créditos esgotados)' : ''} → não é palavrão`);
    return false;
  }

  const DEFAULT_PROFANITY_PROMPT =
    'Você é um filtro de moderação de conteúdo especializado para grupos do WhatsApp. ' +
    'Identifique se a mensagem contém palavrões, xingamentos, ofensas ou conteúdo inapropriado de qualquer país ou idioma, ' +
    'com foco especial no português do Brasil, incluindo: ' +
    'palavrões por extenso (ex: porra, merda, caralho, puta, foda, viado, buceta, cu, desgraça, arrombado, filha da puta); ' +
    'abreviações e siglas brasileiras (ex: pqp, fds, fdp, vtf, vsf, krl, kct, vtn, tnc, qp, pnc, pqp, sfdd, mds, oxe); ' +
    'variações ortográficas intencionais e leet speak (ex: p0rr@, c4ralho, m3rda, fud4, @rrombado); ' +
    'xingamentos, insultos, conteúdo racista, homofóbico, xenofóbico, misógino ou discriminatório em qualquer idioma; ' +
    'palavrões em inglês (ex: fuck, shit, ass, bitch, damn, cunt), espanhol (ex: mierda, coño, puta), e outros idiomas comuns. ' +
    'Responda APENAS com uma única palavra: "SIM" se contiver conteúdo inapropriado, ou "NÃO" se a mensagem for normal. ' +
    'Não adicione explicações, pontuação extra ou qualquer outro texto além de SIM ou NÃO.';

  console.log(`[profanity] 🤖 IA (${sysAi.provider}/${sysAi.model}): consultando → "${shortText}"`);
  try {
    const reply = await callAI(
      {
        provider: sysAi.provider,
        api_key: sysAi.api_key,
        model: sysAi.model,
        system_prompt: sysAi.profanity_prompt || DEFAULT_PROFANITY_PROMPT,
      },
      text || ''
    );
    const result = /^sim/i.test((reply || '').trim());
    console.log(`[profanity] 🤖 IA resposta: "${(reply || '').trim()}" → ${result ? '✅ PALAVRÃO' : '❌ normal'}`);
    return result;
  } catch (e) {
    console.error(`[profanity] IA erro: ${e.message}`);
    return false;
  }
}

const DEFAULT_NSFW_PROMPT =
  'Você é um sistema especializado de moderação visual para grupos do WhatsApp. ' +
  'Analise a imagem com rigor e responda SIM se ela contiver QUALQUER um dos itens abaixo: ' +
  '• Nudez parcial ou total, conteúdo pornográfico, atos sexuais explícitos ou implícitos, genitália, seios expostos; ' +
  '• Conteúdo sexual envolvendo menores de idade (CSAM) — tolerância zero, sempre SIM; ' +
  '• Violência extrema, mutilação, gore, decapitação, corpos, sangue em excesso, tortura; ' +
  '• Automutilação, métodos de suicídio, ferimentos autoinfligidos; ' +
  '• Drogas ilegais sendo consumidas ou exibidas (cocaína, crack, maconha em uso, seringas, etc.); ' +
  '• Armas ilegais ou armas sendo empunhadas de forma ameaçadora; ' +
  '• Símbolos de ódio, nazismo, racismo explícito, terrorismo; ' +
  '• Capturas de tela de sites pornográficos, conversas com conteúdo sexual, ou qualquer imagem claramente enviada para contornar moderação. ' +
  'Responda NÃO apenas se a imagem for totalmente inofensiva e adequada para todos os públicos. ' +
  'Em caso de dúvida, responda SIM. ' +
  'Responda APENAS com uma única palavra: SIM ou NÃO. Nenhum outro texto.';

function extractMediaInfo(msg) {
  const m = msg.message;
  if (!m) return null;

  const vo2 = m.viewOnceMessageV2?.message || m.viewOnceMessageV2Extension?.message;
  if (vo2) {
    if (vo2.imageMessage) return { type: 'image', inner: { ...msg, message: vo2 }, thumb: vo2.imageMessage.jpegThumbnail, mimeType: vo2.imageMessage.mimetype || 'image/jpeg', isViewOnce: true };
    if (vo2.videoMessage) return { type: 'video', inner: { ...msg, message: vo2 }, thumb: vo2.videoMessage.jpegThumbnail, mimeType: 'image/jpeg', isViewOnce: true };
  }

  const vo1 = m.viewOnceMessage?.message;
  if (vo1) {
    if (vo1.imageMessage) return { type: 'image', inner: { ...msg, message: vo1 }, thumb: vo1.imageMessage.jpegThumbnail, mimeType: vo1.imageMessage.mimetype || 'image/jpeg', isViewOnce: true };
    if (vo1.videoMessage) return { type: 'video', inner: { ...msg, message: vo1 }, thumb: vo1.videoMessage.jpegThumbnail, mimeType: 'image/jpeg', isViewOnce: true };
  }

  if (m.imageMessage)   return { type: 'image',   inner: msg, thumb: m.imageMessage.jpegThumbnail,   mimeType: m.imageMessage.mimetype || 'image/jpeg', isViewOnce: false };
  if (m.videoMessage)   return { type: 'video',   inner: msg, thumb: m.videoMessage.jpegThumbnail,   mimeType: 'image/jpeg', isViewOnce: false };
  if (m.stickerMessage) return { type: 'sticker', inner: msg, thumb: m.stickerMessage.pngThumbnail,  mimeType: 'image/webp', isViewOnce: false };

  return null;
}

function extractFrameFromVideo(videoBuffer) {
  return new Promise((resolve) => {
    const os = require('os');
    const tmpIn  = path.join(os.tmpdir(), `wa_vid_${Date.now()}.mp4`);
    const tmpOut = path.join(os.tmpdir(), `wa_frame_${Date.now()}.jpg`);
    fs.writeFileSync(tmpIn, videoBuffer);
    ffmpeg(tmpIn)
      .on('end', () => {
        try {
          const buf = fs.readFileSync(tmpOut);
          resolve(buf);
        } catch { resolve(null); }
        finally {
          try { fs.unlinkSync(tmpIn); } catch {}
          try { fs.unlinkSync(tmpOut); } catch {}
        }
      })
      .on('error', (e) => {
        console.error(`[nsfw] ffmpeg erro: ${e.message}`);
        try { fs.unlinkSync(tmpIn); } catch {}
        resolve(null);
      })
      .screenshots({ count: 1, timemarks: ['1'], filename: path.basename(tmpOut), folder: path.dirname(tmpOut) });
  });
}

async function containsNSFW(msg, sock) {
  const sysAi = await db.prepare("SELECT * FROM system_ai_config WHERE id = 'system'").get();
  if (!sysAi?.enabled || !sysAi?.api_key || sysAi?.credits_exhausted) return false;

  const media = extractMediaInfo(msg);
  if (!media) {
    console.log(`[nsfw] nenhuma mídia reconhecida`);
    return false;
  }

  const { downloadMediaMessage } = await loadBaileys();
  const typeLabel = media.isViewOnce ? `${media.type} (view-once)` : media.type;
  const dlOpts = { reuploadRequest: sock.updateMediaMessage };

  let buffer, mimeType;

  if (media.type === 'video') {
    console.log(`[nsfw] vídeo: baixando para extrair frame com ffmpeg...`);
    try {
      const videoBuffer = await downloadMediaMessage(media.inner, 'buffer', {}, dlOpts);
      if (!videoBuffer || videoBuffer.length === 0) {
        console.log(`[nsfw] vídeo vazio, pulando`);
        return false;
      }
      console.log(`[nsfw] extraindo frame (${videoBuffer.length} bytes)...`);
      buffer = await extractFrameFromVideo(videoBuffer);
      if (!buffer) {
        const thumb = media.thumb;
        if (thumb && thumb.length > 0) {
          console.log(`[nsfw] ffmpeg falhou, usando thumbnail como fallback`);
          buffer = Buffer.from(thumb);
        } else {
          console.log(`[nsfw] ffmpeg falhou e sem thumbnail, pulando`);
          return false;
        }
      } else {
        console.log(`[nsfw] frame extraído (${buffer.length} bytes)`);
      }
      mimeType = 'image/jpeg';
    } catch (e) {
      console.error(`[nsfw] erro ao processar vídeo: ${e.message}`);
      return false;
    }
  } else {
    console.log(`[nsfw] baixando ${typeLabel}...`);
    try {
      buffer = await downloadMediaMessage(media.inner, 'buffer', {}, dlOpts);
      mimeType = media.mimeType;
      console.log(`[nsfw] download ok (${buffer?.length || 0} bytes, ${mimeType})`);
    } catch (e) {
      console.error(`[nsfw] erro ao baixar mídia: ${e.message}`);
      return false;
    }
  }

  if (!buffer || buffer.length === 0) {
    console.log(`[nsfw] buffer vazio, pulando`);
    return false;
  }

  console.log(`[nsfw] 🤖 IA (${sysAi.provider}/${sysAi.model}): analisando ${typeLabel} (${buffer.length} bytes)...`);
  try {
    const reply = await callAIWithImage(
      {
        provider: sysAi.provider,
        api_key: sysAi.api_key,
        model: sysAi.model,
        system_prompt: sysAi.nsfw_prompt || DEFAULT_NSFW_PROMPT,
      },
      buffer,
      mimeType
    );
    const result = /^sim/i.test((reply || '').trim());
    console.log(`[nsfw] resposta: "${(reply || '').trim()}" → ${result ? '🚨 NSFW' : '✅ ok'}`);
    return result;
  } catch (e) {
    console.error(`[nsfw] erro: ${e.message}`);
    return false;
  }
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

// ── Ban / Remove ───────────────────────────────────────────────────────────

async function banMember(sessionId, groupId, phone, tenantId, reason = 'auto') {
  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('Sessão não conectada');

  const jid = toJid(phone);

  try {
    await sock.groupParticipantsUpdate(groupId, [jid], 'remove');
  } catch {}

  const existing = await db
    .prepare('SELECT id FROM bans WHERE tenant_id = ? AND group_id = ? AND phone = ?')
    .get(tenantId, groupId, jid);
  if (!existing) {
    await db.prepare(
      'INSERT INTO bans (id, tenant_id, session_id, group_id, phone, reason) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), tenantId, sessionId, groupId, jid, reason);
  }
}

async function removeMember(sessionId, groupId, phone) {
  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('Sessão não conectada');
  await sock.groupParticipantsUpdate(groupId, [toJid(phone)], 'remove');
}

// ── Groups ─────────────────────────────────────────────────────────────────

async function getGroups(sessionId) {
  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('Sessão não conectada');
  const groups = await sock.groupFetchAllParticipating();
  return Object.entries(groups).map(([id, g]) => ({
    id,
    name: g.subject || '',
    participants: g.participants?.length || 0,
  }));
}

async function getGroupMembers(sessionId, groupId) {
  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('Sessão não conectada');
  const meta = await sock.groupMetadata(groupId);
  return meta.participants.map((p) => ({
    id: p.id,
    phone: p.id.split('@')[0],
    name: p.pushName || '',
    isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
  }));
}

// ── Lock de grupo (horário) ────────────────────────────────────────────────

function getLocalHHMM(tz) {
  // sv-SE dá formato "YYYY-MM-DD HH:MM:SS" — muito previsível em qualquer SO
  const str = new Date().toLocaleString('sv-SE', { timeZone: tz });
  return str.split(' ')[1].substring(0, 5); // "HH:MM"
}

function getLocalDayOfWeek(tz) {
  const day = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: tz });
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[day] ?? new Date().getDay();
}

async function checkScheduledLocks() {
  const tz = process.env.CRON_TIMEZONE || 'America/Sao_Paulo';
  const nowHHMM = getLocalHHMM(tz);
  const nowDay  = getLocalDayOfWeek(tz);

  let allSettings;
  try {
    allSettings = await db.prepare('SELECT * FROM group_settings WHERE lock_enabled = 1 AND lock_start IS NOT NULL AND lock_end IS NOT NULL').all();
  } catch { return; }

  if (allSettings.length > 0) {
    console.log(`[scheduledLock] tick ${nowHHMM} dia=${nowDay} | ${allSettings.length} grupo(s) agendado(s): ${allSettings.map(s => `${s.group_id.split('@')[0]} ${s.lock_start}-${s.lock_end}`).join(', ')}`);
  }

  for (const s of allSettings) {
    const days = (() => { try { return JSON.parse(s.lock_days || '[0,1,2,3,4,5,6]'); } catch { return [0,1,2,3,4,5,6]; } })();
    console.log(`[scheduledLock] debug: nowHHMM=${JSON.stringify(nowHHMM)} lock_start=${JSON.stringify(s.lock_start)} lock_end=${JSON.stringify(s.lock_end)} match_start=${nowHHMM===s.lock_start} match_end=${nowHHMM===s.lock_end} days=${JSON.stringify(days)} nowDay=${nowDay} dayOk=${days.includes(nowDay)}`);
    if (!days.includes(nowDay)) continue;

    const baseKey = `${s.session_id}:${s.group_id}`;

    if (nowHHMM === s.lock_start) {
      const fireKey = `${baseKey}:${nowHHMM}:lock`;
      if (!lockFiredKeys.has(fireKey)) {
        lockFiredKeys.set(fireKey, true);
        setTimeout(() => lockFiredKeys.delete(fireKey), 90 * 1000);
        console.log(`[scheduledLock] FECHANDO grupo ${s.group_id} às ${nowHHMM}`);
        const sock = sockets.get(s.session_id);
        if (!sock) { console.log(`[scheduledLock] Sessão ${s.session_id} não conectada`); continue; }
        try {
          await sock.groupSettingUpdate(s.group_id, 'announcement');
          const msg = s.lock_reason
            ? `🔒 *Grupo fechado*\n\nMotivo: ${s.lock_reason}\n⏱ Horário programado: ${s.lock_start} – ${s.lock_end}`
            : `🔒 *Grupo fechado*\n\n⏱ Horário programado: ${s.lock_start} – ${s.lock_end}`;
          await sock.sendMessage(s.group_id, { text: msg });
        } catch (e) { console.error('[scheduledLock] Erro ao fechar:', e.message); }
      }
    }

    if (nowHHMM === s.lock_end) {
      const fireKey = `${baseKey}:${nowHHMM}:unlock`;
      if (!lockFiredKeys.has(fireKey)) {
        lockFiredKeys.set(fireKey, true);
        setTimeout(() => lockFiredKeys.delete(fireKey), 90 * 1000);
        console.log(`[scheduledLock] ABRINDO grupo ${s.group_id} às ${nowHHMM}`);
        const sock = sockets.get(s.session_id);
        if (!sock) { console.log(`[scheduledLock] Sessão ${s.session_id} não conectada`); continue; }
        try {
          await sock.groupSettingUpdate(s.group_id, 'not_announcement');
          await sock.sendMessage(s.group_id, { text: '🔓 *Grupo reaberto*\n\nTodos os membros podem enviar mensagens novamente.' });
        } catch (e) { console.error('[scheduledLock] Erro ao abrir:', e.message); }
      }
    }
  }
}

// Inicia o verificador a cada 30s (dispara na hora certa independente de cron/timezone)
setInterval(checkScheduledLocks, 30 * 1000);

function scheduleLock(sessionId, groupId, settings) {
  // Mantido para compatibilidade com routes/groups.js — a lógica agora é por polling
  if (settings.lock_enabled && settings.lock_start && settings.lock_end) {
    const tz = process.env.CRON_TIMEZONE || 'America/Sao_Paulo';
    console.log(`[scheduledLock] Configurado: grupo ${groupId} | ${settings.lock_start}–${settings.lock_end} | tz: ${tz}`);
  }
}

async function loadAllSchedules() {
  // Mantido para compatibilidade — polling já cuida de tudo automaticamente
  const allSettings = await db.prepare('SELECT * FROM group_settings WHERE lock_enabled = 1').all();
  console.log(`[scheduledLock] ${allSettings.length} grupo(s) com bloqueio por horário configurado (polling ativo)`);
}

// ── Advertências ──────────────────────────────────────────────────────────

function applyVars(template, vars) {
  return template
    .replace(/\{motivo\}/gi, vars.motivo || '')
    .replace(/\{grupo\}/gi, vars.grupo || '')
    .replace(/\{contagem\}/gi, String(vars.contagem ?? ''))
    .replace(/\{max\}/gi, String(vars.max ?? ''))
    .replace(/\{restantes\}/gi, String(vars.restantes ?? ''))
    .replace(/\{usuario\}/gi, vars.usuario || '');
}

async function warnOrBan(sock, sessionId, chatId, sender, tenantId, settings, reason) {
  const chances = settings.warn_chances || 0;
  const senderPhone = sender.split('@')[0];
  const groupName = settings.group_name || 'o grupo';

  const vars = { motivo: reason, grupo: groupName, usuario: `@${senderPhone}` };

  if (chances <= 0) {
    await banMember(sessionId, chatId, sender, tenantId, reason);

    const dmText = settings.msg_ban
      ? applyVars(settings.msg_ban, vars)
      : `⛔ Você foi removido de *${groupName}* por: *${reason}*.\n\n_Esta é uma mensagem automática do sistema de moderação._`;

    const groupText = settings.msg_ban
      ? applyVars(settings.msg_ban, { ...vars, usuario: `@${senderPhone}` })
      : `⛔ @${senderPhone} foi removido por: ${reason}.`;

    try { await sock.sendMessage(sender, { text: dmText }); } catch {}
    try { await sock.sendMessage(chatId, { text: groupText, mentions: [sender] }); } catch {}
    return;
  }

  const existing = await db
    .prepare('SELECT id, count FROM warnings WHERE session_id = ? AND group_id = ? AND phone = ?')
    .get(sessionId, chatId, sender);

  let count;
  if (!existing) {
    await db.prepare(
      'INSERT INTO warnings (id, tenant_id, session_id, group_id, phone, count, last_reason) VALUES (?, ?, ?, ?, ?, 1, ?)'
    ).run(uuidv4(), tenantId, sessionId, chatId, sender, reason);
    count = 1;
  } else {
    count = existing.count + 1;
    await db.prepare(
      'UPDATE warnings SET count = ?, last_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND group_id = ? AND phone = ?'
    ).run(count, reason, sessionId, chatId, sender);
  }

  const warnVars = { ...vars, contagem: count, max: chances, restantes: chances - count };

  if (count >= chances) {
    await banMember(sessionId, chatId, sender, tenantId, `${reason} (${count}/${chances} advertências)`);
    await db.prepare('DELETE FROM warnings WHERE session_id = ? AND group_id = ? AND phone = ?')
      .run(sessionId, chatId, sender);

    const dmText = settings.msg_ban
      ? applyVars(settings.msg_ban, { ...warnVars, restantes: 0 })
      : `⛔ Você foi removido de *${groupName}* por atingir ${chances} advertência(s).\n\nÚltimo motivo: *${reason}*.`;

    const groupText = settings.msg_ban
      ? applyVars(settings.msg_ban, { ...warnVars, restantes: 0, usuario: `@${senderPhone}` })
      : `⛔ @${senderPhone} foi removido após atingir ${chances} advertência(s).`;

    try { await sock.sendMessage(sender, { text: dmText }); } catch {}
    try { await sock.sendMessage(chatId, { text: groupText, mentions: [sender] }); } catch {}
  } else {
    const dmText = settings.msg_warn
      ? applyVars(settings.msg_warn, warnVars)
      : `⚠️ *Advertência em ${groupName}*\n\nMotivo: *${reason}*\nAdvertências: *${count}/${chances}*\nChances restantes: *${chances - count}*\n\n_Ao atingir ${chances} advertências você será removido automaticamente._`;

    const groupText = settings.msg_warn
      ? applyVars(settings.msg_warn, { ...warnVars, usuario: `@${senderPhone}` })
      : `⚠️ @${senderPhone} – advertência ${count}/${chances}. Motivo: ${reason}.`;

    try { await sock.sendMessage(sender, { text: dmText }); } catch {}
    try { await sock.sendMessage(chatId, { text: groupText, mentions: [sender] }); } catch {}
  }
}

// ── IA ─────────────────────────────────────────────────────────────────────

async function handleAIResponse(sock, chatId, textBody, tenantId, settings) {
  if (!settings?.ai_enabled) return;

  const config = await db.prepare('SELECT * FROM ai_configs WHERE tenant_id = ?').get(tenantId);
  if (!config || !config.enabled || !config.api_key) return;

  const text = (textBody || '').trim();
  if (!text) return;

  if (config.trigger_mode === 'keyword') {
    const kw = (config.trigger_keyword || '!ia').toLowerCase();
    if (!text.toLowerCase().startsWith(kw)) return;
  }

  const userText = config.trigger_mode === 'keyword'
    ? text.slice((config.trigger_keyword || '!ia').length).trim() || text
    : text;

  try {
    const reply = await callAI(config, userText);
    if (reply) await sock.sendMessage(chatId, { text: reply });
  } catch (err) {
    console.error(`[IA] Erro ao chamar ${config.provider || 'claude'}:`, err.message);
  }
}

// ── Anti-flood ─────────────────────────────────────────────────────────────

async function checkFlood(sessionId, groupId, settings) {
  const limit = settings.flood_limit || 0;
  if (limit <= 0) return;

  const key = `${sessionId}:${groupId}`;
  const now = Date.now();
  const periodMs = (settings.flood_period_min || 60) * 60 * 1000;

  let counter = messageCounters.get(key);
  if (!counter || (now - counter.windowStart) > periodMs) {
    counter = { count: 0, windowStart: now };
  }
  counter.count++;
  messageCounters.set(key, counter);

  if (counter.count >= limit) {
    messageCounters.delete(key);
    const closeMin = settings.flood_close_min || 30;
    try {
      await closeGroup(
        sessionId, groupId,
        `🚫 Flood detectado: ${counter.count} msgs em ${settings.flood_period_min || 60} min`,
        closeMin
      );
    } catch {}
  }
}

// ── Handlers de mensagem ───────────────────────────────────────────────────

function getMentionedJids(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

async function handleCustomCommand(sock, chatId, textBody, tenantId, sessionId, msg) {
  const parts = (textBody || '').trim().split(/\s+/);
  if (!parts.length) return;

  const trigger = parts[0].toLowerCase();

  const command = await db
    .prepare('SELECT * FROM custom_commands WHERE tenant_id = ? AND trigger_word = ?')
    .get(tenantId, trigger);
  if (!command) return;

  // Resolve alvo: menção @ tem prioridade, depois número digitado
  const mentions = getMentionedJids(msg);
  const targetJid = mentions.length > 0
    ? mentions[0]
    : (parts[1] ? toJid(parts[1].replace('@', '')) : null);
  const targetPhone = targetJid ? targetJid.split('@')[0] : null;

  if (!targetJid) {
    try { await sock.sendMessage(chatId, { text: `Marque alguém com @ ou informe o número.\nEx: ${trigger} @pessoa` }); } catch {}
    return;
  }

  try {
    if (command.action === 'remove') {
      await sock.groupParticipantsUpdate(chatId, [targetJid], 'remove');
      await sock.sendMessage(chatId, { text: `✅ @${targetPhone} foi removido.`, mentions: [targetJid] });
    } else if (command.action === 'ban') {
      await banMember(sessionId, chatId, targetJid, tenantId, 'comando adm');
      await sock.sendMessage(chatId, { text: `⛔ @${targetPhone} foi banido.`, mentions: [targetJid] });
    } else if (command.action === 'promote') {
      await sock.groupParticipantsUpdate(chatId, [targetJid], 'promote');
      await sock.sendMessage(chatId, { text: `⬆️ @${targetPhone} agora é administrador.`, mentions: [targetJid] });
    } else if (command.action === 'demote') {
      await sock.groupParticipantsUpdate(chatId, [targetJid], 'demote');
      await sock.sendMessage(chatId, { text: `⬇️ @${targetPhone} foi despromovido.`, mentions: [targetJid] });
    }
  } catch (err) {
    try { await sock.sendMessage(chatId, { text: `❌ Erro: ${err.message}` }); } catch {}
  }
}

async function handleMessage(sock, msg, tenantId, sessionId) {
  const chatId = msg.key.remoteJid;
  if (!chatId?.endsWith('@g.us')) return;

  const fromMe = !!msg.key.fromMe;
  const sender = fromMe
    ? (sock.user?.id || msg.key.participant)
    : msg.key.participant;
  if (!sender) return;

  const textBody = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption
    || '';

  // Mensagens do próprio bot: só processa comandos, nunca moderação
  if (fromMe) {
    const firstWord = textBody.trim().split(/\s+/)[0]?.toLowerCase();
    if (!firstWord) return;
    const command = await db.prepare('SELECT id FROM custom_commands WHERE tenant_id = ? AND trigger_word = ?').get(tenantId, firstWord);
    if (command) {
      console.log(`[cmd] fromMe trigger="${firstWord}" group=${chatId}`);
      await handleCustomCommand(sock, chatId, textBody, tenantId, sessionId, msg);
    }
    return;
  }

  const settings = await db
    .prepare('SELECT * FROM group_settings WHERE session_id = ? AND group_id = ? AND is_managed = 1')
    .get(sessionId, chatId);
  if (!settings) return;

  await checkFlood(sessionId, chatId, settings);

  const isAdmin = await isGroupAdmin(sock, chatId, sender);

  if (isAdmin) {
    await handleCustomCommand(sock, chatId, textBody, tenantId, sessionId, msg);
    await handleAIResponse(sock, chatId, textBody, tenantId, settings);
    return;
  }

  if (textBody && settings.ban_links && containsLink(textBody)) {
    await warnOrBan(sock, sessionId, chatId, sender, tenantId, settings, 'link');
    return;
  }

  if (textBody && settings.ban_profanity && await containsProfanity(textBody, tenantId)) {
    await warnOrBan(sock, sessionId, chatId, sender, tenantId, settings, 'palavrão');
    return;
  }

  if (settings.ban_viewonce && (msg.key?.isViewOnce || !msg.message)) {
    try {
      await sock.sendMessage(chatId, {
        delete: { remoteJid: chatId, fromMe: false, id: msg.key.id, participant: sender },
      });
    } catch (e) { console.error(`[ban_viewonce] erro ao apagar: ${e.message}`); }
    await warnOrBan(sock, sessionId, chatId, sender, tenantId, settings, 'visualização única');
    return;
  }

  if (settings.ban_media) {
    const m = msg.message;
    if (m?.imageMessage || m?.videoMessage || m?.stickerMessage) {
      try {
        await sock.sendMessage(chatId, {
          delete: { remoteJid: chatId, fromMe: false, id: msg.key.id, participant: sender },
        });
      } catch (e) { console.error(`[ban_media] erro ao apagar: ${e.message}`); }
      await warnOrBan(sock, sessionId, chatId, sender, tenantId, settings, 'mídia proibida');
      return;
    }
  }

  if (settings.ban_nsfw && await containsNSFW(msg, sock)) {
    try {
      await sock.sendMessage(chatId, {
        delete: { remoteJid: chatId, fromMe: false, id: msg.key.id, participant: sender },
      });
    } catch (e) { console.error(`[nsfw] erro ao apagar mensagem: ${e.message}`); }
    await warnOrBan(sock, sessionId, chatId, sender, tenantId, settings, 'mídia inapropriada');
    return;
  }

  await handleAIResponse(sock, chatId, textBody, tenantId, settings);
}

// ── Iniciar sessão ─────────────────────────────────────────────────────────

async function startSession(sessionId, tenantId) {
  if (sockets.has(sessionId)) {
    const row = await db.prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId);
    if (row?.status === 'connected') throw new Error('Sessão já conectada');
    await disconnectSession(sessionId);
  }

  await updateSessionDB(sessionId, { status: 'connecting', qr_code: null });
  notifySubscribers(sessionId, { status: 'connecting' });

  const authPath = path.resolve(sessionsPath, sessionId);
  if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

  const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
  } = await loadBaileys();

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: silentLogger,
    browser: ['Gasparzinho', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
  });

  sockets.set(sessionId, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        await updateSessionDB(sessionId, { status: 'qr_ready', qr_code: qrDataUrl });
        notifySubscribers(sessionId, { status: 'qr_ready', qr_code: qrDataUrl });
      } catch {}
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || null;
      const display_name = sock.user?.name || null;
      await updateSessionDB(sessionId, { status: 'connected', qr_code: null, phone, display_name });
      notifySubscribers(sessionId, { status: 'connected', phone, display_name });
      await loadAllSchedules();
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      sockets.delete(sessionId);

      if (loggedOut || doNotReconnect.has(sessionId)) {
        doNotReconnect.delete(sessionId);
        if (loggedOut) {
          try { fs.rmSync(authPath, { recursive: true, force: true }); } catch {}
        }
        await updateSessionDB(sessionId, { status: 'disconnected', qr_code: null });
        notifySubscribers(sessionId, { status: 'disconnected' });
      } else {
        await updateSessionDB(sessionId, { status: 'connecting' });
        notifySubscribers(sessionId, { status: 'connecting' });
        setTimeout(() => {
          if (doNotReconnect.has(sessionId)) { doNotReconnect.delete(sessionId); return; }
          startSession(sessionId, tenantId).catch(() => {});
        }, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log(`[upsert] type=${type} count=${messages.length}`);
    if (type !== 'notify') return;
    for (const msg of messages) {
      const jid = msg.key?.remoteJid || '';
      const fromMe = msg.key?.fromMe;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      console.log(`[upsert] jid=${jid} fromMe=${fromMe} text="${text.substring(0, 60)}"`);
      try {
        await handleMessage(sock, msg, tenantId, sessionId);
      } catch (e) {
        console.error(`[upsert] erro no handleMessage: ${e.message}`);
      }
    }
  });

  sock.ev.on('group-participants.update', async ({ id: groupId, participants, action }) => {
    if (action !== 'add' || !participants?.length) return;
    try {
      const settings = await db
        .prepare('SELECT * FROM group_settings WHERE session_id = ? AND group_id = ? AND is_managed = 1')
        .get(sessionId, groupId);
      if (!settings?.welcome_enabled || !settings?.welcome_message) return;

      const mentions = participants;
      const phones = participants.map((j) => j.split('@')[0]);
      const userTags = phones.map((p) => `@${p}`).join(' ');
      const text = applyVars(settings.welcome_message, { usuario: userTags, grupo: settings.group_name || groupId });

      await sock.sendMessage(groupId, { text, mentions });
    } catch (e) {
      console.error(`[welcome] erro ao enviar saudação: ${e.message}`);
    }
  });

  return sock;
}

// ── Desconectar / Reconectar ───────────────────────────────────────────────

async function disconnectSession(sessionId) {
  doNotReconnect.add(sessionId);
  const sock = sockets.get(sessionId);
  if (sock) {
    sock.ev.removeAllListeners();
    try { sock.end(); } catch { try { sock.ws?.close?.(); } catch {} }
    sockets.delete(sessionId);
  }
  await updateSessionDB(sessionId, { status: 'disconnected', qr_code: null });
  notifySubscribers(sessionId, { status: 'disconnected' });
}

async function reconnectActiveSessions() {
  const sessions = await db.prepare("SELECT * FROM sessions WHERE status = 'connected'").all();
  for (const session of sessions) {
    try {
      await startSession(session.id, session.tenant_id);
    } catch {}
  }
}

async function closeGroup(sessionId, groupId, reason, durationMinutes = 0) {
  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('Sessão não conectada');
  await sock.groupSettingUpdate(groupId, 'announcement');

  let msg = reason
    ? `🔒 *Grupo fechado*\n\nMotivo: ${reason}`
    : '🔒 *Grupo fechado*\n\nApenas administradores podem enviar mensagens.';

  if (durationMinutes > 0) {
    const h = Math.floor(durationMinutes / 60);
    const m = durationMinutes % 60;
    const durStr = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`;
    msg += `\n⏱ Reabertura automática em *${durStr}*.`;
  }

  try { await sock.sendMessage(groupId, { text: msg }); } catch {}

  const key = `${sessionId}:${groupId}`;
  const existing = timedCloseJobs.get(key);
  if (existing) { clearTimeout(existing); timedCloseJobs.delete(key); }

  if (durationMinutes > 0) {
    const id = setTimeout(async () => {
      timedCloseJobs.delete(key);
      try { await openGroup(sessionId, groupId); } catch {}
    }, durationMinutes * 60 * 1000);
    timedCloseJobs.set(key, id);
  }
}

async function openGroup(sessionId, groupId) {
  const key = `${sessionId}:${groupId}`;
  const existing = timedCloseJobs.get(key);
  if (existing) { clearTimeout(existing); timedCloseJobs.delete(key); }

  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('Sessão não conectada');
  await sock.groupSettingUpdate(groupId, 'not_announcement');
  try { await sock.sendMessage(groupId, { text: '🔓 *Grupo reaberto*\n\nTodos os membros podem enviar mensagens novamente.' }); } catch {}
}

async function disconnectAllSessions() {
  const ids = [...sockets.keys()];
  console.log(`[whatsapp] derrubando ${ids.length} sessão(ões) ativas...`);
  for (const sessionId of ids) {
    try {
      doNotReconnect.add(sessionId);
      await disconnectSession(sessionId);
    } catch {}
  }
  // Marca todas as sessões como desconectadas no banco
  await db.prepare("UPDATE sessions SET status = 'disconnected' WHERE status = 'connected'").run();
}

module.exports = {
  startSession,
  disconnectSession,
  disconnectAllSessions,
  banMember,
  removeMember,
  getGroups,
  getGroupMembers,
  subscribe,
  scheduleLock,
  reconnectActiveSessions,
  closeGroup,
  openGroup,
};

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = mysql.createPool({
  host:              process.env.DB_HOST     || 'localhost',
  port:              parseInt(process.env.DB_PORT || '3306'),
  user:              process.env.DB_USER     || 'root',
  password:          process.env.DB_PASSWORD || '',
  database:          process.env.DB_NAME     || 'gasparzinho',
  waitForConnections: true,
  connectionLimit:   10,
  queueLimit:        0,
  charset:           'utf8mb4',
});

// ── Wrapper API ────────────────────────────────────────────────────────────────
// Mantém a mesma interface de better-sqlite3 mas com promises

function prepare(sql) {
  return {
    async get(...args) {
      const [rows] = await pool.execute(sql, args.flat());
      return rows.length > 0 ? rows[0] : null;
    },
    async all(...args) {
      const [rows] = await pool.execute(sql, args.flat());
      return rows;
    },
    async run(...args) {
      const [result] = await pool.execute(sql, args.flat());
      return { changes: result.affectedRows, insertId: result.insertId };
    },
  };
}

async function exec(sql) {
  await pool.query(sql);
}

async function transaction(fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  const txDb = {
    prepare(sql) {
      return {
        async get(...args) {
          const [rows] = await conn.execute(sql, args.flat());
          return rows.length > 0 ? rows[0] : null;
        },
        async all(...args) {
          const [rows] = await conn.execute(sql, args.flat());
          return rows;
        },
        async run(...args) {
          const [result] = await conn.execute(sql, args.flat());
          return { changes: result.affectedRows, insertId: result.insertId };
        },
      };
    },
  };
  try {
    await fn(txDb);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ── Inicialização do banco ─────────────────────────────────────────────────────

async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS plans (
    id          VARCHAR(36)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    max_sessions INT         NOT NULL DEFAULT 1,
    max_groups   INT                  DEFAULT 2,
    price_cents  INT         NOT NULL DEFAULT 0,
    features     TEXT,
    is_active    TINYINT(1)           DEFAULT 1,
    created_at   DATETIME             DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS tenants (
    id             VARCHAR(36)  PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    plan_id        VARCHAR(100) NOT NULL DEFAULT 'free',
    plan_expires_at DATETIME,
    created_at     DATETIME             DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id            VARCHAR(36)  PRIMARY KEY,
    tenant_id     VARCHAR(36)  NOT NULL,
    username      VARCHAR(255) NOT NULL,
    email         VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(50)           DEFAULT 'operator',
    created_at    DATETIME              DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tenant_username (tenant_id, username),
    UNIQUE KEY uq_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS super_admins (
    id            VARCHAR(36)  PRIMARY KEY,
    username      VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    DATETIME              DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id         VARCHAR(36)   PRIMARY KEY,
    tenant_id  VARCHAR(36)   NOT NULL,
    name       VARCHAR(255)  NOT NULL,
    phone      VARCHAR(50),
    status     VARCHAR(50)            DEFAULT 'disconnected',
    qr_code    MEDIUMTEXT,
    created_at DATETIME               DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS group_settings (
    id           VARCHAR(36)  PRIMARY KEY,
    tenant_id    VARCHAR(36)  NOT NULL,
    session_id   VARCHAR(36)  NOT NULL,
    group_id     VARCHAR(255) NOT NULL,
    group_name   VARCHAR(255),
    lock_enabled TINYINT(1)            DEFAULT 0,
    lock_start   VARCHAR(10),
    lock_end     VARCHAR(10),
    lock_days    VARCHAR(50)           DEFAULT '[0,1,2,3,4,5,6]',
    ban_links    TINYINT(1)            DEFAULT 1,
    ban_profanity TINYINT(1)           DEFAULT 1,
    ai_enabled   TINYINT(1)            DEFAULT 0,
    is_managed   TINYINT(1)            DEFAULT 0,
    warn_chances INT                   DEFAULT 0,
    lock_reason      VARCHAR(500),
    flood_limit      INT                   DEFAULT 0,
    flood_period_min INT                   DEFAULT 60,
    flood_close_min  INT                   DEFAULT 30,
    created_at       DATETIME              DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_session_group (session_id, group_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS profanity_words (
    id         VARCHAR(36)  PRIMARY KEY,
    tenant_id  VARCHAR(36)  NOT NULL,
    word       VARCHAR(255) NOT NULL,
    created_at DATETIME              DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tenant_word (tenant_id, word)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS custom_commands (
    id           VARCHAR(36)  PRIMARY KEY,
    tenant_id    VARCHAR(36)  NOT NULL,
    trigger_word VARCHAR(255) NOT NULL,
    action       VARCHAR(50)  NOT NULL,
    description  TEXT,
    created_at   DATETIME              DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tenant_trigger (tenant_id, trigger_word)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS bans (
    id         VARCHAR(36)  PRIMARY KEY,
    tenant_id  VARCHAR(36)  NOT NULL,
    session_id VARCHAR(36)  NOT NULL,
    group_id   VARCHAR(255),
    phone      VARCHAR(255) NOT NULL,
    reason     TEXT,
    created_at DATETIME              DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS payment_requests (
    id               VARCHAR(36)  PRIMARY KEY,
    tenant_id        VARCHAR(36)  NOT NULL,
    plan_slug        VARCHAR(100) NOT NULL,
    requester_name   VARCHAR(255) NOT NULL,
    whatsapp_number  VARCHAR(50)  NOT NULL,
    status           VARCHAR(50)           DEFAULT 'pending',
    notes            TEXT,
    created_at       DATETIME              DEFAULT CURRENT_TIMESTAMP,
    reviewed_at      DATETIME
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS warnings (
    id          VARCHAR(36)  PRIMARY KEY,
    tenant_id   VARCHAR(36)  NOT NULL,
    session_id  VARCHAR(36)  NOT NULL,
    group_id    VARCHAR(255) NOT NULL,
    phone       VARCHAR(255) NOT NULL,
    count       INT                   DEFAULT 1,
    last_reason TEXT,
    updated_at  DATETIME              DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_session_group_phone (session_id, group_id, phone)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

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

  await pool.query(`CREATE TABLE IF NOT EXISTS system_ai_config (
    id               VARCHAR(36)  PRIMARY KEY,
    provider         VARCHAR(50)  NOT NULL DEFAULT 'openai',
    model            VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
    api_key          TEXT,
    enabled          TINYINT(1)            DEFAULT 0,
    profanity_prompt TEXT,
    updated_at       DATETIME              DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS ai_configs (
    id               VARCHAR(36)  PRIMARY KEY,
    tenant_id        VARCHAR(36)  NOT NULL UNIQUE,
    enabled          TINYINT(1)            DEFAULT 0,
    api_key          TEXT,
    provider         VARCHAR(50)           DEFAULT 'claude',
    model            VARCHAR(100)          DEFAULT 'claude-haiku-4-5-20251001',
    system_prompt    TEXT,
    trigger_mode     VARCHAR(50)           DEFAULT 'keyword',
    trigger_keyword  VARCHAR(100)          DEFAULT '!ia',
    created_at       DATETIME              DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // ── Migrações (rodam antes dos seeds para garantir colunas existam) ────────
  const migrations = [
    "ALTER TABLE group_settings ADD COLUMN lock_reason VARCHAR(500) DEFAULT NULL",
    "ALTER TABLE group_settings ADD COLUMN flood_limit INT DEFAULT 0",
    "ALTER TABLE group_settings ADD COLUMN flood_period_min INT DEFAULT 60",
    "ALTER TABLE group_settings ADD COLUMN flood_close_min INT DEFAULT 30",
    "ALTER TABLE system_ai_config ADD COLUMN profanity_prompt TEXT",
    "ALTER TABLE group_settings ADD COLUMN ban_nsfw TINYINT(1) DEFAULT 0",
    "ALTER TABLE system_ai_config ADD COLUMN nsfw_prompt TEXT",
    "ALTER TABLE group_settings ADD COLUMN msg_warn TEXT DEFAULT NULL",
    "ALTER TABLE group_settings ADD COLUMN msg_ban TEXT DEFAULT NULL",
    "ALTER TABLE group_settings ADD COLUMN ban_viewonce TINYINT(1) DEFAULT 0",
    "ALTER TABLE system_ai_config ADD COLUMN credits_exhausted TINYINT(1) DEFAULT 0",
    "ALTER TABLE group_settings ADD COLUMN ban_media TINYINT(1) DEFAULT 0",
    "ALTER TABLE tenants ADD COLUMN stripe_customer_id VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE tenants ADD COLUMN stripe_subscription_id VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE tenants ADD COLUMN stripe_subscription_status VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE sessions ADD COLUMN display_name VARCHAR(255) DEFAULT NULL",
    "ALTER TABLE group_settings ADD COLUMN welcome_enabled TINYINT(1) DEFAULT 0",
    "ALTER TABLE group_settings ADD COLUMN welcome_message TEXT DEFAULT NULL",
  ];
  for (const sql of migrations) {
    try { await pool.query(sql); } catch {}
  }

  // Seed system_ai_config (após migrations para garantir que profanity_prompt existe)
  await pool.execute(
    'INSERT IGNORE INTO system_ai_config (id, provider, model, enabled, profanity_prompt) VALUES (?, ?, ?, ?, ?)',
    ['system', 'openai', 'gpt-4o-mini', 0, DEFAULT_PROFANITY_PROMPT]
  );

  // ── Seed: planos ──────────────────────────────────────────────────────────
  const freeFeatures    = JSON.stringify([
    '1 sessão WhatsApp',
    '1 grupo gerenciado',
    'Bloqueio de links',
    'Filtro de palavrões (lista)',
    'Comandos personalizados',
    'Saudação automática de novos membros',
    'Dashboard',
  ]);
  const starterFeatures = JSON.stringify([
    '5 sessões WhatsApp',
    '10 grupos gerenciados',
    'Bloqueio de links',
    'Filtro de palavrões (lista)',
    'Comandos personalizados',
    'Saudação automática de novos membros',
    'Bloqueio por horário e dias',
    'Anti-flood automático',
    'Sistema de advertências',
    'Bloqueio de visualização única',
    'Bloqueio de vídeos, imagens e figurinhas',
    'Análise de mídia inapropriada com IA',
    'Resposta automática com IA',
    'Dashboard e gráficos',
  ]);
  const proFeatures     = JSON.stringify([
    'Sessões ilimitadas',
    'Grupos ilimitados',
    'Tudo do plano Starter',
    'Suporte prioritário',
  ]);

  await pool.execute(
    'INSERT IGNORE INTO plans (id, name, slug, max_sessions, max_groups, price_cents, features, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [uuidv4(), 'Gratuito', 'free', 1, 1, 0, freeFeatures, 1]
  );
  await pool.execute(
    'INSERT IGNORE INTO plans (id, name, slug, max_sessions, max_groups, price_cents, features, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [uuidv4(), 'Starter', 'starter', 5, 10, 2900, starterFeatures, 1]
  );
  await pool.execute(
    'INSERT IGNORE INTO plans (id, name, slug, max_sessions, max_groups, price_cents, features, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [uuidv4(), 'Pro', 'pro', -1, -1, 5900, proFeatures, 1]
  );

  await pool.execute(
    "UPDATE plans SET name='Gratuito', max_sessions=1,  max_groups=1,  price_cents=0,    features=?, is_active=1 WHERE slug='free'",
    [freeFeatures]
  );
  await pool.execute(
    "UPDATE plans SET name='Starter',  max_sessions=5,  max_groups=10, price_cents=2900, features=?, is_active=1 WHERE slug='starter'",
    [starterFeatures]
  );
  await pool.execute(
    "UPDATE plans SET name='Pro',      max_sessions=-1, max_groups=-1, price_cents=5900, features=?, is_active=1 WHERE slug='pro'",
    [proFeatures]
  );

  // Preenche profanity_prompt em linhas existentes que ficaram com NULL após migration
  await pool.execute(
    "UPDATE system_ai_config SET profanity_prompt = ? WHERE id = 'system' AND profanity_prompt IS NULL",
    [DEFAULT_PROFANITY_PROMPT]
  );

  // ── Seed: super admin ─────────────────────────────────────────────────────
  const saUsername = process.env.SUPER_ADMIN_USERNAME || 'admin';
  const saPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin';

  const [saRows] = await pool.execute('SELECT id FROM super_admins WHERE username = ?', [saUsername]);
  if (saRows.length === 0) {
    await pool.execute(
      'INSERT INTO super_admins (id, username, password_hash) VALUES (?, ?, ?)',
      [uuidv4(), saUsername, bcrypt.hashSync(saPassword, 10)]
    );
    console.log(`✅ Super admin criado: ${saUsername}`);
  }

  console.log('✅ Banco de dados MySQL inicializado');
}

const db = { prepare, exec, transaction, init, pool };
module.exports = db;

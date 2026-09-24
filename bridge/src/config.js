require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  /// URL do ASP.NET, para onde os eventos são enviados.
  appUrl: (process.env.APP_URL || 'http://localhost:5157').replace(/\/$/, ''),
  /// Segredo compartilhado — precisa ser igual ao Bridge:Token do .NET.
  token: process.env.BRIDGE_TOKEN || 'TKN12345678',
  sessionsPath: process.env.SESSIONS_PATH || './data/sessions',
};

if (!config.token) {
  console.error(
    '[config] BRIDGE_TOKEN não definido. Defina o mesmo valor aqui e em Bridge:Token no .NET.'
  );
  process.exit(1);
}

module.exports = config;

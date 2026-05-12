const jwt = require('jsonwebtoken');
const db = require('../database');

async function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : queryToken;

  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

    req.user = user;
    req.tenantId = user.tenant_id;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}


async function superAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.superAdmin) return res.status(403).json({ error: 'Acesso negado' });
    const sa = await db.prepare('SELECT id, username FROM super_admins WHERE id = ?').get(decoded.superAdminId);
    if (!sa) return res.status(401).json({ error: 'Super admin não encontrado' });
    req.superAdmin = sa;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = { auth, superAuth };

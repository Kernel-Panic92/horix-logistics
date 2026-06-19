import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/db.js';
import { enviarCorreo, obtenerPlantilla } from '../utils/email.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'logistics-dev-secret-change-in-production';

/* ── Rate limiter (login brute force) ── */
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_BLOCK_MS = 30 * 60 * 1000;

function loginRateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '—';
  const now = Date.now();
  const data = loginAttempts.get(ip);
  if (data?.blockedUntil && data.blockedUntil > now) {
    const remaining = Math.ceil((data.blockedUntil - now) / 1000 / 60);
    return res.status(429).json({ error: `Demasiados intentos. Intenta de nuevo en ${remaining} minuto(s).` });
  }
  if (data && now - data.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
  }
  next();
}

function loginRegisterFail(ip) {
  const now = Date.now();
  let data = loginAttempts.get(ip);
  if (!data || now - data.windowStart > LOGIN_WINDOW_MS) {
    data = { count: 0, windowStart: now };
  }
  data.count++;
  if (data.count >= LOGIN_MAX_ATTEMPTS) {
    data.blockedUntil = now + LOGIN_BLOCK_MS;
  }
  loginAttempts.set(ip, data);
}

function loginRegisterSuccess(ip) {
  loginAttempts.delete(ip);
}

/* ── Login ── */
router.post('/login', loginRateLimit, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '—';
  const ua = req.headers['user-agent'] || '—';
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const result = await pool.query('SELECT * FROM logistics.usuarios WHERE email=$1 AND activo=true', [email]);

    if (result.rows.length === 0) {
      loginRegisterFail(ip);
      await pool.query('INSERT INTO logistics.auditoria_accesos (email, ip, user_agent, tipo) VALUES ($1,$2,$3,\'fallido\')', [email, ip, ua]);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    const valida = await bcrypt.compare(password, user.password_hash);
    if (!valida) {
      loginRegisterFail(ip);
      await pool.query('INSERT INTO logistics.auditoria_accesos (usuario_id, email, ip, user_agent, tipo) VALUES ($1,$2,$3,$4,\'fallido\')', [user.id, email, ip, ua]);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    loginRegisterSuccess(ip);
    await pool.query('INSERT INTO logistics.auditoria_accesos (usuario_id, email, ip, user_agent, tipo) VALUES ($1,$2,$3,$4,\'exito\')', [user.id, email, ip, ua]);

    const token = jwt.sign(
      { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      exitosa: true,
      token,
      usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/verificar', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });

    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    const result = await pool.query('SELECT id, nombre, email, rol FROM logistics.usuarios WHERE id=$1 AND activo=true', [decoded.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });

    res.json({ exitosa: true, usuario: result.rows[0] });
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
});

/* ── Cambiar contraseña (autenticado) ── */
router.post('/cambiar-password', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
    let decoded;
    try { decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET); } catch { return res.status(401).json({ error: 'Token inválido' }); }

    const { actual, nueva } = req.body;
    if (!actual || !nueva) return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
    if (nueva.length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });

    const result = await pool.query('SELECT password_hash FROM logistics.usuarios WHERE id=$1', [decoded.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const ok = await bcrypt.compare(actual, result.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    const hash = await bcrypt.hash(nueva, 12);
    await pool.query('UPDATE logistics.usuarios SET password_hash=$1 WHERE id=$2', [hash, decoded.id]);

    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error en cambiar-password:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

/* ── Forgot / Reset ── */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  try {
    const userResult = await pool.query('SELECT id, nombre, email FROM logistics.usuarios WHERE email=$1 AND activo=true', [email.toLowerCase().trim()]);
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      await pool.query('DELETE FROM logistics.tokens_reset WHERE usuario_id=$1', [user.id]);
      const token = crypto.randomBytes(48).toString('hex');
      const expira = new Date(Date.now() + 30 * 60 * 1000);
      await pool.query('INSERT INTO logistics.tokens_reset (token, usuario_id, expira) VALUES ($1, $2, $3)', [token, user.id, expira]);
      try {
        const cfgResult = await pool.query("SELECT clave, valor FROM logistics.configuracion WHERE clave IN ('app_url','reset_asunto','reset_cuerpo','plantilla_heredar','launcher_url')");
        const cfg = {};
        for (const row of cfgResult.rows) cfg[row.clave] = row.valor;
        const baseUrl = cfg.app_url || `${req.protocol}://${req.get('host')}`;
        const enlace = `${baseUrl}/reset-password.html?token=${token}`;

        const plantilla = await obtenerPlantilla('reset_password');
        let asunto, cuerpo, esHtml;
        if (plantilla) {
          asunto = plantilla.asunto || 'Recuperación de contraseña';
          cuerpo = plantilla.cuerpo_html || 'Hola {nombre},<br><a href="{enlace}">{enlace}</a>';
          esHtml = true;
        } else {
          asunto = cfg.reset_asunto || 'Recuperación de contraseña';
          cuerpo = cfg.reset_cuerpo || 'Hola {nombre},\n\n{enlace}';
          esHtml = false;
        }
        cuerpo = cuerpo.replace(/{nombre}/g, user.nombre).replace(/{enlace}/g, enlace).replace(/{empresa}/g, 'Vitamar');

        if (esHtml) {
          await enviarCorreo(user.email, asunto, cuerpo.replace(/<[^>]*>/g, ''), cuerpo);
        } else {
          await enviarCorreo(user.email, asunto, cuerpo);
        }
      } catch (mailErr) {
        console.error('Error enviando correo de recuperación:', mailErr);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en forgot-password:', err);
    res.json({ ok: true });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token y contraseña requeridos' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  try {
    const result = await pool.query(
      'SELECT * FROM logistics.tokens_reset WHERE token=$1 AND expira > NOW() AND usado=false',
      [token]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'El enlace es inválido o ya expiró' });

    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE logistics.usuarios SET password_hash=$1 WHERE id=$2', [hash, result.rows[0].usuario_id]);
    await pool.query('UPDATE logistics.tokens_reset SET usado=true WHERE token=$1', [token]);

    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error en reset-password:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/* ── Rate limiter status (admin) ── */
router.get('/ratelimit-status', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
    let decoded;
    try { decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET); } catch { return res.status(401).json({ error: 'Token inválido' }); }
    if (decoded.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });

    const cfgResult = await pool.query("SELECT clave, valor FROM logistics.configuracion WHERE clave IN ('login_max_attempts','login_window_minutes','login_block_minutes')");
    const cfg = {};
    for (const row of cfgResult.rows) cfg[row.clave] = row.valor;

    const now = Date.now();
    const bloqueadas = [];
    const enSeguimiento = [];
    for (const [ip, data] of loginAttempts) {
      if (data.blockedUntil && data.blockedUntil > now) {
        bloqueadas.push({ ip, intentos: data.count, bloqueadaHasta: new Date(data.blockedUntil).toISOString(), minutosRestantes: Math.round((data.blockedUntil - now) / 60000) });
      } else if (now - data.windowStart <= LOGIN_WINDOW_MS) {
        enSeguimiento.push({ ip, intentos: data.count, ventanaExpiraEn: Math.round((LOGIN_WINDOW_MS - (now - data.windowStart)) / 1000) + 's' });
      }
    }

    res.json({
      configuracion: {
        maxIntentos: parseInt(cfg.login_max_attempts) || LOGIN_MAX_ATTEMPTS,
        ventanaMinutos: parseInt(cfg.login_window_minutes) || LOGIN_WINDOW_MS / 60000,
        bloqueoMinutos: parseInt(cfg.login_block_minutes) || LOGIN_BLOCK_MS / 60000
      },
      totalIpsEnSeguimiento: enSeguimiento.length,
      totalBloqueadas: bloqueadas.length,
      bloqueadas,
      enSeguimiento
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/ratelimit-status/:ip', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
    let decoded;
    try { decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET); } catch { return res.status(401).json({ error: 'Token inválido' }); }
    if (decoded.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });

    loginAttempts.delete(req.params.ip);
    res.json({ ok: true, mensaje: 'IP desbloqueada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export { router as default, JWT_SECRET };

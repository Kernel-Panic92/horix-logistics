import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/db.js';
import { enviarCorreo } from '../utils/email.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'logistics-dev-secret-change-in-production';

router.post('/login', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '—';
  const ua = req.headers['user-agent'] || '—';
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const result = await pool.query('SELECT * FROM logistics.usuarios WHERE email=$1 AND activo=true', [email]);

    if (result.rows.length === 0) {
      await pool.query('INSERT INTO logistics.auditoria_accesos (email, ip, user_agent, tipo) VALUES ($1,$2,$3,\'fallido\')', [email, ip, ua]);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    const valida = await bcrypt.compare(password, user.password_hash);
    if (!valida) {
      await pool.query('INSERT INTO logistics.auditoria_accesos (usuario_id, email, ip, user_agent, tipo) VALUES ($1,$2,$3,$4,\'fallido\')', [user.id, email, ip, ua]);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

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
        const cfgResult = await pool.query("SELECT clave, valor FROM logistics.configuracion WHERE clave IN ('app_url','reset_asunto','reset_cuerpo')");
        const cfg = {};
        for (const row of cfgResult.rows) cfg[row.clave] = row.valor;
        const baseUrl = cfg.app_url || `${req.protocol}://${req.get('host')}`;
        const enlace = `${baseUrl}/reset-password.html?token=${token}`;
        let cuerpo = cfg.reset_cuerpo || 'Hola {nombre},\n\n{enlace}';
        cuerpo = cuerpo.replace(/{nombre}/g, user.nombre).replace(/{enlace}/g, enlace);
        await enviarCorreo(user.email, cfg.reset_asunto || 'Recuperación de contraseña', cuerpo);
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

export { router as default, JWT_SECRET };

import express from 'express';
import nodemailer from 'nodemailer';
import pool from '../config/db.js';

const router = express.Router();

function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

router.get('/', soloAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT clave, valor FROM logistics.configuracion');
    const cfg = {};
    for (const row of result.rows) cfg[row.clave] = row.valor;
    res.json({ exitosa: true, config: cfg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/', soloAdmin, async (req, res) => {
  try {
    const updates = req.body;
    for (const [clave, valor] of Object.entries(updates)) {
      if (clave === 'smtp_password' && typeof valor === 'string' && valor.includes('•')) continue;
      await pool.query(
        `INSERT INTO logistics.configuracion (clave, valor, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (clave) DO UPDATE SET valor = $2, updated_at = CURRENT_TIMESTAMP`,
        [clave, String(valor)]
      );
    }
    res.json({ exitosa: true, mensaje: 'Configuración guardada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Seguridad config ── */
router.get('/seguridad', soloAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT clave, valor FROM logistics.configuracion WHERE clave IN ('login_max_attempts','login_window_minutes','login_block_minutes','rate_limit_window','rate_limit_max','fail2ban_enabled','fail2ban_bantime','fail2ban_findtime','fail2ban_maxretry','app_url')");
    const cfg = {};
    for (const row of result.rows) cfg[row.clave] = row.valor;
    let fail2ban = { installed: false, active: false };
    try {
      const { execSync } = await import('child_process');
      fail2ban.installed = execSync('which fail2ban-client 2>/dev/null || echo ""', { encoding: 'utf8' }).trim().length > 0;
      if (fail2ban.installed) {
        const status = execSync('systemctl is-active fail2ban 2>/dev/null || echo "inactive"', { encoding: 'utf8' }).trim();
        fail2ban.active = status === 'active';
      }
    } catch {}
    res.json({ config: cfg, fail2ban });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/seguridad', soloAdmin, async (req, res) => {
  try {
    const allowed = ['login_max_attempts','login_window_minutes','login_block_minutes','rate_limit_window','rate_limit_max','fail2ban_enabled','fail2ban_bantime','fail2ban_findtime','fail2ban_maxretry','app_url'];
    for (const [clave, valor] of Object.entries(req.body)) {
      if (!allowed.includes(clave)) continue;
      let v = String(valor);
      if (['login_max_attempts','login_window_minutes','login_block_minutes','rate_limit_window','rate_limit_max','fail2ban_bantime','fail2ban_findtime','fail2ban_maxretry'].includes(clave)) {
        const n = parseInt(valor);
        if (isNaN(n) || n < 1) continue;
        v = String(n);
      }
      await pool.query(
        `INSERT INTO logistics.configuracion (clave, valor, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (clave) DO UPDATE SET valor = $2, updated_at = CURRENT_TIMESTAMP`,
        [clave, v]
      );
    }
    res.json({ exitosa: true, mensaje: 'Configuración de seguridad guardada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/fail2ban/:action', soloAdmin, async (req, res) => {
  const action = req.params.action;
  if (!['start','stop','restart','reload'].includes(action)) return res.status(400).json({ error: 'Acción inválida' });
  try {
    const { execSync } = await import('child_process');
    const result = execSync(`sudo systemctl ${action} fail2ban 2>&1 || true`, { encoding: 'utf8' }).trim();
    res.json({ ok: true, mensaje: `fail2ban ${action}: ${result || 'ok'}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/test', soloAdmin, async (req, res) => {
  try {
    const { host, puerto, tls, usuario, password, remitente } = req.body;
    const transporter = nodemailer.createTransport({
      host: host || 'localhost',
      port: parseInt(puerto) || 587,
      secure: tls === '1' || tls === true,
      auth: { user: usuario || '', pass: password || '' }
    });
    await transporter.sendMail({
      from: remitente || usuario || 'logistics@vitamar.com',
      to: req.usuario.email,
      subject: '🔧 Prueba SMTP - Horix Logistics',
      text: 'Si recibes esto, la configuración SMTP funciona correctamente.'
    });
    res.json({ exitosa: true, mensaje: 'Correo de prueba enviado a ' + req.usuario.email });
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar: ' + err.message });
  }
});

export default router;

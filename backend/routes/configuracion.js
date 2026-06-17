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

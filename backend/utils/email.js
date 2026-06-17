import nodemailer from 'nodemailer';
import pool from '../config/db.js';

export async function enviarCorreo(to, subject, text, html) {
  const result = await pool.query('SELECT clave, valor FROM logistics.configuracion');
  const cfg = {};
  for (const row of result.rows) cfg[row.clave] = row.valor;

  if (!cfg.smtp_host) throw new Error('SMTP no configurado');

  const transporter = nodemailer.createTransport({
    host: cfg.smtp_host,
    port: parseInt(cfg.smtp_puerto || '587'),
    secure: cfg.smtp_tls === '1',
    auth: { user: cfg.smtp_usuario || '', pass: cfg.smtp_password || '' }
  });

  await transporter.sendMail({
    from: cfg.smtp_remitente || cfg.smtp_usuario || 'logistics@vitamar.com',
    to,
    subject,
    text,
    html: html || text.replace(/\n/g, '<br>')
  });
}

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'logistics-dev-secret-change-in-production';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const result = await pool.query('SELECT * FROM logistics.usuarios WHERE email=$1 AND activo=true', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });

    const user = result.rows[0];
    const valida = await bcrypt.compare(password, user.password_hash);
    if (!valida) return res.status(401).json({ error: 'Credenciales inválidas' });

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

export { router as default, JWT_SECRET };

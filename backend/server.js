import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import pool from './config/db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3004;
const JWT_SECRET = process.env.JWT_SECRET || 'logistics-dev-secret-change-in-production';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Auth middleware
function verificarToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.usuario = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Token inválido o expirado' }); }
}

// Importar rutas
import authRoutes from './routes/auth.js';
import vehiculosRoutes from './routes/vehiculos.js';
import pedidosRoutes from './routes/pedidos.js';
import rutasRoutes from './routes/rutas.js';
import importadoresRoutes from './routes/importadores.js';
import healthRoutes from './routes/health.js';
import usuariosRoutes from './routes/usuarios.js';

// Rutas públicas
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);

// Rutas protegidas
app.use('/api/vehiculos', verificarToken, vehiculosRoutes);
app.use('/api/pedidos', verificarToken, pedidosRoutes);
app.use('/api/rutas', verificarToken, rutasRoutes);
app.use('/api/importadores', verificarToken, importadoresRoutes);
app.use('/api/usuarios', verificarToken, usuariosRoutes);

// Version endpoint
app.get('/api/version', (req, res) => res.json({ version: '1.0.0', nombre: 'Horix Logistics' }));

// MCP endpoint
import { createMiddleware } from './mcp/index.js';
app.use('/mcp', createMiddleware());

// Static files (SPA frontend)
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA catch-all
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/mcp')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

// Iniciar servidor
async function start() {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Conectado a PostgreSQL');
    app.listen(PORT, () => {
      console.log(`🚀 Horix Logistics escuchando en puerto ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error iniciando servidor:', err);
    process.exit(1);
  }
}

start();

export default app;

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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
import configRoutes from './routes/configuracion.js';
import backupRoutes from './routes/backup.js';
import auditoriaRoutes from './routes/auditoria.js';
import actualizadorRoutes from './routes/actualizador.js';
import clientesRoutes from './routes/clientes.js';
import sedesRoutes from './routes/sedes.js';

// Rutas públicas
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);
app.get('/api/rutas/diagnostico', async (req, res) => {
  try {
    const pool = (await import('./config/db.js')).default;
    const pedidosPendientesSinRuta = await pool.query(`SELECT id, numero_factura, latitud, longitud FROM logistics.pedidos_logistica WHERE estado='pendiente' AND ruta_id IS NULL`);
    const pedidosConCoords = await pool.query(`SELECT id, numero_factura FROM logistics.pedidos_logistica WHERE estado='pendiente' AND ruta_id IS NULL AND latitud IS NOT NULL AND longitud IS NOT NULL`);
    const vehiculosDisponibles = await pool.query(`SELECT id, placa, estado, ultima_posicion_lat, ultima_posicion_lng FROM logistics.vehiculos WHERE estado='disponible'`);
    res.json({
      pedidos_pendientes_sin_ruta: pedidosPendientesSinRuta.rows,
      pedidos_pendientes_con_coords: pedidosConCoords.rows,
      vehiculos_disponibles: vehiculosDisponibles.rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rutas protegidas
app.use('/api/vehiculos', verificarToken, vehiculosRoutes);
app.use('/api/pedidos', verificarToken, pedidosRoutes);
app.use('/api/rutas', verificarToken, rutasRoutes);
app.use('/api/importadores', verificarToken, importadoresRoutes);
app.use('/api/usuarios', verificarToken, usuariosRoutes);
app.use('/api/configuracion', verificarToken, configRoutes);
app.use('/api/backup', verificarToken, backupRoutes);
app.use('/api/auditoria', verificarToken, auditoriaRoutes);
app.use('/api/actualizador', verificarToken, actualizadorRoutes);
app.use('/api/clientes', verificarToken, clientesRoutes);
app.use('/api/sedes', verificarToken, sedesRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Version endpoint
app.get('/api/version', (req, res) => {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    res.json({ version: pkg.version || '1.0.0', nombre: pkg.name, branch: 'main' });
  } catch {
    res.json({ version: '1.0.0', nombre: 'Horix Logistics', branch: 'main' });
  }
});

// Health check para el launcher (GET /health)
app.get('/health', (req, res) => res.json({ status: 'ok', module: 'logistics' }));

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

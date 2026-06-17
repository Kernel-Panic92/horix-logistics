import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/db.js';

// Importar rutas
import vehiculosRoutes from './routes/vehiculos.js';
import pedidosRoutes from './routes/pedidos.js';
import rutasRoutes from './routes/rutas.js';
import importadoresRoutes from './routes/importadores.js';
import healthRoutes from './routes/health.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Rutas
app.use('/api/vehiculos', vehiculosRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/importadores', importadoresRoutes);
app.use('/api/health', healthRoutes);

// Health check root
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Logistics API is running',
    version: '1.0.0'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Error interno del servidor'
  });
});

// Iniciar servidor
async function start() {
  try {
    // Verificar conexión a BD
    const resultado = await pool.query('SELECT NOW()');
    console.log('✅ Conectado a PostgreSQL');

    app.listen(PORT, () => {
      console.log(`🚀 Logistics API escuchando en puerto ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error iniciando servidor:', err);
    process.exit(1);
  }
}

start();

export default app;

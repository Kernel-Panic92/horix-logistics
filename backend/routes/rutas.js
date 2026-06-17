import express from 'express';
import pool from '../config/db.js';
import { generarRutasOptimizadas } from '../utils/vrp.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { fecha, sede } = req.query;
    let sql = `SELECT r.*, v.placa FROM logistics.rutas r JOIN logistics.vehiculos v ON r.vehiculo_id=v.id WHERE 1=1`;
    const params = [];
    if (fecha) { params.push(fecha); sql += ` AND r.fecha=$${params.length}`; }
    if (sede) { params.push(sede); sql += ` AND r.sede=$${params.length}`; }
    sql += ' ORDER BY r.id';
    const result = await pool.query(sql, params);
    res.json({ exitosa: true, total: result.rows.length, rutas: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const ruta = await pool.query('SELECT * FROM logistics.rutas WHERE id=$1', [req.params.id]);
    if (ruta.rows.length === 0) return res.status(404).json({ error: 'Ruta no encontrada' });
    const paradas = await pool.query(
      'SELECT * FROM logistics.paradas_ruta WHERE ruta_id=$1 ORDER BY secuencia', [req.params.id]
    );
    res.json({ exitosa: true, ruta: ruta.rows[0], paradas: paradas.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generar', async (req, res) => {
  try {
    const { fecha, sede } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });

    const pedidos = await pool.query(
      `SELECT id, latitud, longitud, peso_estimado, volumen_estimado
       FROM logistics.pedidos_logistica WHERE estado='pendiente' AND ruta_id IS NULL`
    );
    if (pedidos.rows.length === 0) return res.json({ exitosa: true, mensaje: 'No hay pedidos pendientes', rutas: [] });

    const vehiculos = await pool.query(
      `SELECT id, placa, ultima_posicion_lat AS lat, ultima_posicion_lng AS lng
       FROM logistics.vehiculos WHERE estado='disponible'`
    );
    if (vehiculos.rows.length === 0) return res.status(400).json({ error: 'No hay vehículos disponibles' });

    const osrmUrl = process.env.OSRM_URL || 'https://router.project-osrm.org';
    const resultado = await generarRutasOptimizadas(pedidos.rows, vehiculos.rows, osrmUrl);

    if (!resultado.exitosa) return res.status(500).json({ error: resultado.error });

    const rutasCreadas = [];
    for (const r of resultado.rutas) {
      const vehiculo = vehiculos.rows.find(v => v.id === r.vehiculoId);
      const nombre = `Ruta ${vehiculo?.placa || r.vehiculoId} - ${fecha}`;
      const nuevaRuta = await pool.query(
        `INSERT INTO logistics.rutas (nombre, fecha, vehiculo_id, sede, distancia_total_estimada,
         tiempo_estimado, estado, cantidad_paradas)
         VALUES ($1,$2,$3,$4,$5,$6,'planificada',$7) RETURNING *`,
        [nombre, fecha, r.vehiculoId, sede || null, r.distancia, r.duracion, r.paradas.length]
      );
      const rutaId = nuevaRuta.rows[0].id;

      for (let i = 0; i < r.paradas.length; i++) {
        const p = r.paradas[i];
        await pool.query(
          `INSERT INTO logistics.paradas_ruta (ruta_id, pedido_id, secuencia, latitud, longitud,
           cliente_nombre, estado)
           VALUES ($1,$2,$3,$4,$5,$6,'pendiente')`,
          [rutaId, p.id, i + 1, p.lat, p.lng, p.cliente_nombre || '']
        );
        await pool.query(
          `UPDATE logistics.pedidos_logistica SET ruta_id=$1, secuencia_en_ruta=$2, estado='asignado'
           WHERE id=$3`, [rutaId, i + 1, p.id]
        );
      }
      rutasCreadas.push(nuevaRuta.rows[0]);
    }

    res.status(201).json({
      exitosa: true,
      mensaje: `${rutasCreadas.length} rutas creadas`,
      rutas: rutasCreadas
    });
  } catch (err) {
    console.error('Error generando rutas:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { estado, distancia_total_real, tiempo_real, paradas_completadas, paradas_fallidas } = req.body;
    const result = await pool.query(
      `UPDATE logistics.rutas SET estado=COALESCE($1,estado), distancia_total_real=COALESCE($2,distancia_total_real),
       tiempo_real=COALESCE($3,tiempo_real), paradas_completadas=COALESCE($4,paradas_completadas),
       paradas_fallidas=COALESCE($5,paradas_fallidas), updated_at=CURRENT_TIMESTAMP WHERE id=$6 RETURNING *`,
      [estado, distancia_total_real, tiempo_real, paradas_completadas, paradas_fallidas, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Ruta no encontrada' });
    res.json({ exitosa: true, ruta: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

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

router.get('/diagnostico', async (req, res) => {
  try {
    const pedidosTodos = await pool.query(`SELECT id, numero_factura, estado, ruta_id, latitud, longitud FROM logistics.pedidos_logistica ORDER BY id`);
    const pedidosPendientesSinRuta = await pool.query(`SELECT id, numero_factura, latitud, longitud FROM logistics.pedidos_logistica WHERE estado='pendiente' AND ruta_id IS NULL`);
    const pedidosConCoords = await pool.query(`SELECT id, numero_factura FROM logistics.pedidos_logistica WHERE estado='pendiente' AND ruta_id IS NULL AND latitud IS NOT NULL AND longitud IS NOT NULL`);
    const vehiculosDisponibles = await pool.query(`SELECT id, placa, estado, ultima_posicion_lat, ultima_posicion_lng FROM logistics.vehiculos WHERE estado='disponible'`);
    res.json({
      pedidos_total: pedidosTodos.rows.length,
      pedidos_pendientes_sin_ruta: pedidosPendientesSinRuta.rows,
      pedidos_pendientes_con_coords: pedidosConCoords.rows,
      vehiculos_disponibles: vehiculosDisponibles.rows
    });
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
    const { fecha, sede, sede_id } = req.body;
    if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });

    let depot = null;
    let sedeNombre = sede || null;

    if (sede_id) {
      const sedeRow = await pool.query('SELECT nombre, latitud, longitud FROM logistics.sedes WHERE id=$1 AND activo=true', [sede_id]);
      if (sedeRow.rows.length === 0) return res.status(404).json({ error: 'Sede no encontrada o inactiva' });
      sedeNombre = sedeRow.rows[0].nombre;
      if (sedeRow.rows[0].latitud && sedeRow.rows[0].longitud) {
        depot = { lat: sedeRow.rows[0].latitud, lng: sedeRow.rows[0].longitud };
      }
    }

    const pedidos = await pool.query(
      `SELECT id, latitud AS lat, longitud AS lng, peso_estimado, volumen_estimado, vehiculo_id
       FROM logistics.pedidos_logistica WHERE estado='pendiente' AND ruta_id IS NULL AND latitud IS NOT NULL AND longitud IS NOT NULL`
    );
    if (pedidos.rows.length === 0) return res.status(400).json({ error: 'No hay pedidos pendientes con coordenadas. Asegúrate de que los pedidos tengan latitud y longitud.' });

    const sinVehiculo = pedidos.rows.filter(p => !p.vehiculo_id);
    if (sinVehiculo.length > 0) {
      const ids = sinVehiculo.map(p => p.id).join(', ');
      return res.status(400).json({ error: `${sinVehiculo.length} pedido(s) no tienen vehículo asignado (IDs: ${ids}). Asigne un vehículo a cada pedido antes de generar rutas.` });
    }

    const vehiculos = await pool.query(
      `SELECT id, placa, ultima_posicion_lat AS lat, ultima_posicion_lng AS lng
       FROM logistics.vehiculos WHERE estado='disponible'`
    );
    if (vehiculos.rows.length === 0) return res.status(400).json({ error: 'No hay vehículos disponibles' });

    const osrmUrl = process.env.OSRM_URL || 'https://router.project-osrm.org';
    console.log('[rutas/generar] depot:', depot, 'pedidos:', pedidos.rows.length, 'vehiculos:', vehiculos.rows.length);
    const resultado = await generarRutasOptimizadas(pedidos.rows, vehiculos.rows, osrmUrl, depot);
    console.log('[rutas/generar] resultado:', resultado);

    if (!resultado.exitosa) return res.status(500).json({ error: resultado.error });

    const rutasCreadas = [];
    for (const r of resultado.rutas) {
      const vehiculo = vehiculos.rows.find(v => v.id === r.vehiculoId);
      const nombre = `Ruta ${vehiculo?.placa || r.vehiculoId} - ${fecha}`;
      const nuevaRuta = await pool.query(
        `INSERT INTO logistics.rutas (nombre, fecha, vehiculo_id, sede, distancia_total_estimada,
         tiempo_estimado, estado, cantidad_paradas)
         VALUES ($1,$2,$3,$4,$5,$6,'planificada',$7) RETURNING *`,
        [nombre, fecha, r.vehiculoId, sedeNombre, r.distancia, r.duracion, r.paradas.length]
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

router.delete('/:id', async (req, res) => {
  try {
    const ruta = await pool.query('SELECT id FROM logistics.rutas WHERE id=$1', [req.params.id]);
    if (ruta.rows.length === 0) return res.status(404).json({ error: 'Ruta no encontrada' });
    await pool.query('UPDATE logistics.pedidos_logistica SET ruta_id=NULL, estado=\'pendiente\', secuencia_en_ruta=NULL WHERE ruta_id=$1', [req.params.id]);
    await pool.query('DELETE FROM logistics.paradas_ruta WHERE ruta_id=$1', [req.params.id]);
    await pool.query('DELETE FROM logistics.rutas WHERE id=$1', [req.params.id]);
    res.json({ exitosa: true, mensaje: 'Ruta eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids requerido' });
    await pool.query('UPDATE logistics.pedidos_logistica SET ruta_id=NULL, estado=\'pendiente\', secuencia_en_ruta=NULL WHERE ruta_id=ANY($1)', [ids]);
    await pool.query('DELETE FROM logistics.paradas_ruta WHERE ruta_id=ANY($1)', [ids]);
    const result = await pool.query('DELETE FROM logistics.rutas WHERE id=ANY($1) RETURNING id', [ids]);
    res.json({ exitosa: true, eliminados: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mapa/datos', async (req, res) => {
  try {
    const { fecha } = req.query;
    const fechaHoy = fecha || new Date().toISOString().split('T')[0];

    const rutas = await pool.query(`
      SELECT r.id, r.nombre, r.fecha, r.vehiculo_id, r.estado,
             r.distancia_total_estimada, r.tiempo_estimado, r.cantidad_paradas,
             v.placa, v.alias as vehiculo_alias,
             v.ultima_posicion_lat, v.ultima_posicion_lng
      FROM logistics.rutas r
      JOIN logistics.vehiculos v ON r.vehiculo_id=v.id
      WHERE r.fecha=$1 ORDER BY r.id`, [fechaHoy]);

    let paradas = [];
    if (rutas.rows.length > 0) {
      const r = await pool.query(`
        SELECT pr.ruta_id, pr.secuencia, pr.estado as parada_estado,
               p.id as pedido_id, p.latitud, p.longitud, p.cliente_nombre,
               p.numero_factura, p.direccion
        FROM logistics.paradas_ruta pr
        JOIN logistics.pedidos_logistica p ON pr.pedido_id=p.id
        WHERE pr.ruta_id = ANY($1) ORDER BY pr.ruta_id, pr.secuencia`,
        [rutas.rows.map(r => r.id)]);
      paradas = r.rows;
    }

    const vehiculos = await pool.query(`
      SELECT id, placa, alias, ultima_posicion_lat, ultima_posicion_lng, estado
      FROM logistics.vehiculos WHERE ultima_posicion_lat IS NOT NULL`);

    res.json({
      exitosa: true,
      rutas: rutas.rows,
      paradas,
      vehiculos: vehiculos.rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;

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
    const { fecha, sede, sede_id, ruta, tipo } = req.body;
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

    const rutaCol = tipo === 'moto' ? 'c.ruta_moto' : 'c.ruta';
    const pedidos = await pool.query(
      `SELECT p.id, p.latitud AS lat, p.longitud AS lng, p.peso_estimado, p.volumen_estimado,
              p.vehiculo_id, p.cliente_nombre, p.direccion, ${rutaCol} AS cliente_ruta
       FROM logistics.pedidos_logistica p
       LEFT JOIN logistics.clientes c ON c.id = p.cliente_id
       WHERE p.estado='pendiente' AND p.ruta_id IS NULL
         AND p.latitud IS NOT NULL AND p.longitud IS NOT NULL`
    );
    if (pedidos.rows.length === 0) return res.status(400).json({ error: 'No hay pedidos pendientes con coordenadas. Asegúrate de que los pedidos tengan latitud y longitud.' });

    const vehiculos = await pool.query(
      `SELECT id, placa, ultima_posicion_lat AS lat, ultima_posicion_lng AS lng
       FROM logistics.vehiculos WHERE estado='disponible'`
    );
    if (vehiculos.rows.length === 0) return res.status(400).json({ error: 'No hay vehículos disponibles' });

    // Agrupar pedidos por cliente.ruta
    const grupos = {};
    for (const p of pedidos.rows) {
      const key = p.cliente_ruta || 'Sin ruta';
      if (ruta && key !== ruta) continue;
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(p);
    }
    const nombresRuta = Object.keys(grupos);
    if (nombresRuta.length === 0) return res.status(400).json({
      error: ruta ? `No hay pedidos pendientes para la ruta "${ruta}"` : 'No hay pedidos pendientes con ruta asignada. Asigne una ruta a los clientes primero.'
    });

    const osrmUrl = process.env.OSRM_URL || 'https://router.project-osrm.org';
    const rutasCreadas = [];
    let vehiculoIdx = 0;

    for (const nombreRuta of nombresRuta) {
      const grupo = grupos[nombreRuta];
      const vehiculo = vehiculos.rows[vehiculoIdx % vehiculos.rows.length];
      vehiculoIdx++;

      console.log(`[rutas/generar] grupo "${nombreRuta}": ${grupo.length} pedidos, vehiculo #${vehiculo.id} (${vehiculo.placa})`);

      // Asignar vehiculo_id del vehículo a cada pedido del grupo para que el VRP lo agrupe correctamente
      const pedidosGrupo = grupo.map(p => ({ ...p, vehiculo_id: vehiculo.id }));

      const resultado = await generarRutasOptimizadas(pedidosGrupo, [vehiculo], osrmUrl, depot);
      console.log(`[rutas/generar] resultado grupo "${nombreRuta}":`, resultado);

      if (!resultado.exitosa || resultado.rutas.length === 0) {
        console.log(`[rutas/generar] grupo "${nombreRuta}" no generó ruta:`, resultado.error || 'sin rutas');
        continue;
      }

      const rOpt = resultado.rutas[0];
      const nombre = `${nombreRuta} - ${fecha}`;
      const nuevaRuta = await pool.query(
        `INSERT INTO logistics.rutas (nombre, fecha, vehiculo_id, sede, distancia_total_estimada,
         tiempo_estimado, estado, cantidad_paradas)
         VALUES ($1,$2,$3,$4,$5,$6,'planificada',$7) RETURNING *`,
        [nombre, fecha, rOpt.vehiculoId, sedeNombre, rOpt.distancia, rOpt.duracion, rOpt.paradas.length]
      );
      const rutaId = nuevaRuta.rows[0].id;

      for (let i = 0; i < rOpt.paradas.length; i++) {
        const p = rOpt.paradas[i];
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
      mensaje: `${rutasCreadas.length} ruta(s) creada(s) de ${nombresRuta.length} grupo(s)`,
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
      FROM logistics.vehiculos WHERE ultima_posicion_lat IS NOT NULL AND ultima_posicion_lng IS NOT NULL`);

    const sedes = await pool.query(`
      SELECT id, nombre, centro_operacion, ciudad, direccion, latitud, longitud
      FROM logistics.sedes WHERE activo=true AND latitud IS NOT NULL AND longitud IS NOT NULL`);

    res.json({
      exitosa: true,
      rutas: rutas.rows,
      paradas,
      vehiculos: vehiculos.rows,
      sedes: sedes.rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;

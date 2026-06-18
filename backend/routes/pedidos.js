import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { fecha, estado } = req.query;
    let sql = 'SELECT p.*, c.nombre AS cliente_nombre_real FROM logistics.pedidos_logistica p LEFT JOIN logistics.clientes c ON c.id = p.cliente_id WHERE 1=1';
    const params = [];
    if (fecha) { params.push(fecha); sql += ` AND DATE(created_at)=$${params.length}`; }
    if (estado) { params.push(estado); sql += ` AND estado=$${params.length}`; }
    sql += ' ORDER BY id';
    const result = await pool.query(sql, params);
    res.json({ exitosa: true, total: result.rows.length, pedidos: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pendientes/lista', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.nombre AS cliente_nombre_real FROM logistics.pedidos_logistica p LEFT JOIN logistics.clientes c ON c.id = p.cliente_id WHERE p.estado='pendiente' AND p.ruta_id IS NULL ORDER BY p.id`
    );
    res.json({ exitosa: true, total: result.rows.length, pedidos: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.nombre as cliente_nombre_tabla, c.direccion as cliente_direccion, c.ciudad as cliente_ciudad, c.telefono as cliente_telefono
       FROM logistics.pedidos_logistica p
       LEFT JOIN logistics.clientes c ON c.id = p.cliente_id
       WHERE p.id=$1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ exitosa: true, pedido: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { numero_factura, cliente_id, cliente_nombre, direccion, ciudad, telefono, valor_credito, estado } = req.body;
    if (!numero_factura) return res.status(400).json({ error: 'numero_factura requerido' });
    const result = await pool.query(
      `INSERT INTO logistics.pedidos_logistica (numero_factura, cliente_id, cliente_nombre, direccion, ciudad, telefono, valor_credito, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [numero_factura, cliente_id, cliente_nombre, direccion, ciudad, telefono, valor_credito, estado || 'pendiente']
    );
    res.status(201).json({ exitosa: true, pedido: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { numero_factura, cliente_id, cliente_nombre, direccion, ciudad, telefono, valor_credito, estado, ruta_id, secuencia_en_ruta } = req.body;
    const result = await pool.query(
      `UPDATE logistics.pedidos_logistica SET
        numero_factura=COALESCE($1,numero_factura),
        cliente_id=COALESCE($2,cliente_id),
        cliente_nombre=COALESCE($3,cliente_nombre),
        direccion=COALESCE($4,direccion),
        ciudad=COALESCE($5,ciudad),
        telefono=COALESCE($6,telefono),
        valor_credito=COALESCE($7,valor_credito),
        estado=COALESCE($8,estado),
        ruta_id=COALESCE($9,ruta_id),
        secuencia_en_ruta=COALESCE($10,secuencia_en_ruta),
        updated_at=CURRENT_TIMESTAMP
       WHERE id=$11 RETURNING *`,
      [numero_factura, cliente_id, cliente_nombre, direccion, ciudad, telefono, valor_credito, estado, ruta_id, secuencia_en_ruta, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ exitosa: true, pedido: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/seleccionados', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids requerido' });
    const result = await pool.query('DELETE FROM logistics.pedidos_logistica WHERE id = ANY($1::int[]) RETURNING id', [ids]);
    res.json({ eliminados: result.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM logistics.pedidos_logistica WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ exitosa: true, mensaje: 'Pedido eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { fecha, estado } = req.query;
    let sql = 'SELECT * FROM logistics.pedidos_logistica WHERE 1=1';
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
      `SELECT * FROM logistics.pedidos_logistica WHERE estado='pendiente' AND ruta_id IS NULL ORDER BY id`
    );
    res.json({ exitosa: true, total: result.rows.length, pedidos: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM logistics.pedidos_logistica WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ exitosa: true, pedido: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { estado, ruta_id, secuencia_en_ruta } = req.body;
    const result = await pool.query(
      `UPDATE logistics.pedidos_logistica SET estado=COALESCE($1,estado), ruta_id=COALESCE($2,ruta_id),
       secuencia_en_ruta=COALESCE($3,secuencia_en_ruta), updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,
      [estado, ruta_id, secuencia_en_ruta, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ exitosa: true, pedido: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

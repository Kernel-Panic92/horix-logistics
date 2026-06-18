import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    let sql = `
      SELECT c.*, (SELECT COUNT(*) FROM logistics.pedidos_logistica p WHERE p.cliente_id=c.id) as cantidad_pedidos
      FROM logistics.clientes c`;
    const params = [];
    if (q) {
      sql += ` WHERE LOWER(c.nombre) LIKE $1 OR LOWER(c.direccion) LIKE $1 OR LOWER(c.ciudad) LIKE $1`;
      params.push('%' + q.toLowerCase() + '%');
    }
    sql += ' ORDER BY c.ultima_importacion DESC NULLS LAST, c.nombre LIMIT 100';
    const result = await pool.query(sql, params);
    res.json({ clientes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

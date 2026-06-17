import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import { parsearPdfSiesa } from '../utils/siesaPdfParser.js';
import { parsearWidetech } from '../utils/widgetechExcelParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

const router = express.Router();

router.get('/historial', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM logistics.importaciones ORDER BY created_at DESC LIMIT 20');
    res.json({ exitosa: true, importaciones: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/siesa', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo PDF requerido' });

    const resultado = await parsearPdfSiesa(req.file.path);

    if (!resultado.exitosa) {
      await pool.query(
        `INSERT INTO logistics.importaciones (tipo, nombre_archivo, registros_importados, registros_fallidos, estado, detalles)
         VALUES ('siesa_pdf', $1, 0, 0, 'fallida', $2)`,
        [req.file.originalname, JSON.stringify({ error: resultado.error })]
      );
      return res.status(422).json({ error: resultado.error });
    }

    let importados = 0;
    let fallidos = 0;
    const errores = [];

    for (const pedido of resultado.pedidos) {
      try {
        await pool.query(
          `INSERT INTO logistics.pedidos_logistica (numero_factura, cliente_nombre, direccion, valor_credito, estado)
           VALUES ($1, $2, $3, $4, 'pendiente')
           ON CONFLICT (numero_factura) DO NOTHING`,
          [pedido.numeroFactura, pedido.clienteDir, pedido.direccion || '', pedido.valor || 0]
        );
        importados++;
      } catch (e) {
        fallidos++;
        errores.push({ factura: pedido.numeroFactura, error: e.message });
      }
    }

    await pool.query(
      `INSERT INTO logistics.importaciones (tipo, nombre_archivo, registros_importados, registros_fallidos, estado, detalles)
       VALUES ('siesa_pdf', $1, $2, $3, $4, $5)`,
      [req.file.originalname, importados, fallidos, fallidos > 0 ? 'parcial' : 'exitosa',
       JSON.stringify({ conductor: resultado.conductor, placa: resultado.placa, errores })]
    );

    fs.unlink(req.file.path, () => {});

    res.json({
      exitosa: true,
      totalPedidos: resultado.totalPedidos,
      importados, fallidos,
      conductor: resultado.conductor,
      placa: resultado.placa
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

router.post('/widetech', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo Excel requerido' });

    const resultado = await parsearWidetech(req.file.path);

    if (!resultado.exitosa) {
      await pool.query(
        `INSERT INTO logistics.importaciones (tipo, nombre_archivo, registros_importados, registros_fallidos, estado, detalles)
         VALUES ('widetech_excel', $1, 0, 0, 'fallida', $2)`,
        [req.file.originalname, JSON.stringify({ error: resultado.error })]
      );
      return res.status(422).json({ error: resultado.error });
    }

    let importados = 0;
    let fallidos = 0;

    for (const registro of resultado.registros) {
      try {
        let vehiculoId = null;
        const veh = await pool.query('SELECT id FROM logistics.vehiculos WHERE placa=$1', [registro.placa]);
        if (veh.rows.length > 0) {
          vehiculoId = veh.rows[0].id;
        } else {
          const nuevo = await pool.query(
            `INSERT INTO logistics.vehiculos (placa, alias, estado) VALUES ($1,$2,'disponible') ON CONFLICT (placa) DO UPDATE SET alias=EXCLUDED.alias RETURNING id`,
            [registro.placa, registro.alias]
          );
          vehiculoId = nuevo.rows[0].id;
        }

        await pool.query(
          `INSERT INTO logistics.posiciones_gps (vehiculo_id, fecha_gps, latitud, longitud, localizacion, velocidad, rumbo)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [vehiculoId, registro.fechaGPS, registro.latitud, registro.longitud,
           registro.localizacion, registro.velocidad, registro.rumbo]
        );
        importados++;
      } catch {
        fallidos++;
      }
    }

    await pool.query(
      `INSERT INTO logistics.importaciones (tipo, nombre_archivo, registros_importados, registros_fallidos, estado, detalles)
       VALUES ('widetech_excel', $1, $2, $3, $4, $5)`,
      [req.file.originalname, importados, fallidos, fallidos > 0 ? 'parcial' : 'exitosa', '{}']
    );

    fs.unlink(req.file.path, () => {});

    res.json({
      exitosa: true,
      totalRegistros: resultado.totalRegistros,
      vehiculosUnicos: resultado.vehiculosUnicos,
      importados, fallidos
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: err.message });
  }
});

export default router;

import pdfParse from 'pdf-parse';
import fs from 'fs';

export async function parsearPdfSiesa(rutaArchivo) {
  try {
    const dataBuffer = fs.readFileSync(rutaArchivo);
    const data = await pdfParse(dataBuffer);
    const texto = data.text;
    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);

    const meta = { conductor: null, placa: null, nroGuia: null, fecha: null };
    const pedidos = [];
    let enTabla = false;

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];

      if (/conductor/i.test(l)) meta.conductor = extraerValor(l, i + 1 < lineas.length ? lineas[i + 1] : null);
      if (/placa/i.test(l) && !/alias/i.test(l)) meta.placa = extraerValor(l, i + 1 < lineas.length ? lineas[i + 1] : null);
      if (/nro\.?\s*guia|guía/i.test(l)) meta.nroGuia = extraerValor(l, i + 1 < lineas.length ? lineas[i + 1] : null);
      if (/fecha/i.test(l) && !/gps/i.test(l)) meta.fecha = extraerValor(l, i + 1 < lineas.length ? lineas[i + 1] : null);
    }

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];

      if (/(documento|factura).*cliente/i.test(l)) {
        enTabla = true;
        continue;
      }

      if (/total(es)?:|totales/i.test(l)) {
        enTabla = false;
        continue;
      }

      if (enTabla && l.startsWith('FEV-')) {
        const cols = l.split(/\s{2,}/).filter(Boolean);
        if (cols.length >= 3) {
          pedidos.push({
            numeroFactura: cols[0],
            clienteNombre: cols[1] || '',
            direccion: cols.length > 2 ? cols.slice(2, -2).join(' ') : '',
            ciudad: cols.length > 3 ? cols[cols.length - 2] || '' : '',
            telefono: cols.length > 2 ? cols[cols.length - 1] || '' : '',
            valor: extraerValorNumerico(cols[cols.length - 1])
          });
        } else {
          pedidos.push({
            numeroFactura: cols[0],
            clienteNombre: '',
            direccion: '',
            ciudad: '',
            telefono: '',
            valor: 0
          });
        }
      }
    }

    return {
      exitosa: true,
      ...meta,
      totalPedidos: pedidos.length,
      pedidos
    };
  } catch (err) {
    console.error('Error al parsear PDF:', err);
    return { exitosa: false, error: err.message, pedidos: [] };
  }
}

function extraerValor(lineaActual, lineaSiguiente) {
  if (lineaActual.includes(':')) {
    const p = lineaActual.split(':')[1]?.trim();
    if (p) return p;
  }
  if (lineaSiguiente && !lineaSiguiente.startsWith('FEV-') && !/documento|total/i.test(lineaSiguiente)) {
    return lineaSiguiente;
  }
  return null;
}

function extraerValorNumerico(s) {
  if (!s) return 0;
  const limpio = s.replace(/[^0-9,]/g, '').replace('.', '').replace(',', '.');
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}

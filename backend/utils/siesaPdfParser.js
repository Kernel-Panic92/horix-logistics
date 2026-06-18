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
    let debug = { sampleLines: lineas.slice(0, 40) };

    // 1. Extraer metadata
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      const sig = i + 1 < lineas.length ? lineas[i + 1] : null;

      if (/conductor/i.test(l) && !meta.conductor) meta.conductor = extraerValor(l, sig);
      if (/placa/i.test(l) && !/alias/i.test(l) && !meta.placa) meta.placa = extraerValor(l, sig);
      if (/(nro\.?\s*guia|guía)/i.test(l) && !meta.nroGuia) meta.nroGuia = extraerValor(l, sig);
      if (/fecha/i.test(l) && !/gps/i.test(l) && !meta.fecha) meta.fecha = extraerValor(l, sig);
    }

    // 2. Encontrar inicio de la tabla de pedidos
    let inicioTabla = -1;
    let inicioDatos = -1;
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      // Detectar encabezado de tabla
      if (/(documento|factura|num).*(cliente|nombre|raz.n)/i.test(l)) {
        inicioTabla = i;
        enTabla = true;
        debug.headerLine = l;
        debug.headerIndex = i;
        continue;
      }
      // Si estamos en tabla y la línea parece un código de factura (ej: FEV-123, INVOICE-123, o código alfanumérico con guión)
      if (enTabla && /^[A-Z]{2,6}[-]\d+/i.test(l)) {
        if (inicioDatos < 0) inicioDatos = i;
        const cols = l.split(/\s{2,}/).filter(Boolean);
        if (cols.length >= 2) {
          pedidos.push({
            numeroFactura: cols[0],
            clienteNombre: cols[1] || '',
            direccion: cols.length > 2 ? cols.slice(2, cols.length - (cols.length > 3 ? 2 : 1)).join(' ') : '',
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
        continue;
      }
      // Fin de tabla
      if (enTabla && /total(es)?:|totales|subtotal/i.test(l)) {
        enTabla = false;
        debug.totalLine = l;
      }
    }

    // 3. Fallback: si no se encontró tabla con el método anterior,
    //    buscar líneas con patrón de factura en todo el documento
    if (pedidos.length === 0) {
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        // Buscar cualquier línea que parezca una factura FEV- seguida de datos
        if (/^FEV-\d+/i.test(l) || /^\d{6,10}\s+/.test(l)) {
          const cols = l.split(/\s{2,}/).filter(Boolean);
          pedidos.push({
            numeroFactura: cols[0],
            clienteNombre: cols.length > 1 ? cols[1] : '',
            direccion: cols.length > 2 ? cols.slice(2, cols.length - (cols.length > 3 ? 2 : 1)).join(' ') : '',
            ciudad: cols.length > 3 ? cols[cols.length - 2] || '' : '',
            telefono: cols.length > 2 ? cols[cols.length - 1] || '' : '',
            valor: extraerValorNumerico(cols[cols.length - 1])
          });
        }
      }
      if (pedidos.length > 0) debug.fallbackUsed = true;
    }

    return {
      exitosa: true,
      ...meta,
      totalPedidos: pedidos.length,
      pedidos,
      _debug: debug
    };
  } catch (err) {
    console.error('Error al parsear PDF:', err);
    return { exitosa: false, error: err.message, pedidos: [], _debug: { error: err.message } };
  }
}

function extraerValor(lineaActual, lineaSiguiente) {
  if (lineaActual.includes(':')) {
    const p = lineaActual.split(':')[1]?.trim();
    if (p) return p;
  }
  if (lineaSiguiente && !/^FEV-/i.test(lineaSiguiente) && !/documento|total|subtotal/i.test(lineaSiguiente) && lineaSiguiente.length < 60) {
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

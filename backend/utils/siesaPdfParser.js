import pdfParse from 'pdf-parse';
import fs from 'fs';

export async function parsearPdfSiesa(rutaArchivo) {
  try {
    const dataBuffer = fs.readFileSync(rutaArchivo);
    const data = await pdfParse(dataBuffer);
    const rawText = data.text;
    const lineas = rawText.split('\n').map(l => l.trim()).filter(Boolean);

    const meta = { conductor: null, placa: null, nroGuia: null, fecha: null };
    const pedidos = [];
    const encontradas = new Set();
    const debug = { sampleLines: lineas.slice(0, 50) };

    // 1. Extraer metadata
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      const sig = i + 1 < lineas.length ? lineas[i + 1] : null;

      if (/conductor/i.test(l) && !meta.conductor) meta.conductor = extraerValor(l, sig);
      if (/placa/i.test(l) && !/alias/i.test(l) && !meta.placa) meta.placa = extraerValor(l, sig);
      if (/(nro\.?\s*guia|guía|cpl)/i.test(l) && !meta.nroGuia) meta.nroGuia = extraerValor(l, sig);
      if (/fecha/i.test(l) && !/gps/i.test(l) && !meta.fecha) meta.fecha = extraerValor(l, sig);
    }

    // 2. Encontrar table header (más variantes)
    let headerFound = false;
    let inTable = false;
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      if (/(documento|factura|num|folio).*(cliente|nombre|raz.n|direcci).*/i.test(l)) {
        headerFound = true;
        inTable = true;
        debug.headerLine = l;
        debug.headerIndex = i;
        continue;
      }
      // Detectar fin de tabla
      if (inTable && /^total(es)?:|totales|subtotal|suma/i.test(l)) {
        inTable = false;
        debug.totalLine = l;
        continue;
      }
      // Si estamos en tabla, extraer filas
      if (inTable) {
        const row = extraerFila(l);
        if (row && !encontradas.has(row.numeroFactura)) {
          pedidos.push(row);
          encontradas.add(row.numeroFactura);
        }
      }
    }

    // 3. Fallback: buscar FEV en todo el texto si no se encontraron pedidos
    if (pedidos.length === 0 || !headerFound) {
      debug.fallbackScan = true;
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        const row = extraerFila(l);
        if (row && !encontradas.has(row.numeroFactura)) {
          pedidos.push(row);
          encontradas.add(row.numeroFactura);
        }
      }
    }

    // 4. Fallback extremo: buscar líneas con patrón "FEV-" en cualquier posición
    if (pedidos.length === 0) {
      debug.fallbackFev = true;
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        const fevMatch = l.match(/\b(FEV[-\s]?\d+)\b/i);
        if (fevMatch) {
          const cols = l.split(/\s{2,}/).filter(Boolean);
          if (cols.length < 2) {
            // Split by single space as last resort
            const sc = l.split(/\s+/).filter(Boolean);
            if (sc.length >= 2) cols.length = 0; sc.forEach((c, j) => cols[j] = c);
          }
          const factura = fevMatch[1].replace(/\s/, '-').toUpperCase();
          if (!encontradas.has(factura)) {
            pedidos.push(crearPedido(cols));
            encontradas.add(factura);
          }
        }
      }
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

function extraerFila(l) {
  // Estrategia 1: línea empieza con código de factura
  if (/^(FEV[-\s]?\d+|[A-Z]{2,6}-\d+|\d{6,15})\s/i.test(l)) {
    const cols = splitColumnas(l);
    if (cols.length >= 2) return crearPedido(cols);
  }
  // Estrategia 2: contiene "FEV-" en cualquier parte
  const fevAt = l.indexOf('FEV-');
  if (fevAt >= 0) {
    const rest = l.substring(fevAt);
    const cols = splitColumnas(rest);
    if (cols.length >= 2) return crearPedido(cols);
  }
  // Estrategia 3: contiene "FEV " (con espacio)
  const fevSpace = l.match(/\bFEV\s+(\d+)\b/i);
  if (fevSpace) {
    const factura = 'FEV-' + fevSpace[1];
    const cols = splitColumnas(l.replace(/\bFEV\s+(\d+)\b/i, 'FEV-$1'));
    if (cols.length >= 2) {
      const p = crearPedido(cols);
      p.numeroFactura = factura;
      return p;
    }
  }
  // Estrategia 4: línea con formato "XXXX-999" seguido de texto y valor numérico al final
  if (/^[A-Z0-9]{4,15}[-]\d{3,10}\s+/i.test(l)) {
    const cols = splitColumnas(l);
    if (cols.length >= 2) return crearPedido(cols);
  }
  return null;
}

function splitColumnas(l) {
  // Intenta dividir por 2+ espacios (típico en PDFs con columnas)
  let cols = l.split(/\s{2,}/).filter(Boolean);
  if (cols.length >= 3) return cols;
  // Fallback: dividir por 1+ espacio y re-agrupar
  cols = l.split(/\s+/).filter(Boolean);
  if (cols.length >= 5) {
    // Si hay 5+ tokens, asumir: factura, cliente, direccion, ciudad/tel, valor
    const factura = cols[0];
    const valor = extraerValorNumerico(cols[cols.length - 1]);
    const telefono = /^\d{7,15}$/.test(cols[cols.length - 2]) ? cols[cols.length - 2] : '';
    const ciudad = cols[cols.length - (telefono ? 3 : 2)];
    const cliente = cols.slice(1, cols.length - (telefono ? 3 : 2)).join(' ');
    return [factura, cliente, '', ciudad, telefono, String(valor)];
  }
  return cols;
}

function crearPedido(cols) {
  return {
    numeroFactura: cols[0] || 'DESCONOCIDO',
    clienteNombre: cols.length > 1 ? cols[1] || '' : '',
    direccion: cols.length > 2 ? cols.slice(2, cols.length - (cols.length > 3 ? 2 : 1)).join(' ') : '',
    ciudad: cols.length > 3 ? cols[cols.length - 2] || '' : '',
    telefono: cols.length > 2 ? cols[cols.length - 1] || '' : '',
    valor: extraerValorNumerico(cols[cols.length - 1])
  };
}

function extraerValor(lineaActual, lineaSiguiente) {
  if (lineaActual.includes(':')) {
    const p = lineaActual.split(':')[1]?.trim();
    if (p && p.length < 60) return p;
  }
  if (lineaSiguiente && !/FEV|documento|total|subtotal|suma/i.test(lineaSiguiente) && lineaSiguiente.length < 60) {
    return lineaSiguiente;
  }
  return null;
}

function extraerValorNumerico(s) {
  if (!s) return 0;
  const limpio = String(s).replace(/[^0-9,]/g, '').replace('.', '').replace(',', '.');
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}

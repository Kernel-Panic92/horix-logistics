import pdfParse from 'pdf-parse';
import fs from 'fs';

export async function parsearPdfSiesa(rutaArchivo) {
  try {
    const dataBuffer = fs.readFileSync(rutaArchivo);
    const data = await pdfParse(dataBuffer);
    const texto = data.text;
    const lineas = texto.split('\n').map(l => l.trim());

    const meta = { conductor: null, placa: null, nroGuia: null, fecha: null };
    const pedidos = [];
    const debug = { sampleLines: lineas.slice(0, 50) };

    // 1. Extraer metadata de TODAS las líneas
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      const sig = i + 1 < lineas.length ? lineas[i + 1] : null;
      if (!l) continue;

      if (/conductor/i.test(l) && !meta.conductor) meta.conductor = extraerValor(l, sig);
      if (/placa/i.test(l) && !/alias/i.test(l) && !meta.placa) meta.placa = extraerValor(l, sig);
      if (/(nro\.?\s*guia|guía)/i.test(l) && !meta.nroGuia) meta.nroGuia = extraerValor(l, sig);

      if (/fecha/i.test(l) && !/gps/i.test(l) && !meta.fecha) {
        const f = extraerValor(l, sig);
        // La fecha puede estar en el mismo renglón: "Fecha: 6/01/2021" o "6/01/2021"
        if (f) meta.fecha = f;
      }
      // CPL number puede estar suelto como "CPL-00006767"
      if (!meta.nroGuia && /^CPL[-]\d+/i.test(l.trim())) meta.nroGuia = l.trim();
    }

    // 2. Buscar líneas con FEV- (están concatenadas al valor, ej: "000,00FEV-00010195")
    const fevLines = []; // { lineIndex, fevNumber, valor, cliente }
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      // Buscar patrón: valor (con puntos y comas) seguido inmediatamente de FEV-99999
      const match = l.match(/([\d\.]+\,\d{2})FEV[-\s]?(\d+)/i);
      if (match) {
        const valorRaw = match[1];       // "460.072,000,00" o "460.072,00"
        const fevNum = match[2];         // "00010195"
        const before = l.substring(0, match.index).trim();
        fevLines.push({
          lineIndex: i,
          fevNumber: 'FEV-' + fevNum,
          valor: parsearValorColombiano(valorRaw),
          cliente: before,
          ciudad: '',
          direccion: '',
          telefono: ''
        });
      }
    }

    // 3. Para cada FEV, buscar la línea siguiente con ciudad + dirección + teléfono
    for (const fev of fevLines) {
      const nextIdx = fev.lineIndex + 1;
      if (nextIdx < lineas.length) {
        const nextLine = lineas[nextIdx];
        if (nextLine && !nextLine.startsWith('**') && !/total|documento|conductor|placa|nro\.guia/i.test(nextLine)) {
          // Extraer ciudad (primera palabra), teléfono (último número de 7+ dígitos)
          const phoneMatch = nextLine.match(/(\d{7,15})$/);
          fev.telefono = phoneMatch ? phoneMatch[1] : '';
          let rest = phoneMatch ? nextLine.substring(0, phoneMatch.index).trim() : nextLine;

          // La primera palabra es la ciudad
          const parts = rest.split(/\s+/);
          fev.ciudad = parts[0] || '';
          fev.direccion = parts.slice(1).join(' ') || '';
        }
      }
    }

    // 4. Si no se encontraron FEVs con el método anterior, intentar búsqueda más amplia
    if (fevLines.length === 0) {
      debug.fallbackUsed = true;
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        // Buscar FEV- en cualquier posición (sin valor antes)
        const simpleMatch = l.match(/\bFEV[-\s]?(\d+)\b/i);
        if (simpleMatch) {
          const fevNum = simpleMatch[1];
          const before = l.substring(0, simpleMatch.index).trim();
          // Intentar extraer valor de lo que está antes
          const valorMatch = before.match(/([\d\.]+\,[\d\.]+)$/);
          fevLines.push({
            lineIndex: i,
            fevNumber: 'FEV-' + fevNum,
            valor: valorMatch ? parsearValorColombiano(valorMatch[1]) : 0,
            cliente: valorMatch ? before.substring(0, before.length - valorMatch[1].length).trim() : before,
            ciudad: '', direccion: '', telefono: ''
          });
        }
      }
      // Re-intentar extraer ciudad/dirección/tel para cada uno
      for (const fev of fevLines) {
        const nextIdx = fev.lineIndex + 1;
        if (nextIdx < lineas.length) {
          const nextLine = lineas[nextIdx];
          if (nextLine && !nextLine.startsWith('**') && !/total|documento|conductor|placa/i.test(nextLine)) {
            const phoneMatch = nextLine.match(/(\d{7,15})$/);
            fev.telefono = phoneMatch ? phoneMatch[1] : '';
            let rest = phoneMatch ? nextLine.substring(0, phoneMatch.index).trim() : nextLine;
            const parts = rest.split(/\s+/);
            fev.ciudad = parts[0] || '';
            fev.direccion = parts.slice(1).join(' ') || '';
          }
        }
      }
    }

    for (const fev of fevLines) {
      pedidos.push({
        numeroFactura: fev.fevNumber,
        clienteNombre: fev.cliente || '',
        direccion: fev.direccion || '',
        ciudad: fev.ciudad || '',
        telefono: fev.telefono || '',
        valor: fev.valor || 0
      });
    }

    debug.fevEncontrados = fevLines.length;
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
  // Primero intentar con ":" ej: "Conductor : Juan"
  if (lineaActual.includes(':')) {
    const parts = lineaActual.split(':');
    if (parts.length >= 2) {
      const v = parts.slice(1).join(':').trim();
      if (v && v.length < 80) return v;
    }
  }
  // Si no, la línea siguiente puede ser el valor (ej: "Placa :" + "TVD 921" en la sig línea)
  if (lineaSiguiente && lineaSiguiente.length < 80 && !/FEV|total|documento|\*\*/i.test(lineaSiguiente)) {
    return lineaSiguiente.trim();
  }
  return null;
}

function parsearValorColombiano(s) {
  if (!s) return 0;
  // Formato colombiano: 460.072,00 → 460072.00
  // También puede ser 460.072,000,00 (miles con punto, decimales con coma)
  // Normalizar: quitar puntos de miles, reemplazar coma por punto
  let limpio = String(s).trim();
  // Si tiene múltiples comas, la última es el separador decimal
  const commaCount = (limpio.match(/,/g) || []).length;
  if (commaCount > 1) {
    // Ej: "460.072,000,00" → última coma es decimal, las otras son separadores de miles
    const lastComma = limpio.lastIndexOf(',');
    limpio = limpio.substring(0, lastComma).replace(/\./g, '').replace(/,/g, '') + '.' + limpio.substring(lastComma + 1);
  } else if (commaCount === 1) {
    limpio = limpio.replace(/\./g, '').replace(',', '.');
  } else {
    limpio = limpio.replace(/\./g, '');
  }
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}

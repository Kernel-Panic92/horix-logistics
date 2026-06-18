import pdfParse from 'pdf-parse';
import fs from 'fs';

const CIUDADES_CONOCIDAS = ['santa bárbara', 'santa barbara', 'la pintada', 'el jardín', 'el jardin'];

export async function parsearPdfSiesa(rutaArchivo) {
  try {
    const dataBuffer = fs.readFileSync(rutaArchivo);
    const data = await pdfParse(dataBuffer);
    const texto = data.text;
    const lineas = texto.split('\n').map(l => l.trim());

    const meta = { conductor: null, placa: null, nroGuia: null, fecha: null };
    const pedidos = [];
    const debug = { sampleLines: lineas.slice(0, 20) };

    // 1. Metadata
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      const sig = i + 1 < lineas.length ? lineas[i + 1] : null;
      if (!l) continue;

      if (/conductor/i.test(l) && !meta.conductor) meta.conductor = extraerValor(l, sig);
      if (/placa/i.test(l) && !/alias/i.test(l) && !meta.placa) meta.placa = extraerValor(l, sig);
      if (/(nro\.?\s*guia|guía)/i.test(l) && !meta.nroGuia) meta.nroGuia = extraerValor(l, sig);
      if (/fecha/i.test(l) && !/gps/i.test(l) && !meta.fecha) { const f = extraerValor(l, sig); if (f) meta.fecha = f; }
      if (!meta.nroGuia && /^CPL[-]\d+/i.test(l.trim())) meta.nroGuia = l.trim();
    }

    // 2. Buscar FEVs con regex que tolera dígitos extra entre valor y FEV
    //    Formato: "... CLIENTE 999.999,99[digitos extra]FEV-99999"
    //    Ej:     "CLIENTE 460.072,000,00FEV-00010195"
    //    → valorRaw = "460.072,00" (último ,dd antes de FEV)
    const fevLines = [];
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      // Buscar valor + FEV pegados: dígitos,puntoycoma,dígitos,FEV
      const match = l.match(/(\d[\d\.]*,\d{2})\d*FEV[-\s]?(\d+)/i);
      if (match) {
        const valorRaw = match[1];
        const fevNum = match[2];
        const before = l.substring(0, match.index).trim();
        fevLines.push({
          lineIndex: i,
          fevNumber: 'FEV-' + fevNum,
          valor: parsearValorColombiano(valorRaw),
          cliente: before,
          ciudad: '', direccion: '', telefono: ''
        });
      }
    }

    // 3. Para cada FEV, extraer ciudad + dirección + teléfono de la línea siguiente
    for (const fev of fevLines) {
      const nextIdx = fev.lineIndex + 1;
      if (nextIdx >= lineas.length) continue;
      const nl = lineas[nextIdx];
      if (!nl || nl.startsWith('**') || /total|documento|conductor|placa|nro\.guia|viene|continúa/i.test(nl)) continue;

      // Teléfono: último grupo de 7+ dígitos
      const phoneMatch = nl.match(/(\d{7,15})\s*$/);
      fev.telefono = phoneMatch ? phoneMatch[1] : '';
      let resto = phoneMatch ? nl.substring(0, phoneMatch.index).trim() : nl;

      // Ciudad: puede ser 1 o 2 palabras. Probar 2 palabras primero.
      const partes = resto.split(/\s+/);
      let ciudad = '';
      let direccion = resto;

      if (partes.length >= 2) {
        const dosPalabras = (partes[0] + ' ' + partes[1]).toLowerCase();
        if (CIUDADES_CONOCIDAS.includes(dosPalabras)) {
          ciudad = partes[0] + ' ' + partes[1];
          direccion = partes.slice(2).join(' ');
        }
      }
      if (!ciudad) {
        ciudad = partes[0] || '';
        direccion = partes.slice(1).join(' ') || '';
      }

      fev.ciudad = ciudad;
      fev.direccion = direccion;
    }

    // 4. Fallback: si no se encontraron FEVs, buscar FEV- en cualquier posición
    if (fevLines.length === 0) {
      debug.fallbackUsed = true;
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        const idx = l.indexOf('FEV-');
        if (idx < 0) continue;
        const fevNum = l.substring(idx + 4).match(/^\d+/);
        if (!fevNum) continue;
        const before = l.substring(0, idx).trim();
        const vMatch = before.match(/(\d[\d\.]*,\d{2})$/);
        fevLines.push({
          lineIndex: i,
          fevNumber: 'FEV-' + fevNum[0],
          valor: vMatch ? parsearValorColombiano(vMatch[1]) : 0,
          cliente: vMatch ? before.substring(0, before.length - vMatch[1].length).trim() : before,
          ciudad: '', direccion: '', telefono: ''
        });
      }
      // Re-intentar ciudad/dirección/tel
      for (const fev of fevLines) {
        const nextIdx = fev.lineIndex + 1;
        if (nextIdx >= lineas.length) continue;
        const nl = lineas[nextIdx];
        if (!nl || nl.startsWith('**') || /total|documento|conductor|placa|viene|continúa/i.test(nl)) continue;
        const phoneMatch = nl.match(/(\d{7,15})\s*$/);
        fev.telefono = phoneMatch ? phoneMatch[1] : '';
        let resto = phoneMatch ? nl.substring(0, phoneMatch.index).trim() : nl;
        const partes = resto.split(/\s+/);
        let ciudad = '';
        let direccion = resto;
        if (partes.length >= 2) {
          const dosPalabras = (partes[0] + ' ' + partes[1]).toLowerCase();
          if (CIUDADES_CONOCIDAS.includes(dosPalabras)) {
            ciudad = partes[0] + ' ' + partes[1];
            direccion = partes.slice(2).join(' ');
          }
        }
        if (!ciudad) { ciudad = partes[0] || ''; direccion = partes.slice(1).join(' ') || ''; }
        fev.ciudad = ciudad;
        fev.direccion = direccion;
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
  if (lineaActual.includes(':')) {
    const parts = lineaActual.split(':');
    if (parts.length >= 2) {
      const v = parts.slice(1).join(':').trim();
      if (v && v.length < 80) return v;
    }
  }
  if (lineaSiguiente && lineaSiguiente.length < 80 && !/FEV|total|documento|\*\*/i.test(lineaSiguiente)) {
    return lineaSiguiente.trim();
  }
  return null;
}

function parsearValorColombiano(s) {
  if (!s) return 0;
  let limpio = String(s).trim();
  // Formato colombiano: 460.072,00 → 460072.00
  const commaCount = (limpio.match(/,/g) || []).length;
  if (commaCount > 1) {
    // Múltiples comas: la última es decimal, las otras son separadores de miles
    const lastComma = limpio.lastIndexOf(',');
    limpio = limpio.substring(0, lastComma).replace(/\./g, '') + '.' + limpio.substring(lastComma + 1);
  } else if (commaCount === 1) {
    limpio = limpio.replace(/\./g, '').replace(',', '.');
  } else {
    limpio = limpio.replace(/\./g, '');
  }
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}

import pdfParse from 'pdf-parse';
import fs from 'fs';

/**
 * Parsea el PDF de Planilla de Cuadre de SIESA
 * Extrae: factura, cliente, dirección, ciudad, barrio, teléfono, valor
 */
export async function parsearPdfSiesa(rutaArchivo) {
  try {
    const dataBuffer = fs.readFileSync(rutaArchivo);
    const data = await pdfParse(dataBuffer);
    
    // Extraer texto
    const texto = data.text;

    // Patrón regex para encontrar las líneas de pedidos
    // Formato: FEV-00010195 CCF COMFENALCO... 0,00 460.072,00
    const patronFactura = /^(FEV-\d+)\s+(.+?)\s+(\d+,\d{3}|\d+)\s+([\d,]+)\s*$/gm;

    const pedidos = [];
    let match;

    // También buscar información del conductor y ruta
    let conductor = null;
    let placa = null;
    let ruteId = null;

    const lineas = texto.split('\n');
    
    for (const linea of lineas) {
      // Buscar conductor
      if (linea.includes('Conductor')) {
        const parts = linea.split(':');
        if (parts[1]) {
          conductor = parts[1].trim();
        }
      }
      
      // Buscar placa
      if (linea.includes('Placa')) {
        const parts = linea.split(':');
        if (parts[1]) {
          placa = parts[1].trim();
        }
      }

      // Buscar número de ruta
      if (linea.includes('Nro. Guia')) {
        const parts = linea.split(':');
        if (parts[1]) {
          ruteId = parts[1].trim();
        }
      }
    }

    // Parsear tabla de facturas
    // Método: buscar líneas que empiezan con FEV-
    for (const linea of lineas) {
      if (linea.trim().startsWith('FEV-')) {
        const pedido = parsearLineaFactura(linea);
        if (pedido) {
          pedidos.push(pedido);
        }
      }
    }

    return {
      exitosa: true,
      conductor,
      placa,
      ruteId,
      totalPedidos: pedidos.length,
      pedidos
    };
  } catch (err) {
    console.error('Error al parsear PDF:', err);
    return {
      exitosa: false,
      error: err.message,
      pedidos: []
    };
  }
}

/**
 * Parsea una línea individual de factura
 * Formato: FEV-00010195 CCF COMFENALCO ANT./HOTEL BALANDU 0,00 460.072,00
 *          Jardín MUNICIPIO DE JARDIN HOTEL BALANDU 5113133
 */
function parsearLineaFactura(linea) {
  try {
    // Extraer factura (FEV-XXXXX)
    const regexFactura = /^(FEV-\d+)\s+(.+)/;
    const matchFactura = linea.match(regexFactura);
    
    if (!matchFactura) return null;

    const numeroFactura = matchFactura[1];
    const resto = matchFactura[2];

    // El resto contiene: cliente + dirección en dos líneas
    // Por ahora, extraer lo máximo posible
    const partes = resto.split(/\s+(\d+,\d{3}|\d+,\d{2})\s+/);
    
    if (partes.length < 3) return null;

    const clienteDir = partes[0].trim();
    const valor = partes[partes.length - 1].replace(/,/g, '');

    return {
      numeroFactura,
      clienteDir,
      valor: parseFloat(valor),
      ciudad: '',
      barrio: '',
      direccion: '',
      telefono: ''
    };
  } catch (err) {
    console.error('Error parseando línea:', err);
    return null;
  }
}

/**
 * Versión mejorada: usa OCR o parsing más robusto
 * Este es un fallback que extrae lo mínimo del PDF
 */
export async function parsearPdfSiesaRobusto(rutaArchivo) {
  try {
    const dataBuffer = fs.readFileSync(rutaArchivo);
    const data = await pdfParse(dataBuffer);
    
    const texto = data.text;
    const lineas = texto.split('\n');

    let metadatos = {
      conductor: null,
      placa: null,
      ruteId: null,
      fechaPlanilla: null
    };

    let pedidos = [];
    let procesandoTabla = false;

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();

      // Buscar metadatos
      if (linea.includes('Conductor')) {
        metadatos.conductor = lineas[i + 1]?.trim() || null;
      }
      if (linea.includes('Placa')) {
        metadatos.placa = lineas[i + 1]?.trim() || null;
      }
      if (linea.includes('Nro. Guia')) {
        metadatos.ruteId = lineas[i + 1]?.trim() || null;
      }

      // Detectar inicio de tabla (cuando ve "Documento Cliente...")
      if (linea.includes('Documento') && linea.includes('Cliente')) {
        procesandoTabla = true;
        continue;
      }

      // Si estamos en tabla y la línea empieza con FEV-
      if (procesandoTabla && linea.startsWith('FEV-')) {
        const partes = linea.split(/\s{2,}/); // Separar por 2+ espacios
        
        if (partes.length >= 4) {
          pedidos.push({
            numeroFactura: partes[0],
            cliente: partes[1],
            valor: parseFloat((partes[partes.length - 1] || '0').replace(/[.,]/g, ''))
          });
        }
      }

      // Detectar fin de tabla
      if (procesandoTabla && linea.includes('Totales:')) {
        procesandoTabla = false;
      }
    }

    return {
      exitosa: true,
      ...metadatos,
      totalPedidos: pedidos.length,
      pedidos
    };
  } catch (err) {
    console.error('Error al parsear PDF:', err);
    return {
      exitosa: false,
      error: err.message,
      pedidos: []
    };
  }
}

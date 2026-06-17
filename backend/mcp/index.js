export function createMiddleware() {
  return (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { method, params, id } = req.body;

    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '0.1.0',
          capabilities: { tools: {} },
          serverInfo: { name: 'horix-logistics', version: '1.0.0' }
        }
      });
    }

    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          tools: [
            {
              name: 'logistics_dashboard',
              description: 'Obtiene resumen del dashboard (vehículos, pedidos pendientes, rutas activas)',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'logistics_generar_rutas',
              description: 'Genera rutas optimizadas para una fecha',
              inputSchema: {
                type: 'object',
                properties: {
                  fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' },
                  sede: { type: 'string', description: 'Opcional: sede' }
                },
                required: ['fecha']
              }
            },
            {
              name: 'logistics_listar_rutas',
              description: 'Lista rutas de una fecha',
              inputSchema: {
                type: 'object',
                properties: {
                  fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' }
                }
              }
            }
          ]
        }
      });
    }

    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  };
}

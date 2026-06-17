# Horix Logistics - Módulo de Optimización de Rutas

Sistema de optimización de rutas y logística para Vitamar S.A. Integrado con Horix ERP.

## 📋 Características

- ✅ Importación de planillas SIESA (PDF)
- ✅ Importación de datos de Widetech (Excel)
- ✅ Optimización de rutas con OR-Tools + OSRM
- ✅ Dashboard en tiempo real
- ✅ Seguimiento de entregas
- ✅ Reportes de eficiencia
- ✅ API REST completa
- ✅ PM2 para producción

## 🏗️ Arquitectura

```
Backend: Node.js + Express
BD: PostgreSQL
Motor VRP: OR-Tools + OSRM
Frontend: React (próximamente)
```

## 📦 Instalación

### 1. Clonar el repositorio

```bash
git clone <repo-url> horix-logistics
cd horix-logistics
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores
```

Contenido básico de `.env`:

```
DB_USER=postgres
DB_PASSWORD=vitamar2024
DB_HOST=localhost
DB_PORT=5433
DB_NAME=vitamar_logistics
PORT=3004
OSRM_URL=https://router.project-osrm.org
```

### 3. Instalar dependencias

```bash
npm install
```

### 4. Crear base de datos y ejecutar migraciones

```bash
# Si necesitas crear la BD manualmente:
createdb -U postgres -W vitamar_logistics

# Ejecutar migraciones
npm run db:migrate
```

### 5. Levantar OSRM (opcional para desarrollo)

```bash
# Opción A: Docker (recomendado)
docker-compose up -d

# Opción B: Usar OSRM público (sin levantar infraestructura local)
# Ya configurado en .env: OSRM_URL=https://router.project-osrm.org
```

### 6. Iniciar servidor

#### Desarrollo:
```bash
npm run dev
```

#### Producción con PM2:
```bash
pm2 start backend/server.js --name "logistics" --env production
pm2 save
pm2 startup
```

## 🚀 Uso

### 1. Importar datos de SIESA

```bash
curl -X POST http://localhost:3004/api/importadores/siesa \
  -F "archivo=@planilla_cuadre.pdf"
```

### 2. Importar datos de Widetech

```bash
curl -X POST http://localhost:3004/api/importadores/widetech \
  -F "archivo=@historico_widetech.xlsx"
```

### 3. Crear vehículos

```bash
curl -X POST http://localhost:3004/api/vehiculos \
  -H "Content-Type: application/json" \
  -d '{
    "placa": "TVD921",
    "alias": "TVD921",
    "capacidad_peso": 5000,
    "capacidad_volumen": 20,
    "sede": "Medellín"
  }'
```

### 4. Generar rutas optimizadas

```bash
curl -X POST http://localhost:3004/api/rutas/generar \
  -H "Content-Type: application/json" \
  -d '{
    "fecha": "2024-06-16",
    "sede": "Medellín"
  }'
```

### 5. Ver rutas creadas

```bash
curl http://localhost:3004/api/rutas?fecha=2024-06-16
```

## 📊 API Endpoints

### Vehículos
- `GET /api/vehiculos` - Listar vehículos
- `GET /api/vehiculos/:id` - Obtener vehículo
- `POST /api/vehiculos` - Crear vehículo
- `PUT /api/vehiculos/:id` - Actualizar vehículo
- `DELETE /api/vehiculos/:id` - Eliminar vehículo

### Pedidos
- `GET /api/pedidos` - Listar pedidos
- `GET /api/pedidos/pendientes/lista` - Pedidos sin asignar
- `GET /api/pedidos/:id` - Obtener pedido
- `PUT /api/pedidos/:id` - Actualizar pedido
- `DELETE /api/pedidos/:id` - Eliminar pedido

### Rutas
- `GET /api/rutas` - Listar rutas
- `GET /api/rutas/:id` - Obtener ruta con paradas
- `POST /api/rutas/generar` - Generar rutas optimizadas
- `PUT /api/rutas/:id` - Actualizar ruta

### Importadores
- `POST /api/importadores/siesa` - Importar PDF de SIESA
- `POST /api/importadores/widetech` - Importar Excel de Widetech
- `GET /api/importadores/historial` - Ver historial

### Health
- `GET /api/health` - Estado del servidor

## 🔧 Estructura de carpetas

```
horix-logistics/
├── backend/
│   ├── server.js
│   ├── config/
│   │   └── db.js
│   ├── routes/
│   │   ├── vehiculos.js
│   │   ├── pedidos.js
│   │   ├── rutas.js
│   │   └── importadores.js
│   ├── utils/
│   │   ├── siesaPdfParser.js
│   │   ├── widgetechExcelParser.js
│   │   └── vrp.js
│   └── migrations/
│       └── 001_create_tables.sql
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

## 📚 Parsers de datos

### SIESA PDF Parser
Extrae automáticamente:
- Número de factura
- Cliente
- Dirección
- Conductor
- Placa del vehículo
- Valor de la entrega

### Widetech Excel Parser
Extrae automáticamente:
- Placa del vehículo
- Fecha y hora GPS
- Latitud / Longitud
- Velocidad
- Ubicación textual

## 🗺️ Motor de optimización

### OSRM (Open Source Routing Machine)
- Calcula matrices de distancia/tiempo
- Algoritmo Nearest Neighbor + 2-opt
- Gratuito, sin cuotas

### OR-Tools (Google)
- Para futuro: Problema de Enrutamiento de Vehículos (VRP)
- Soporte para restricciones complejas (capacidad, ventanas de tiempo)

## 📈 Próximos pasos

### MVP (Fase 1 ✅)
- [x] Importadores SIESA + Widetech
- [x] CRUD de vehículos y pedidos
- [x] API de rutas
- [x] Motor VRP básico

### Fase 2
- [ ] Frontend Dashboard (React)
- [ ] Mapa interactivo (Mapbox)
- [ ] Seguimiento en tiempo real

### Fase 3
- [ ] App móvil para conductores
- [ ] Integración con Horix (MCP)
- [ ] Análisis de eficiencia avanzado

## 🔐 Seguridad

- [ ] JWT authentication
- [ ] Rate limiting
- [ ] Validación de entrada
- [ ] HTTPS en producción

## 📝 Logs

Los logs se guardan en:
- Desarrollo: `console.log()`
- Producción: Ver `pm2 logs logistics`

## 🐛 Debugging

```bash
# Ver logs en tiempo real
pm2 logs logistics

# Ver estado
pm2 status

# Reiniciar
pm2 restart logistics

# Detener
pm2 stop logistics
```

## 📞 Soporte

Para reportar problemas, contactar a: Edgar (Sistemas, Vitamar)

---

**Versión:** 1.0.0  
**Última actualización:** Junio 2024

# Bitácora de cambios

## 2026-06-17

### 🚀 Actualizador del sistema
- Nuevo backend `backend/routes/actualizador.js` con endpoints:
  - `GET /api/actualizador/status` — versión, rama, commit, última actualización
  - `POST /api/actualizador/check` — verifica si hay nueva versión en GitHub
  - `POST /api/actualizador/update` — git reset hard + npm install + migraciones
  - `POST /api/actualizador/restart` — reinicia el servicio con PM2
  - `GET /api/actualizador/logs` — últimas líneas del log de actualización
- Nueva pestaña "Actualizar" en la página de Configuración
- Log de actualización persistente en `logs/updater.log`
- Endpoint `/api/health` añadido para monitoreo

### 🐛 Corrección: Importación de archivos
- Los drop zones ahora soportan arrastrar y soltar archivos (drag & drop)
- Se agregó feedback visual cuando se hace clic en "Importar" sin seleccionar archivo
- Al seleccionar un nuevo archivo se limpia el resultado anterior

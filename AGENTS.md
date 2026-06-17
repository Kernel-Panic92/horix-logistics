# Horix Logistics — Session Memory

## Project
Route optimization & fleet management module for Vitamar, built as a Node.js + Express API with PostgreSQL and a vanilla JS SPA frontend.

## Session: 2026-06-17

### Done
- **Update/Actualizar module**: `backend/routes/actualizador.js` with endpoints for status, check, update (git pull + npm install + migrations), restart, and logs. Frontend "Actualizar" tab in Config page with version display, update check, and one-click update flow.
- **Import buttons fixed**: Added drag-and-drop event handlers (`dragover`/`dragleave`/`drop`) to the SIESA/Widetech drop zones. Error feedback shown when clicking import without selecting a file.
- **Pushed** commits `a03f071` and `e52c29a` to `origin/master`.

### Key Context
- ESM throughout (`"type": "module"` in package.json).
- PM2 process name: `logistics`.
- Admin seed: `admin@vitamar.com` / `admin123`.
- JWT auth on all `/api/*` except `/api/auth/*` and `/api/health`.
- Admin-only routes: usuarios, configuracion, backup, auditoria, actualizador.
- Mapa uses Leaflet + OpenStreetMap tiles (no API key).

### Next
- Production deployment checklist: verify PM2 restart works, set up Nginx reverse proxy, configure SSL.
- App móvil for drivers (long-term).

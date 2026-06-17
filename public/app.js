const API = '/api';
let TOKEN = localStorage.getItem('logistics_token');
let USER = null;

/* ── API wrapper ── */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch(API + path, { ...opts, headers });
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/verificar') {
    logout(); throw new Error('Sesión expirada');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

/* ── Auth ── */
async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  if (!email || !password) { errEl.textContent = 'Completa todos los campos'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Ingresando...';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    TOKEN = data.token; USER = data.usuario;
    localStorage.setItem('logistics_token', TOKEN);
    mostrarApp();
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Ingresar';
  }
}

async function logout() {
  TOKEN = null; USER = null;
  localStorage.removeItem('logistics_token');
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function toggleTheme() {
  document.body.classList.toggle('light');
  localStorage.setItem('logistics_theme', document.body.classList.contains('light') ? 'light' : 'dark');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.querySelector('.sidebar-overlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay').classList.remove('show');
}

/* ── Navigation ── */
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
  document.getElementById('page-title').textContent = document.querySelector(`.nav-item[data-page="${page}"]`)?.textContent.trim() || page;
  closeSidebar();
  // Cargar datos según página
  if (page === 'dashboard') cargarDashboard();
  else if (page === 'vehiculos') cargarVehiculos();
  else if (page === 'pedidos') cargarPedidos();
  else if (page === 'rutas') cargarRutas();
}

/* ── Init ── */
async function init() {
  if (localStorage.getItem('logistics_theme') === 'light') document.body.classList.add('light');
  document.getElementById('filtro-fecha').value = new Date().toISOString().split('T')[0];
  if (TOKEN) {
    try {
      const data = await api('/auth/verificar');
      USER = data.usuario;
      mostrarApp();
    } catch { logout(); }
  }
}

function mostrarApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('user-name').textContent = USER.nombre;
  document.getElementById('user-role').textContent = USER.email;
  document.getElementById('user-badge').textContent = USER.rol;
  navigate('dashboard');
}

/* ── Modal helpers ── */
function abrirModal(titulo, desc, bodyHtml, accionesHtml) {
  document.getElementById('modal-title').textContent = titulo;
  document.getElementById('modal-desc').textContent = desc || '';
  document.getElementById('modal-body').innerHTML = bodyHtml || '';
  document.getElementById('modal-actions').innerHTML = accionesHtml || '';
  document.getElementById('modal-overlay').classList.add('show');
}
function cerrarModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) cerrarModal();
});

/* ── File helpers ── */
function previsualizarArchivo(input, nameId) {
  const el = document.getElementById(nameId);
  if (input.files.length) {
    el.textContent = input.files[0].name;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

/* ── Dashboard ── */
async function cargarDashboard() {
  const statsEl = document.getElementById('dash-stats');
  const listEl = document.getElementById('dash-rutas-list');
  try {
    const [vehiculos, pedidos, rutas] = await Promise.all([
      api('/vehiculos'),
      api('/pedidos?estado=pendiente'),
      api('/rutas?fecha=' + new Date().toISOString().split('T')[0])
    ]);
    statsEl.innerHTML = `
      <div class="stat-card"><div class="stat-label">Vehículos</div><div class="stat-value">${vehiculos.total}</div><div class="stat-sub">en flota</div></div>
      <div class="stat-card"><div class="stat-label">Pedidos pendientes</div><div class="stat-value">${pedidos.total}</div><div class="stat-sub">sin asignar</div></div>
      <div class="stat-card"><div class="stat-label">Rutas hoy</div><div class="stat-value">${rutas.total}</div><div class="stat-sub">planificadas</div></div>
      <div class="stat-card"><div class="stat-label">Vehículos activos</div><div class="stat-value">${vehiculos.vehiculos.filter(v=>v.estado==='disponible').length}</div><div class="stat-sub">disponibles</div></div>
    `;
    if (rutas.rutas?.length) {
      listEl.innerHTML = rutas.rutas.map(r => `
        <div class="flex" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
          <span><strong>${r.nombre}</strong> · ${r.placa || '—'}</span>
          <span><span class="badge badge-${r.estado==='planificada'?'info':r.estado==='en_ejecucion'?'warning':r.estado==='completada'?'success':'danger'}">${r.estado}</span></span>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = '<p class="text-muted">No hay rutas para hoy</p>';
    }
  } catch (e) {
    statsEl.innerHTML = '<p class="text-muted">Error al cargar dashboard</p>';
  }
}

/* ── Vehículos ── */
async function cargarVehiculos() {
  const tbody = document.querySelector('#tbl-vehiculos tbody');
  try {
    const data = await api('/vehiculos');
    if (!data.vehiculos?.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:32px;">No hay vehículos registrados</td></tr>'; return; }
    tbody.innerHTML = data.vehiculos.map(v => `
      <tr>
        <td><strong>${v.placa}</strong></td>
        <td>${v.alias || '—'}</td>
        <td>${v.sede || '—'}</td>
        <td>${v.capacidad_peso} kg</td>
        <td>${v.capacidad_volumen} m³</td>
        <td><span class="badge badge-${v.estado==='disponible'?'success':v.estado==='en_ruta'?'warning':'danger'}">${v.estado}</span></td>
        <td><button class="btn btn-sm btn-secondary" onclick="editarVehiculo(${v.id})">✏️</button></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Error al cargar</td></tr>';
  }
}

function abrirModalVehiculo(data) {
  const d = data || {};
  abrirModal(
    data ? 'Editar vehículo' : 'Nuevo vehículo',
    data ? 'Actualiza los datos del vehículo' : 'Registra un nuevo vehículo en la flota',
    `
      <div class="form-grid">
        <div class="form-group"><label>Placa *</label><input id="v-placa" value="${d.placa||''}" placeholder="TVD921"></div>
        <div class="form-group"><label>Alias</label><input id="v-alias" value="${d.alias||''}" placeholder="TVD921"></div>
        <div class="form-group"><label>Sede</label><input id="v-sede" value="${d.sede||''}" placeholder="Medellín"></div>
        <div class="form-group"><label>Capacidad peso (kg)</label><input type="number" id="v-peso" value="${d.capacidad_peso||5000}"></div>
        <div class="form-group"><label>Capacidad volumen (m³)</label><input type="number" step="0.1" id="v-vol" value="${d.capacidad_volumen||20}"></div>
        <div class="form-group"><label>Estado</label><select id="v-estado">
          <option value="disponible" ${d.estado==='disponible'||!d.estado?'selected':''}>Disponible</option>
          <option value="en_ruta" ${d.estado==='en_ruta'?'selected':''}>En ruta</option>
          <option value="mantenimiento" ${d.estado==='mantenimiento'?'selected':''}>Mantenimiento</option>
        </select></div>
      </div>
    `,
    `<button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="${data ? 'guardarVehiculo('+d.id+')' : 'guardarVehiculo()'}">${data ? 'Guardar cambios' : 'Crear vehículo'}</button>`
  );
}

function editarVehiculo(id) {
  api('/vehiculos/' + id).then(d => abrirModalVehiculo(d.vehiculo)).catch(e => alert(e.message));
}

async function guardarVehiculo(id) {
  const body = {
    placa: document.getElementById('v-placa').value.trim(),
    alias: document.getElementById('v-alias').value.trim(),
    sede: document.getElementById('v-sede').value.trim(),
    capacidad_peso: +document.getElementById('v-peso').value,
    capacidad_volumen: +document.getElementById('v-vol').value,
    estado: document.getElementById('v-estado').value
  };
  if (!body.placa) { alert('La placa es requerida'); return; }
  try {
    if (id) await api('/vehiculos/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/vehiculos', { method: 'POST', body: JSON.stringify(body) });
    cerrarModal();
    cargarVehiculos();
  } catch (e) { alert(e.message); }
}

/* ── Pedidos ── */
async function cargarPedidos() {
  const tbody = document.querySelector('#tbl-pedidos tbody');
  const estado = document.getElementById('filtro-pedidos').value;
  try {
    const data = await api('/pedidos' + (estado ? '?estado=' + estado : ''));
    if (!data.pedidos?.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:32px;">No hay pedidos</td></tr>'; return; }
    tbody.innerHTML = data.pedidos.map(p => `
      <tr>
        <td><strong>${p.numero_factura}</strong></td>
        <td class="truncate">${p.cliente_nombre || '—'}</td>
        <td class="truncate">${p.direccion || '—'}</td>
        <td>$${(p.valor_credito||0).toLocaleString()}</td>
        <td><span class="badge badge-${p.estado==='entregado'?'success':p.estado==='pendiente'?'warning':p.estado==='cancelado'?'danger':'info'}">${p.estado}</span></td>
        <td>${p.ruta_id ? 'Ruta #'+p.ruta_id : '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Error al cargar</td></tr>';
  }
}

/* ── Rutas ── */
async function cargarRutas() {
  const tbody = document.querySelector('#tbl-rutas tbody');
  const fecha = document.getElementById('filtro-fecha').value;
  try {
    const data = await api('/rutas' + (fecha ? '?fecha=' + fecha : ''));
    if (!data.rutas?.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">No hay rutas para esta fecha</td></tr>'; return; }
    tbody.innerHTML = data.rutas.map(r => `
      <tr>
        <td><strong>${r.nombre || 'Ruta #'+r.id}</strong></td>
        <td>${r.placa || '—'}</td>
        <td>${r.cantidad_paradas || 0}</td>
        <td>${r.distancia_total_estimada ? r.distancia_total_estimada+' km' : '—'}</td>
        <td>${r.tiempo_estimado ? r.tiempo_estimado+' min' : '—'}</td>
        <td><span class="badge badge-${r.estado==='planificada'?'info':r.estado==='en_ejecucion'?'warning':r.estado==='completada'?'success':'danger'}">${r.estado}</span></td>
        <td>${r.fecha ? r.fecha.slice(0,10) : '—'}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="verRuta(${r.id})">👁️</button></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Error al cargar</td></tr>';
  }
}

async function verRuta(id) {
  try {
    const data = await api('/rutas/' + id);
    const r = data.ruta;
    const paradas = data.paradas || [];
    abrirModal(
      r.nombre || 'Ruta #' + r.id,
      `Vehículo: ${r.vehiculo_id} · Distancia: ${r.distancia_total_estimada||'—'} km · Tiempo: ${r.tiempo_estimado||'—'} min`,
      `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Cliente</th><th>Estado</th></tr></thead><tbody>
        ${paradas.map(p => `<tr><td>${p.secuencia}</td><td>${p.cliente_nombre||'—'}</td><td><span class="badge badge-${p.estado==='completada'?'success':'warning'}">${p.estado}</span></td></tr>`).join('')}
      </tbody></table></div>`,
      `<button class="btn btn-secondary" onclick="cerrarModal()">Cerrar</button>`
    );
  } catch (e) { alert(e.message); }
}

async function generarRutas() {
  const fecha = document.getElementById('filtro-fecha').value;
  if (!fecha) { alert('Selecciona una fecha'); return; }
  if (!confirm('¿Generar rutas optimizadas para ' + fecha + '?')) return;
  try {
    const data = await api('/rutas/generar', { method: 'POST', body: JSON.stringify({ fecha }) });
    alert(data.mensaje || 'Rutas generadas');
    cargarRutas();
  } catch (e) { alert(e.message); }
}

/* ── Importadores ── */
function previsualizarArchivo(input, nameId) {
  const el = document.getElementById(nameId);
  if (input.files?.length) {
    el.textContent = input.files[0].name;
    el.style.display = 'block';
    // Habilitar botón
    const btnId = input.id === 'file-siesa' ? 'btn-import-siesa' : 'btn-import-widetech';
    document.getElementById(btnId).disabled = false;
  }
}

async function importarSiesa() {
  const input = document.getElementById('file-siesa');
  if (!input.files?.length) return;
  const btn = document.getElementById('btn-import-siesa');
  const resEl = document.getElementById('result-siesa');
  btn.disabled = true; btn.textContent = 'Importando...';
  const fd = new FormData();
  fd.append('archivo', input.files[0]);
  try {
    const res = await fetch(API + '/importadores/siesa', { method: 'POST', headers: { 'Authorization': 'Bearer ' + TOKEN }, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    resEl.innerHTML = `<div style="padding:10px;background:rgba(79,190,150,.1);border-radius:8px;color:var(--success);font-size:13px;">
      ✅ ${data.importados} pedidos importados${data.fallidos ? ', ' + data.fallidos + ' fallidos' : ''}
    </div>`;
    input.value = ''; document.getElementById('file-siesa-name').style.display = 'none';
    cargarDashboard();
  } catch (e) {
    resEl.innerHTML = `<div style="padding:10px;background:rgba(247,97,79,.1);border-radius:8px;color:var(--danger);font-size:13px;">❌ ${e.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Importar SIESA';
  }
}

async function importarWidetech() {
  const input = document.getElementById('file-widetech');
  if (!input.files?.length) return;
  const btn = document.getElementById('btn-import-widetech');
  const resEl = document.getElementById('result-widetech');
  btn.disabled = true; btn.textContent = 'Importando...';
  const fd = new FormData();
  fd.append('archivo', input.files[0]);
  try {
    const res = await fetch(API + '/importadores/widetech', { method: 'POST', headers: { 'Authorization': 'Bearer ' + TOKEN }, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    resEl.innerHTML = `<div style="padding:10px;background:rgba(79,190,150,.1);border-radius:8px;color:var(--success);font-size:13px;">
      ✅ ${data.importados} registros importados${data.fallidos ? ', ' + data.fallidos + ' fallidos' : ''}
    </div>`;
    input.value = ''; document.getElementById('file-widetech-name').style.display = 'none';
    cargarDashboard();
  } catch (e) {
    resEl.innerHTML = `<div style="padding:10px;background:rgba(247,97,79,.1);border-radius:8px;color:var(--danger);font-size:13px;">❌ ${e.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Importar Widetech';
  }
}

init();

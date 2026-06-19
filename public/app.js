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

/* ── Forgot / Reset Password ── */
function abrirForgot() {
  document.getElementById('forgot-error').style.display = 'none';
  document.getElementById('forgot-success').style.display = 'none';
  document.getElementById('forgot-form').style.display = 'block';
  document.getElementById('forgot-email').value = '';
  document.getElementById('modal-forgot').classList.add('show');
}

function cerrarForgot() {
  document.getElementById('modal-forgot').classList.remove('show');
}

async function enviarReset() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const btn = document.getElementById('btn-forgot');
  if (!email) { errEl.textContent = 'Ingresa tu correo electrónico'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    document.getElementById('forgot-form').style.display = 'none';
    document.getElementById('forgot-success').style.display = 'block';
    document.getElementById('forgot-success').textContent = '✅ Si el correo existe en el sistema, recibirás un enlace para restablecer tu contraseña.';
    setTimeout(() => cerrarForgot(), 4000);
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar Enlace';
  }
}

/* ── Logout ── */
function mostrarLogoutConfirm() {
  document.getElementById('modal-logout').classList.add('show');
}

function cerrarLogoutConfirm() {
  document.getElementById('modal-logout').classList.remove('show');
}

document.getElementById('modal-logout')?.addEventListener('click', function(e) {
  if (e.target === this) cerrarLogoutConfirm();
});

function confirmarLogout() {
  cerrarLogoutConfirm();
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
  else if (page === 'usuarios') cargarUsuarios();
  else if (page === 'config') cargarConfig();
  else if (page === 'mapa') cargarMapa();
  else if (page === 'clientes') cargarClientes();
  else if (page === 'sedes') cargarSedes();
}

/* ── Init ── */
async function init() {
  if (localStorage.getItem('logistics_theme') === 'light') document.body.classList.add('light');
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('filtro-fecha').value = hoy;
  document.getElementById('mapa-fecha').value = hoy;
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
  cargarVersion();
  navigate('dashboard');
  iniciarDropZones();
}

async function cargarVersion() {
  try {
    const data = await api('/version');
    window._appVer = 'v' + data.version + (data.branch ? ' [' + data.branch + ']' : '');
    const el = document.getElementById('app-version');
    if (el) el.textContent = window._appVer;
    const verInput = document.getElementById('cfg-version');
    if (verInput) verInput.value = window._appVer;
  } catch { window._appVer = 'v—'; }
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
  if (window._activeModalMap) { window._activeModalMap.remove(); window._activeModalMap = null; }
  document.getElementById('modal-overlay').classList.remove('show');
}
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) cerrarModal();
});
document.getElementById('modal-forgot')?.addEventListener('click', function(e) {
  if (e.target === this) cerrarForgot();
});

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
  const estado = document.getElementById('filtro-vehiculos-estado').value;
  const q = document.getElementById('filtro-vehiculos-q').value.trim();
  const params = new URLSearchParams();
  if (estado) params.set('estado', estado);
  if (q) params.set('q', q);
  try {
    const data = await api('/vehiculos?' + params.toString());
    if (!data.vehiculos?.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">No hay vehículos registrados</td></tr>'; return; }
    tbody.innerHTML = data.vehiculos.map(v => `
      <tr>
        <td><input type="checkbox" class="cb-vehiculo" value="${v.id}" onchange="actualizarBtnEliminar('vehiculo')"></td>
        <td><strong>${v.placa}</strong></td>
        <td>${v.alias || '—'}</td>
        <td>${v.sede || '—'}</td>
        <td>${v.capacidad_peso} kg</td>
        <td>${v.capacidad_volumen} m³</td>
        <td><span class="badge badge-${v.estado==='disponible'?'success':v.estado==='en_ruta'?'warning':'danger'}">${v.estado}</span></td>
        <td><button class="btn btn-sm btn-secondary" onclick="editarVehiculo(${v.id})" title="Editar">✏️</button> <button class="btn btn-sm btn-danger" onclick="confirmarEliminar('vehiculo',${v.id},'${v.placa}')" title="Eliminar">🗑️</button></td>
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
        <div class="form-group"><label>Sede</label><select id="v-sede" data-sede="${d.sede||''}"><option value="">Cargando...</option></select></div>
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
  setTimeout(poblarSedesVehiculo, 100);
}

async function poblarSedesVehiculo() {
  const select = document.getElementById('v-sede');
  if (!select) return;
  try {
    const data = await api('/sedes');
    const sedes = data.sedes || [];
    const sedeActual = select.dataset.sede || '';
    select.innerHTML = '<option value="">— Sin sede —</option>' +
      sedes.map(s => `<option value="${esc(s.nombre)}" ${s.nombre===sedeActual?'selected':''}>${esc(s.nombre)}</option>`).join('');
  } catch { select.innerHTML = '<option value="">Error al cargar</option>'; }
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
  const q = document.getElementById('filtro-pedidos-q').value.trim();
  const params = new URLSearchParams();
  if (estado) params.set('estado', estado);
  if (q) params.set('q', q);
  try {
    const data = await api('/pedidos?' + params.toString());
    if (!data.pedidos?.length) { tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:32px;">No hay pedidos</td></tr>'; return; }
    tbody.innerHTML = data.pedidos.map(p => `
      <tr>
        <td><input type="checkbox" class="cb-pedido" value="${p.id}" onchange="actualizarBtnEliminar('pedido')"></td>
        <td><strong>${p.numero_factura}</strong></td>
        <td class="truncate">${esc(p.cliente_nombre_real) || esc(p.cliente_nombre) || '—'}</td>
        <td class="truncate">${p.direccion || '—'}</td>
        <td style="white-space:nowrap">$${Number(p.valor_contado||0).toLocaleString()}</td>
        <td style="white-space:nowrap">$${Number(p.valor_credito||0).toLocaleString()}</td>
        <td>${p.placa || '—'}</td>
        <td><span class="badge badge-${p.estado==='entregado'?'success':p.estado==='pendiente'?'warning':p.estado==='cancelado'?'danger':'info'}">${p.estado}</span></td>
        <td>${p.ruta_id ? 'Ruta #'+p.ruta_id : '—'}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="verPedido(${p.id})" title="Ver">👁️</button> <button class="btn btn-sm btn-secondary" onclick="editarPedido(${p.id})" title="Editar">✏️</button> <button class="btn btn-sm btn-danger" onclick="confirmarEliminar('pedido',${p.id},'${p.numero_factura}')" title="Eliminar">🗑️</button></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Error al cargar</td></tr>';
  }
}

async function verPedido(id) {
  try {
    const data = await api('/pedidos/' + id);
    const p = data.pedido;
    document.getElementById('pedido-detalle').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px;">
        <div><strong>Factura:</strong><br>${p.numero_factura}</div>
        <div><strong>Cliente:</strong><br>${p.cliente_nombre || '—'}</div>
        <div><strong>Dirección:</strong><br>${p.direccion || '—'}</div>
        <div><strong>Ciudad:</strong><br>${p.ciudad || '—'}</div>
        <div><strong>Teléfono:</strong><br>${p.telefono || '—'}</div>
        <div><strong>V. Contado:</strong><br>$${Number(p.valor_contado||0).toLocaleString()}</div>
        <div><strong>V. Crédito:</strong><br>$${Number(p.valor_credito||0).toLocaleString()}</div>
        <div><strong>Conductor:</strong><br>${p.conductor || '—'}</div>
        <div><strong>Placa:</strong><br>${p.placa || '—'}</div>
        <div><strong>Nro Guía:</strong><br>${p.nro_guia || '—'}</div>
        <div><strong>Estado:</strong><br><span class="badge badge-${p.estado==='entregado'?'success':p.estado==='pendiente'?'warning':p.estado==='cancelado'?'danger':'info'}">${p.estado}</span></div>
        <div><strong>Ruta:</strong><br>${p.ruta_id ? 'Ruta #'+p.ruta_id : 'Sin asignar'}</div>
        <div><strong>Latitud:</strong><br>${p.latitud || '—'}</div>
        <div><strong>Longitud:</strong><br>${p.longitud || '—'}</div>
        <div><strong>Fecha creación:</strong><br>${p.created_at ? new Date(p.created_at).toLocaleString('es-CO') : '—'}</div>
        <div><strong>Última actualización:</strong><br>${p.updated_at ? new Date(p.updated_at).toLocaleString('es-CO') : '—'}</div>
      </div>`;
    document.getElementById('modal-pedido').classList.add('show');
  } catch (e) { alert('Error: ' + e.message); }
}

/* ── Clientes ── */
async function cargarClientes() {
  const grid = document.getElementById('cli-grid');
  const count = document.getElementById('cli-count');
  const filtro = document.getElementById('filtro-clientes')?.value.trim() || '';
  try {
    const data = await api('/clientes' + (filtro ? '?q=' + encodeURIComponent(filtro) : ''));
    if (!data.clientes?.length) {
      grid.innerHTML = '<div class="text-center text-muted" style="padding:32px;grid-column:1/-1;">No hay clientes</div>';
      count.textContent = '0 clientes';
      actualizarBtnEliminar('cliente');
      return;
    }
    count.textContent = data.clientes.length + ' cliente' + (data.clientes.length !== 1 ? 's' : '');
    grid.innerHTML = data.clientes.map(c => {
      const nombre = c.nombre || '';
      const iniciales = nombre.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
      let hue = 0;
      for (let i = 0; i < nombre.length; i++) hue = nombre.charCodeAt(i) + ((hue << 5) - hue);
      const bg = `hsl(${Math.abs(hue) % 360}, 60%, 45%)`;
      return `<div class="cli-card" data-id="${c.id}">
        <div class="cli-card-head">
          <input type="checkbox" class="cb-cliente" value="${c.id}" onchange="actualizarBtnEliminar('cliente')">
          <div class="cli-avatar" style="background:${bg}" title="${esc(c.nombre)}">${iniciales}</div>
          <div style="flex:1;min-width:0">
            <div class="cli-name"><strong>${esc(c.nombre) || '—'}</strong></div>
            <div class="cli-meta">${esc(c.ciudad || '—')} · ${esc(c.telefono || '—')}</div>
            <div class="cli-addr" title="${esc(c.direccion || '')}">📍 ${esc(c.direccion || 'Sin dirección')}</div>
          </div>
        </div>
        <div class="cli-stats">
          <div class="cli-stat"><strong>${c.cantidad_pedidos || 0}</strong>Pedidos</div>
          <div class="cli-stat"><strong>${c.ultima_importacion ? new Date(c.ultima_importacion).toLocaleDateString('es-CO') : '—'}</strong>Última importación</div>
        </div>
        <div class="cli-actions">
          <button class="btn btn-sm btn-secondary" onclick="editarCliente(${c.id})" style="flex:1">✏️ Editar</button>
          <button class="btn btn-sm btn-danger" onclick="confirmarEliminar('cliente',${c.id})">🗑️</button>
        </div>
      </div>`;
    }).join('');
    actualizarBtnEliminar('cliente');
  } catch (e) {
    grid.innerHTML = '<div class="text-center text-muted" style="padding:32px;grid-column:1/-1;">Error al cargar</div>';
  }
}

/* ── CRUD: Pedidos ── */
function abrirModalPedido(data) {
  const d = data || {};
  abrirModal(
    data ? 'Editar pedido' : 'Nuevo pedido',
    data ? 'Actualiza los datos del pedido' : 'Registra un nuevo pedido',
    `
      <div class="form-grid">
        <div class="form-group"><label>Factura *</label><input id="p-factura" value="${d.numero_factura||''}" placeholder="FEV-00001"></div>
        <div class="form-group"><label>Cliente</label><input id="p-cliente" value="${d.cliente_nombre||''}" placeholder="Nombre del cliente"></div>
        <div class="form-group"><label>Dirección</label><input id="p-direccion" value="${d.direccion||''}" placeholder="Calle 123 #45-67"></div>
        <div class="form-group"><label>Ciudad</label><input id="p-ciudad" value="${d.ciudad||''}" placeholder="Medellín"></div>
        <div class="form-group"><label>Teléfono</label><input id="p-telefono" value="${d.telefono||''}" placeholder="3001234567"></div>
        <div class="form-group"><label>Valor</label><input type="number" id="p-valor" value="${d.valor_credito||0}"></div>
        <div class="form-group"><label>Estado</label><select id="p-estado">
          <option value="pendiente" ${(d.estado||'pendiente')==='pendiente'?'selected':''}>Pendiente</option>
          <option value="asignado" ${d.estado==='asignado'?'selected':''}>Asignado</option>
          <option value="entregado" ${d.estado==='entregado'?'selected':''}>Entregado</option>
          <option value="cancelado" ${d.estado==='cancelado'?'selected':''}>Cancelado</option>
        </select></div>
      </div>
    `,
    `<button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="${data ? 'guardarPedido('+d.id+')' : 'guardarPedido()'}">${data ? 'Guardar cambios' : 'Crear pedido'}</button>`
  );
}

function editarPedido(id) {
  api('/pedidos/' + id).then(d => abrirModalPedido(d.pedido)).catch(e => alert(e.message));
}

async function guardarPedido(id) {
  const body = {
    numero_factura: document.getElementById('p-factura').value.trim(),
    cliente_nombre: document.getElementById('p-cliente').value.trim(),
    direccion: document.getElementById('p-direccion').value.trim(),
    ciudad: document.getElementById('p-ciudad').value.trim(),
    telefono: document.getElementById('p-telefono').value.trim(),
    valor_credito: +document.getElementById('p-valor').value,
    estado: document.getElementById('p-estado').value
  };
  if (!body.numero_factura) { alert('La factura es requerida'); return; }
  try {
    if (id) await api('/pedidos/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/pedidos', { method: 'POST', body: JSON.stringify(body) });
    cerrarModal();
    cargarPedidos();
  } catch (e) { alert(e.message); }
}

/* ── CRUD: Clientes ── */
function abrirModalCliente(data) {
  const d = data || {};
  abrirModal(
    data ? 'Editar cliente' : 'Nuevo cliente',
    data ? 'Actualiza los datos del cliente' : 'Registra un nuevo cliente',
    `
      <div class="form-grid">
        <div class="form-group"><label>Nombre *</label><input id="c-nombre" value="${d.nombre||''}" placeholder="Nombre del cliente"></div>
        <div class="form-group"><label>Dirección</label><input id="c-direccion" value="${d.direccion||''}" placeholder="Busca y selecciona una dirección..." autocomplete="off"></div>
        <div class="form-group"><label>Ciudad</label><input id="c-ciudad" value="${d.ciudad||''}" placeholder="Medellín"></div>
        <div class="form-group"><label>Teléfono</label><input id="c-telefono" value="${d.telefono||''}" placeholder="3001234567"></div>
        <div class="form-group"><label>Latitud</label><input type="number" step="any" id="c-lat" value="${d.latitud||''}" placeholder="6.2476"></div>
        <div class="form-group"><label>Longitud</label><input type="number" step="any" id="c-lng" value="${d.longitud||''}" placeholder="-75.5658"></div>
      </div>
      <div class="mapa-pin" id="mapa-pin-cliente"></div>
      <p style="font-size:11px;color:var(--muted);margin-top:6px;">💡 Haz clic en el mapa para posicionar o arrastra el marcador</p>
    `,
    `<button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="${data ? 'guardarCliente('+d.id+')' : 'guardarCliente()'}">${data ? 'Guardar cambios' : 'Crear cliente'}</button>`
  );
  setTimeout(() => { configurarAutocompleteCliente(); initMapaPin('mapa-pin-cliente', 'c-lat', 'c-lng'); }, 300);
}

function editarCliente(id) {
  api('/clientes/' + id).then(d => abrirModalCliente(d.cliente)).catch(e => alert(e.message));
}

async function guardarCliente(id) {
  const body = {
    nombre: document.getElementById('c-nombre').value.trim(),
    direccion: document.getElementById('c-direccion').value.trim(),
    ciudad: document.getElementById('c-ciudad').value.trim(),
    telefono: document.getElementById('c-telefono').value.trim(),
    latitud: document.getElementById('c-lat').value ? +document.getElementById('c-lat').value : null,
    longitud: document.getElementById('c-lng').value ? +document.getElementById('c-lng').value : null
  };
  if (!body.nombre) { alert('El nombre es requerido'); return; }
  try {
    if (id) await api('/clientes/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/clientes', { method: 'POST', body: JSON.stringify(body) });
    cerrarModal();
    cargarClientes();
  } catch (e) { alert(e.message); }
}

/* ── CRUD: Sedes ── */
async function cargarSedes() {
  const tbody = document.querySelector('#tbl-sedes tbody');
  const filtro = document.getElementById('filtro-sedes').value.trim();
  try {
    const data = await api('/sedes' + (filtro ? '?q=' + encodeURIComponent(filtro) : ''));
    if (!data.sedes?.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">No hay sedes registradas</td></tr>';
      return;
    }
    tbody.innerHTML = data.sedes.map(s => `<tr>
      <td><strong>${esc(s.nombre)}</strong></td>
      <td>${esc(s.centro_operacion || '—')}</td>
      <td>${esc(s.ciudad || '—')}</td>
      <td>${esc(s.direccion || '—')}</td>
      <td>${esc(s.telefono || '—')}</td>
      <td>${s.latitud && s.longitud ? s.latitud.toFixed(4)+', '+s.longitud.toFixed(4) : '—'}</td>
      <td><span class="badge badge-${s.activo ? 'success' : 'danger'}">${s.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td><button class="btn btn-sm btn-secondary" onclick="editarSede(${s.id})" title="Editar">✏️</button> <button class="btn btn-sm btn-danger" onclick="confirmarEliminar('sede',${s.id},'${esc(s.nombre)}')" title="Eliminar">🗑️</button></td>
    </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">Error al cargar</td></tr>';
  }
}

function abrirModalSede(data) {
  const d = data || {};
  abrirModal(
    data ? 'Editar sede' : 'Nueva sede',
    data ? 'Actualiza los datos de la sede' : 'Registra una nueva ubicación o punto de partida',
    `<div class="form-grid">
        <div class="form-group"><label>Nombre *</label><input id="s-nombre" value="${d.nombre||''}" placeholder="Medellín Centro"></div>
        <div class="form-group"><label>Centro de Operación</label><input id="s-centro" value="${d.centro_operacion||''}" placeholder="Norte, Sur, Este, Oeste..."></div>
        <div class="form-group"><label>Ciudad</label><input id="s-ciudad" value="${d.ciudad||''}" placeholder="Medellín"></div>
        <div class="form-group"><label>Dirección</label><input id="s-direccion" value="${d.direccion||''}" placeholder="Carrera 50 #45-12"></div>
        <div class="form-group"><label>Teléfono</label><input id="s-telefono" value="${d.telefono||''}" placeholder="3001234567"></div>
        <div class="form-group"><label>Latitud</label><input type="number" step="any" id="s-lat" value="${d.latitud||''}" placeholder="6.2476"></div>
        <div class="form-group"><label>Longitud</label><input type="number" step="any" id="s-lng" value="${d.longitud||''}" placeholder="-75.5658"></div>
        ${data ? `<div class="form-group"><label>Activo</label><select id="s-activo">
          <option value="true" ${d.activo!==false?'selected':''}>Activo</option>
          <option value="false" ${d.activo===false?'selected':''}>Inactivo</option>
        </select></div>` : ''}
      </div>
      <div class="mapa-pin" id="mapa-pin-sede"></div>
      <p style="font-size:11px;color:var(--muted);margin-top:6px;">💡 Haz clic en el mapa para posicionar o arrastra el marcador</p>
    `,
    `<button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="${data ? 'guardarSede('+d.id+')' : 'guardarSede()'}">${data ? 'Guardar cambios' : 'Crear sede'}</button>`
  );
  setTimeout(() => { configurarAutocompleteSede(); initMapaPin('mapa-pin-sede', 's-lat', 's-lng'); }, 100);
}

function editarSede(id) {
  api('/sedes/' + id).then(d => abrirModalSede(d.sede)).catch(e => alert(e.message));
}

async function guardarSede(id) {
  const body = {
    nombre: document.getElementById('s-nombre').value.trim(),
    centro_operacion: document.getElementById('s-centro').value.trim(),
    ciudad: document.getElementById('s-ciudad').value.trim(),
    direccion: document.getElementById('s-direccion').value.trim(),
    telefono: document.getElementById('s-telefono').value.trim(),
    latitud: document.getElementById('s-lat').value ? +document.getElementById('s-lat').value : null,
    longitud: document.getElementById('s-lng').value ? +document.getElementById('s-lng').value : null
  };
  if (id) {
    const activoEl = document.getElementById('s-activo');
    if (activoEl) body.activo = activoEl.value === 'true';
  }
  if (!body.nombre) { alert('El nombre es requerido'); return; }
  try {
    if (id) await api('/sedes/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/sedes', { method: 'POST', body: JSON.stringify(body) });
    cerrarModal();
    cargarSedes();
  } catch (e) { alert(e.message); }
}

/* ── Eliminar (genérico) ── */
function confirmarEliminar(tipo, id, label) {
  if (!confirm(label ? `¿Eliminar ${tipo} "${label}"?` : `¿Eliminar ${tipo} #${id}?`)) return;
  const endpoints = { vehiculo: '/vehiculos/', pedido: '/pedidos/', cliente: '/clientes/', sede: '/sedes/' };
  const ep = endpoints[tipo];
  if (!ep) return;
  api(ep + id, { method: 'DELETE' }).then(() => {
    if (tipo === 'vehiculo') cargarVehiculos();
    else if (tipo === 'pedido') cargarPedidos();
    else if (tipo === 'cliente') cargarClientes();
    else if (tipo === 'sede') cargarSedes();
  }).catch(e => alert(e.message));
}

/* ── Bulk delete ── */
function actualizarBtnEliminar(tipo) {
  const checks = document.querySelectorAll('.cb-' + tipo + ':checked');
  const btn = document.getElementById('btn-del-' + tipo);
  if (btn) btn.style.display = checks.length > 0 ? 'inline-flex' : 'none';
  // Sync "Seleccionar todo" for clientes
  if (tipo === 'cliente') {
    const total = document.querySelectorAll('.cb-cliente').length;
    const selAll = document.querySelector('#page-clientes input[onchange*="toggleAll"]');
    if (selAll && total > 0) selAll.checked = checks.length === total;
  }
}

function toggleAll(tipo, checked) {
  document.querySelectorAll('.cb-' + tipo).forEach(cb => cb.checked = checked);
  actualizarBtnEliminar(tipo);
}

async function eliminarSeleccionados(tipo) {
  const checks = document.querySelectorAll('.cb-' + tipo + ':checked');
  if (!checks.length) return;
  const ids = Array.from(checks).map(c => +c.value);
  if (!confirm(`¿Eliminar ${ids.length} ${tipo}(s) seleccionados?`)) return;
  const ep = { vehiculo: '/vehiculos/seleccionados', pedido: '/pedidos/seleccionados', cliente: '/clientes/seleccionados' };
  try {
    await api(ep[tipo], { method: 'DELETE', body: JSON.stringify({ ids }) });
    if (tipo === 'vehiculo') cargarVehiculos();
    else if (tipo === 'pedido') cargarPedidos();
    else if (tipo === 'cliente') cargarClientes();
  } catch (e) { alert(e.message); }
}

/* ── Rutas ── */
async function cargarRutas() {
  const tbody = document.querySelector('#tbl-rutas tbody');
  const fecha = document.getElementById('filtro-fecha').value;
  const sede = document.getElementById('filtro-rutas-sede')?.value || '';
  poblarSedesRutas();
  try {
    const params = new URLSearchParams();
    if (fecha) params.set('fecha', fecha);
    if (sede) params.set('sede', sede);
    const data = await api('/rutas?' + params.toString());
    if (!data.rutas?.length) { tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:32px;">No hay rutas para esta fecha</td></tr>'; return; }
    tbody.innerHTML = data.rutas.map(r => `
      <tr>
        <td><strong>${r.nombre || 'Ruta #'+r.id}</strong></td>
        <td>${r.placa || '—'}</td>
        <td>${r.sede || '—'}</td>
        <td>${r.cantidad_paradas || 0}</td>
        <td>${r.distancia_total_estimada ? r.distancia_total_estimada+' km' : '—'}</td>
        <td>${r.tiempo_estimado ? r.tiempo_estimado+' min' : '—'}</td>
        <td><span class="badge badge-${r.estado==='planificada'?'info':r.estado==='en_ejecucion'?'warning':r.estado==='completada'?'success':'danger'}">${r.estado}</span></td>
        <td>${r.fecha ? r.fecha.slice(0,10) : '—'}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="verRuta(${r.id})">👁️</button></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Error al cargar</td></tr>';
  }
}

let _sedesCache = null;
async function poblarSedesRutas() {
  const select = document.getElementById('filtro-rutas-sede');
  if (!select) return;
  try {
    if (!_sedesCache) { const d = await api('/sedes'); _sedesCache = d.sedes || []; }
    const actual = select.value;
    select.innerHTML = '<option value="">Todas las sedes</option>' +
      _sedesCache.map(s => `<option value="${esc(s.nombre)}" ${s.nombre===actual?'selected':''}>${esc(s.nombre)}</option>`).join('');
  } catch {}
}

async function verRuta(id) {
  try {
    const data = await api('/rutas/' + id);
    const r = data.ruta;
    const paradas = data.paradas || [];
    const tienenCoords = paradas.some(p => p.latitud && p.longitud);
    abrirModal(
      r.nombre || 'Ruta #' + r.id,
      `Vehículo: ${r.vehiculo_id} · Distancia: ${r.distancia_total_estimada||'—'} km · Tiempo: ${r.tiempo_estimado||'—'} min`,
      `<div class="tbl-wrap" style="margin-bottom:12px;"><table class="tbl"><thead><tr><th>#</th><th>Cliente</th><th>Dir.</th><th>Estado</th></tr></thead><tbody>
        ${paradas.map(p => `<tr><td>${p.secuencia}</td><td>${esc(p.cliente_nombre||'—')}</td><td class="truncate">${esc(p.direccion||'')}</td><td><span class="badge badge-${p.estado==='completada'?'success':'warning'}">${p.estado}</span></td></tr>`).join('')}
      </tbody></table></div>
      ${tienenCoords ? '<div id="mapa-ruta-detalle" style="height:280px;border-radius:10px;border:1px solid var(--border);"></div>' : ''}`,
      `<button class="btn btn-secondary" onclick="cerrarRutaDetalle()">Cerrar</button>`
    );
    if (tienenCoords) setTimeout(() => initMapaRutaDetalle(paradas), 200);
  } catch (e) { alert(e.message); }
}

function initMapaRutaDetalle(paradas) {
  const el = document.getElementById('mapa-ruta-detalle');
  if (!el || el._leafletMap) return;
  const map = L.map(el).setView([paradas[0].latitud, paradas[0].longitud], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  const coords = paradas.filter(p => p.latitud && p.longitud).map(p => [p.latitud, p.longitud]);
  if (coords.length) {
    L.polyline(coords, { color: '#00A86B', weight: 3 }).addTo(map);
    coords.forEach((c, i) => {
      L.circleMarker(c, { radius: 6, color: '#00A86B', fillColor: '#fff', fillOpacity: 0.9, weight: 2 })
        .addTo(map).bindPopup(`#${i+1} ${esc(paradas[i]?.cliente_nombre||'')}`);
    });
    map.fitBounds(coords, { padding: [30,30] });
  }
  el._leafletMap = map;
}

function cerrarRutaDetalle() {
  const el = document.getElementById('mapa-ruta-detalle');
  if (el && el._leafletMap) { el._leafletMap.remove(); el._leafletMap = null; }
  cerrarModal();
}

async function generarRutas() {
  const fecha = document.getElementById('filtro-fecha').value;
  if (!fecha) { alert('Selecciona una fecha'); return; }
  const sedeSelect = document.getElementById('filtro-rutas-sede');
  const sedeNombre = sedeSelect?.value || '';
  let sedeId = null;
  if (sedeNombre && _sedesCache) {
    const s = _sedesCache.find(x => x.nombre === sedeNombre);
    if (s) sedeId = s.id;
  }
  const msg = '¿Generar rutas optimizadas para ' + fecha + (sedeNombre ? ' (' + sedeNombre + ')' : '') + '?';
  if (!confirm(msg)) return;
  try {
    const body = { fecha };
    if (sedeId) body.sede_id = sedeId;
    const data = await api('/rutas/generar', { method: 'POST', body: JSON.stringify(body) });
    alert(data.mensaje || 'Rutas generadas');
    cargarRutas();
  } catch (e) { alert(e.message); }
}

/* ── Importadores ── */
function iniciarDropZones() {
  ['siesa', 'widetech'].forEach(t => {
    const zone = document.getElementById('drop-' + t);
    const input = document.getElementById('file-' + t);
    if (!zone || !input) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        const ev = new Event('change', { bubbles: true });
        input.dispatchEvent(ev);
      }
    });
  });
}

function previsualizarArchivo(input, nameId) {
  const el = document.getElementById(nameId);
  if (input.files?.length) {
    el.textContent = input.files[0].name;
    el.style.display = 'block';
    const btnId = input.id === 'file-siesa' ? 'btn-import-siesa' : 'btn-import-widetech';
    document.getElementById(btnId).disabled = false;
    document.getElementById('result-' + input.id.replace('file-', '')).innerHTML = '';
  }
}

async function importarSiesa() {
  const input = document.getElementById('file-siesa');
  const resEl = document.getElementById('result-siesa');
  if (!input.files?.length) { resEl.innerHTML = '<div style="padding:10px;background:rgba(247,97,79,.1);border-radius:8px;color:var(--danger);font-size:13px;">❌ Selecciona un archivo PDF primero</div>'; return; }
  const btn = document.getElementById('btn-import-siesa');
  btn.disabled = true; btn.textContent = 'Importando...';
  const fd = new FormData();
  fd.append('archivo', input.files[0]);
  try {
    const res = await fetch(API + '/importadores/siesa', { method: 'POST', headers: { 'Authorization': 'Bearer ' + TOKEN }, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    let html = `<div style="padding:10px;background:rgba(79,190,150,.1);border-radius:8px;color:var(--success);font-size:13px;">
      ✅ ${data.importados} pedidos importados${data.fallidos ? ', ' + data.fallidos + ' fallidos' : ''}
      ${data.clientesNuevos ? '<br>👤 ' + data.clientesNuevos + ' clientes nuevos' : ''}
      ${data.clientesActualizados ? '<br>🔄 ' + data.clientesActualizados + ' clientes actualizados' : ''}
    </div>`;
    if (data.debug) {
      const d = data.debug;
      const fevsHtml = d.fevs?.map(f => `${esc(f.fev)} | valor:${f.valor} | cliente:${esc(f.cliente)} | ciudad:${esc(f.ciudad)} | dir:${esc(f.direccion)} | tel:${f.telefono}`).join('\n') || '—';
      html += `<details style="margin-top:8px;background:var(--surface2);border-radius:8px;font-size:11px;font-family:monospace;color:var(--muted);padding:8px;cursor:pointer;">
        <summary style="font-weight:600;cursor:pointer;">🔍 Debug (${d.fevEncontrados || 0} FEVs)</summary>
        <div style="margin-top:6px;max-height:300px;overflow:auto;white-space:pre-wrap">
Fallback: ${d.fallbackUsed ? 'sí' : 'no'}
${fevsHtml ? '── FEVs ──\n' + fevsHtml + '\n' : ''}── RAW primeras líneas ──
${d.rawText ? esc(d.rawText).split('\n').slice(0,40).map((l,i) => `${i}: ${l}`).join('\n') : '—'}
        </div>
      </details>`;
    }
    resEl.innerHTML = html;
    input.value = ''; document.getElementById('file-siesa-name').style.display = 'none';
    cargarDashboard();
  } catch (e) {
    resEl.innerHTML = `<div style="padding:10px;background:rgba(247,97,79,.1);border-radius:8px;color:var(--danger);font-size:13px;">❌ ${e.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Importar';
  }
}

async function importarWidetech() {
  const input = document.getElementById('file-widetech');
  const resEl = document.getElementById('result-widetech');
  if (!input.files?.length) { resEl.innerHTML = '<div style="padding:10px;background:rgba(247,97,79,.1);border-radius:8px;color:var(--danger);font-size:13px;">❌ Selecciona un archivo Excel primero</div>'; return; }
  const btn = document.getElementById('btn-import-widetech');
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
    btn.disabled = false; btn.textContent = 'Importar';
  }
}

/* ── Usuarios ── */
async function cargarUsuarios() {
  const tbody = document.querySelector('#tbl-usuarios tbody');
  try {
    const data = await api('/usuarios');
    if (!data.usuarios?.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:32px;">No hay usuarios</td></tr>'; return; }
    tbody.innerHTML = data.usuarios.map(u => `
      <tr>
        <td><strong>${u.nombre}</strong></td>
        <td>${u.email}</td>
        <td><span class="badge badge-info">${u.rol}</span></td>
        <td><span class="badge badge-${u.activo ? 'success' : 'danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>${u.created_at ? u.created_at.slice(0,10) : '—'}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="editarUsuario(${u.id})">✏️</button></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Error al cargar</td></tr>';
  }
}

function abrirModalUsuario(data) {
  const d = data || {};
  abrirModal(
    data ? 'Editar usuario' : 'Nuevo usuario',
    data ? 'Actualiza los datos del usuario' : 'Crea un nuevo usuario del sistema',
    `
      <div class="form-grid">
        <div class="form-group"><label>Nombre *</label><input id="u-nombre" value="${d.nombre||''}"></div>
        <div class="form-group"><label>Email *</label><input type="email" id="u-email" value="${d.email||''}"></div>
        <div class="form-group"><label>Contraseña ${data?'(dejar vacío para mantener)':''} *</label><input type="password" id="u-pass" ${data?'placeholder="Sin cambios"':'required'}></div>
        <div class="form-group"><label>Rol</label><select id="u-rol">
          <option value="admin" ${d.rol==='admin'?'selected':''}>Administrador</option>
          <option value="operador" ${d.rol==='operador'?'selected':''}>Operador</option>
          <option value="visor" ${d.rol==='visor'?'selected':''}>Visor</option>
        </select></div>
        ${data ? '<div class="form-group"><label>Activo</label><select id="u-activo"><option value="true" '+(d.activo?'selected':'')+'>Sí</option><option value="false" '+(!d.activo?'selected':'')+'>No</option></select></div>' : ''}
      </div>
    `,
    `<button class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="${data ? 'guardarUsuario('+d.id+')' : 'guardarUsuario()'}">${data ? 'Guardar cambios' : 'Crear usuario'}</button>`
  );
}

function editarUsuario(id) {
  api('/usuarios').then(d => {
    const u = d.usuarios.find(x => x.id === id);
    if (u) abrirModalUsuario(u);
  }).catch(e => alert(e.message));
}

async function guardarUsuario(id) {
  const body = {
    nombre: document.getElementById('u-nombre').value.trim(),
    email: document.getElementById('u-email').value.trim(),
    rol: document.getElementById('u-rol').value
  };
  if (id) {
    body.activo = document.getElementById('u-activo')?.value === 'true';
    const pass = document.getElementById('u-pass').value;
    if (pass) body.password = pass;
  } else {
    body.password = document.getElementById('u-pass').value;
  }
  if (!body.nombre || !body.email) { alert('Nombre y email requeridos'); return; }
  if (!id && !body.password) { alert('Contraseña requerida'); return; }
  try {
    if (id) await api('/usuarios/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/usuarios', { method: 'POST', body: JSON.stringify(body) });
    cerrarModal();
    cargarUsuarios();
  } catch (e) { alert(e.message); }
}

/* ── Configuración ── */
let cfgTab = 'smtp';

async function rConfig() {
  document.querySelectorAll('#cfg-tab-bar .btn').forEach(b => b.classList.toggle('active', b.dataset.cfg === cfgTab));
  const el = document.getElementById('cfg-content');
  try {
    const data = await api('/configuracion');
    const c = data.config || {};
    if (cfgTab === 'smtp') renderSmtp(el, c);
    else if (cfgTab === 'backup') renderBackup(el, c);
    else if (cfgTab === 'seguridad') renderSeguridad(el, c);
    else if (cfgTab === 'auditoria') renderAuditoria(el);
    else if (cfgTab === 'actualizar') renderActualizar(el);
    else if (cfgTab === 'mapas') renderMapas(el);
  } catch { el.innerHTML = '<p class="text-muted">Error al cargar configuración</p>'; }
}

function cargarConfig() { rConfig(); }

/* ── SMTP Tab ── */
function renderSmtp(el, c) {
  const heredar = c.smtp_heredar === '1' || c.smtp_heredar === 'true';
  el.innerHTML = `
    <div class="card" style="max-width:600px;">
      <h4 style="margin-bottom:16px;font-family:var(--font-head);">📧 Configuración SMTP</h4>
      <div style="margin-bottom:16px;padding:12px;background:var(--surface2);border-radius:8px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;">
          <input type="checkbox" id="cfg-heredar" ${heredar?'checked':''} onchange="toggleHeredarSmtp()">
          Heredar configuración del Launcher
        </label>
        <div id="cfg-launcher-url-wrap" style="margin-top:8px;${heredar?'':'display:none;'}">
          <label style="font-size:12px;color:var(--muted);">URL del Launcher</label>
          <input id="cfg-launcher-url" value="${esc(c.launcher_url||'http://localhost:3002')}" placeholder="http://localhost:3002" style="width:100%;padding:7px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none;">
        </div>
      </div>

      <div id="cfg-smtp-local" style="${heredar?'opacity:0.5;pointer-events:none;':''}">
        <div class="form-grid">
          <div class="form-group"><label>Host SMTP</label><input id="cfg-host" value="${esc(c.smtp_host||'')}" placeholder="smtp.gmail.com"></div>
          <div class="form-group"><label>Puerto</label><input id="cfg-puerto" value="${c.smtp_puerto||'587'}" placeholder="587"></div>
          <div class="form-group"><label>TLS</label><select id="cfg-tls"><option value="1" ${c.smtp_tls==='1'?'selected':''}>Sí</option><option value="0" ${c.smtp_tls==='0'?'selected':''}>No</option></select></div>
          <div class="form-group"><label>Usuario</label><input id="cfg-usuario" value="${esc(c.smtp_usuario||'')}"></div>
          <div class="form-group"><label>Contraseña</label><input type="password" id="cfg-password" value="${c.smtp_password?'••••••••':''}"></div>
          <div class="form-group"><label>Remitente (From)</label><input id="cfg-remitente" value="${esc(c.smtp_remitente||'')}" placeholder="logistics@vitamar.com"></div>
        </div>
      </div>
      <div class="flex" style="margin-top:8px;">
        <button class="btn btn-primary" onclick="guardarSmtp()">✓ Guardar</button>
        <button class="btn btn-secondary" onclick="testSmtp()">✉ Probar</button>
      </div>
      <div id="smtp-msg" style="margin-top:10px;"></div>
    </div>`;
}

function toggleHeredarSmtp() {
  const checked = document.getElementById('cfg-heredar').checked;
  document.getElementById('cfg-launcher-url-wrap').style.display = checked ? '' : 'none';
  document.getElementById('cfg-smtp-local').style.opacity = checked ? '0.5' : '';
  document.getElementById('cfg-smtp-local').style.pointerEvents = checked ? 'none' : '';
}

async function guardarSmtp() {
  const msg = document.getElementById('smtp-msg');
  try {
    const body = {
      smtp_heredar: document.getElementById('cfg-heredar').checked ? '1' : '0',
      launcher_url: document.getElementById('cfg-launcher-url').value.trim()
    };
    if (body.smtp_heredar !== '1') {
      body.smtp_host = document.getElementById('cfg-host').value.trim();
      body.smtp_puerto = document.getElementById('cfg-puerto').value.trim();
      body.smtp_tls = document.getElementById('cfg-tls').value;
      body.smtp_usuario = document.getElementById('cfg-usuario').value.trim();
      body.smtp_password = document.getElementById('cfg-password').value;
      body.smtp_remitente = document.getElementById('cfg-remitente').value.trim();
    }
    await api('/configuracion', { method: 'PUT', body: JSON.stringify(body) });
    msg.innerHTML = '<span style="color:var(--success)">✓ Configuración guardada</span>';
  } catch (e) { msg.innerHTML = '<span style="color:var(--danger)">✗ ' + e.message + '</span>'; }
}

async function testSmtp() {
  const msg = document.getElementById('smtp-msg');
  msg.innerHTML = '<span class="text-muted">Enviando...</span>';
  try {
    const heredar = document.getElementById('cfg-heredar').checked;
    const body = { smtp_heredar: heredar ? '1' : '0', launcher_url: document.getElementById('cfg-launcher-url').value.trim() };
    if (!heredar) {
      body.host = document.getElementById('cfg-host').value.trim();
      body.puerto = document.getElementById('cfg-puerto').value.trim();
      body.tls = document.getElementById('cfg-tls').value;
      body.usuario = document.getElementById('cfg-usuario').value.trim();
      body.password = document.getElementById('cfg-password').value;
      body.remitente = document.getElementById('cfg-remitente').value.trim();
    }
    const data = await api('/configuracion/test', { method: 'POST', body: JSON.stringify(body) });
    msg.innerHTML = '<span style="color:var(--success)">✓ ' + data.mensaje + '</span>';
  } catch (e) { msg.innerHTML = '<span style="color:var(--danger)">✗ ' + e.message + '</span>'; }
}

/* ── Backup Tab ── */
function renderBackup(el) {
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card">
        <h4 style="margin-bottom:12px;font-family:var(--font-head);">📦 Exportar Backup</h4>
        <p class="text-muted" style="font-size:13px;margin-bottom:14px;">Descarga un ZIP con todas las tablas del sistema</p>
        <button class="btn btn-primary" onclick="descargarBackup()">💾 Descargar Backup</button>
        <div id="backup-ok" style="display:none;margin-top:10px;color:var(--success);">✓ Backup generado</div>
        <hr style="border-color:var(--border);margin:18px 0;">
        <h4 style="margin-bottom:8px;font-family:var(--font-head);font-size:14px;">🤖 Último Backup Automático</h4>
        <div id="ultimo-bk-info"><p class="text-muted">Cargando...</p></div>
        <button class="btn btn-secondary btn-sm mt-12" onclick="ejecutarBackupScript()">▶ Ejecutar ahora</button>
        <div id="bk-script-log" style="margin-top:8px;"></div>
      </div>
      <div class="card">
        <h4 style="margin-bottom:12px;font-family:var(--font-head);">♻️ Restaurar Backup</h4>
        <p class="text-muted" style="font-size:13px;margin-bottom:14px;">Selecciona un backup del servidor para restaurar</p>
        <div id="lista-backups"><p class="text-muted">Cargando...</p></div>
      </div>
    </div>`;
  cargarUltimoBackup();
  cargarListaBackups();
}

async function descargarBackup() {
  try {
    const res = await fetch('/api/backup', { headers: { 'Authorization': 'Bearer ' + TOKEN } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'logistics_backup_' + new Date().toISOString().slice(0,10) + '.zip';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    document.getElementById('backup-ok').style.display = 'block';
  } catch (e) { alert(e.message); }
}

async function cargarUltimoBackup() {
  const el = document.getElementById('ultimo-bk-info');
  try {
    const data = await api('/backup/ultimo');
    if (data.ultimo) el.innerHTML = `<div style="font-size:13px;">📅 ${new Date(data.ultimo.fecha).toLocaleString()} · ${data.ultimo.exitoso ? '✅ Exitoso' : '❌ Fallido'}</div>`;
    else el.innerHTML = '<p class="text-muted">Sin backups automáticos aún</p>';
  } catch { el.innerHTML = '<p class="text-muted">—</p>'; }
}

async function cargarListaBackups() {
  const el = document.getElementById('lista-backups');
  try {
    const data = await api('/backup/lista');
    if (!data.backups?.length) { el.innerHTML = '<p class="text-muted">No hay backups en el servidor</p>'; return; }
    el.innerHTML = data.backups.map(b => `
      <div class="flex" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
        <div><div style="font-weight:500;font-size:13px;">📦 ${b.nombre}</div><div style="font-size:11px;color:var(--muted);">${new Date(b.fecha).toLocaleDateString()} · ${b.tamaño}</div></div>
        <div class="flex">
          <button class="btn btn-sm btn-secondary" onclick="descargarBackupServidor('${b.nombre}')">⬇️</button>
          <button class="btn btn-sm btn-secondary" onclick="restaurarBackupLocal('${b.nombre}')">♻️</button>
        </div>
      </div>
    `).join('');
  } catch { el.innerHTML = '<p class="text-muted">Error al cargar</p>'; }
}

async function descargarBackupServidor(nombre) {
  try {
    const res = await fetch('/api/backup/descargar/' + encodeURIComponent(nombre), { headers: { 'Authorization': 'Bearer ' + TOKEN } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { alert(e.message); }
}

async function restaurarBackupLocal(nombre) {
  if (!confirm('¿Restaurar backup ' + nombre + '? Los datos actuales serán reemplazados.')) return;
  try {
    const data = await api('/backup/restore/local/' + encodeURIComponent(nombre), { method: 'POST' });
    alert(data.mensaje || 'Restauración completada');
  } catch (e) { alert(e.message); }
}

async function ejecutarBackupScript() {
  const log = document.getElementById('bk-script-log');
  log.innerHTML = '<span class="text-muted">Ejecutando...</span>';
  try {
    const data = await api('/backup/ejecutar', { method: 'POST' });
    log.innerHTML = '<span style="color:' + (data.ok ? 'var(--success)' : 'var(--danger)') + '">' + (data.ok ? '✓ Completado' : '✗ Error') + '</span>';
    cargarUltimoBackup();
    cargarListaBackups();
  } catch (e) { log.innerHTML = '<span style="color:var(--danger)">✗ ' + e.message + '</span>'; }
}

/* ── Seguridad Tab ── */
let secInterval = null;

function renderSeguridad(el) {
  if (secInterval) clearInterval(secInterval);
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
      <div class="stat-card"><div class="stat-label">IPs Bloqueadas</div><div class="stat-value" id="sec-bloqueadas" style="color:var(--danger);">—</div></div>
      <div class="stat-card"><div class="stat-label">IPs en Seguimiento</div><div class="stat-value" id="sec-seguimiento" style="color:var(--warning);">—</div></div>
    </div>
    <div class="card" style="margin-bottom:20px;max-width:600px;">
      <h4 style="margin-bottom:12px;font-family:var(--font-head);">🌐 URL Pública</h4>
      <p class="text-muted" style="font-size:13px;margin-bottom:10px;">Usada en los enlaces de recuperación de contraseña</p>
      <div class="flex">
        <input type="text" id="cfg-app-url" value="" placeholder="https://logistica.midominio.com" style="flex:1;">
        <button class="btn btn-primary btn-sm" onclick="guardarAppUrl()">Guardar</button>
      </div>
      <div id="appurl-msg" style="margin-top:6px;font-size:12px;"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
      <div class="card">
        <h4 style="margin-bottom:16px;font-family:var(--font-head);">⚙️ Configuración Rate Limiter</h4>
        <p class="text-muted" style="font-size:13px;margin-bottom:14px;">Límites de intentos de inicio de sesión</p>
        <div id="sec-rate-config">Cargando...</div>
        <button class="btn btn-primary btn-sm mt-12" onclick="guardarSecCfg()">💾 Guardar</button>
        <div id="sec-cfg-msg" style="margin-top:8px;"></div>
      </div>
      <div class="card">
        <h4 style="margin-bottom:16px;font-family:var(--font-head);">🚫 Protección Fail2ban</h4>
        <p class="text-muted" style="font-size:13px;margin-bottom:14px;">Servicio de protección a nivel de servidor</p>
        <div id="sec-fail2ban">Cargando...</div>
      </div>
    </div>
    <div class="card" id="sec-bloqueos-card">
      <h4 style="margin-bottom:12px;font-family:var(--font-head);">IPs Bloqueadas</h4>
      <div id="sec-bloqueos-list"><p class="text-muted">Cargando...</p></div>
    </div>
    <div class="card mt-12" id="sec-seguimiento-card">
      <h4 style="margin-bottom:12px;font-family:var(--font-head);">IPs en Seguimiento</h4>
      <div id="sec-seguimiento-list"><p class="text-muted">Cargando...</p></div>
    </div>`;
  cargarSecCfg();
  cargarSecStatus();
  secInterval = setInterval(cargarSecStatus, 10000);
}

async function cargarSecCfg() {
  try {
    const data = await api('/configuracion/seguridad');
    const c = data.config || {};
    const urlEl = document.getElementById('cfg-app-url');
    if (urlEl && c.app_url) urlEl.value = c.app_url;
    const el = document.getElementById('sec-rate-config');
    if (!el) return;
    el.innerHTML = `
      <div class="form-group"><label>Intentos máximos</label><input type="number" id="sec-login-max" value="${c.login_max_attempts||5}" min="1" max="100"></div>
      <div class="form-group"><label>Ventana (minutos)</label><input type="number" id="sec-login-window" value="${c.login_window_minutes||5}" min="1" max="1440"></div>
      <div class="form-group"><label>Bloqueo (minutos)</label><input type="number" id="sec-login-block" value="${c.login_block_minutes||30}" min="1" max="1440"></div>
    `;
    const f2 = document.getElementById('sec-fail2ban');
    if (data.fail2ban) {
      f2.innerHTML = `<div style="font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:8px 0;"><span class="text-muted">Instalado</span><strong>${data.fail2ban.installed ? '✅ Sí' : '❌ No'}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--border);"><span class="text-muted">Activo</span><strong>${data.fail2ban.active ? '✅ Sí' : '❌ No'}</strong></div>
        ${data.fail2ban.installed ? `<div class="flex" style="margin-top:10px;">
          <button class="btn btn-sm btn-secondary" onclick="f2bAction('start')">▶ Iniciar</button>
          <button class="btn btn-sm btn-secondary" onclick="f2bAction('stop')">⏹ Detener</button>
          <button class="btn btn-sm btn-secondary" onclick="f2bAction('restart')">↻ Reiniciar</button>
        </div><div id="f2b-msg" style="margin-top:6px;font-size:12px;"></div>` : ''}
      </div>`;
    }
  } catch {}
}

async function guardarSecCfg() {
  const msg = document.getElementById('sec-cfg-msg');
  try {
    await api('/configuracion/seguridad', { method: 'PUT', body: JSON.stringify({
      login_max_attempts: document.getElementById('sec-login-max')?.value,
      login_window_minutes: document.getElementById('sec-login-window')?.value,
      login_block_minutes: document.getElementById('sec-login-block')?.value
    })});
    msg.innerHTML = '<span style="color:var(--success)">✓ Guardado</span>';
  } catch (e) { msg.innerHTML = '<span style="color:var(--danger)">✗ ' + e.message + '</span>'; }
}

async function guardarAppUrl() {
  const msg = document.getElementById('appurl-msg');
  const val = document.getElementById('cfg-app-url')?.value?.trim();
  try {
    await api('/configuracion/seguridad', { method: 'PUT', body: JSON.stringify({ app_url: val || '' }) });
    msg.innerHTML = '<span style="color:var(--success)">✓ URL guardada</span>';
  } catch (e) { msg.innerHTML = '<span style="color:var(--danger)">✗ ' + e.message + '</span>'; }
}

async function f2bAction(action) {
  const msg = document.getElementById('f2b-msg');
  if (!msg) return;
  msg.innerHTML = '<span class="text-muted">Ejecutando ' + action + '...</span>';
  try {
    const data = await api('/configuracion/fail2ban/' + action, { method: 'POST' });
    msg.innerHTML = '<span style="color:var(--success)">✓ ' + data.mensaje + '</span>';
  } catch (e) { msg.innerHTML = '<span style="color:var(--danger)">✗ ' + e.message + '</span>'; }
}

async function cargarSecStatus() {
  try {
    const data = await api('/auth/ratelimit-status');
    const bEl = document.getElementById('sec-bloqueadas');
    const sEl = document.getElementById('sec-seguimiento');
    if (bEl) bEl.textContent = data.totalBloqueadas || 0;
    if (sEl) sEl.textContent = data.totalIpsEnSeguimiento || 0;

    const bList = document.getElementById('sec-bloqueos-list');
    if (bList) {
      if (!data.bloqueadas?.length) { bList.innerHTML = '<p class="text-muted">Sin IPs bloqueadas</p>'; }
      else {
        bList.innerHTML = data.bloqueadas.map(b => `
          <div class="flex" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
            <div><span style="font-weight:500;">${b.ip}</span><span style="font-size:11px;color:var(--muted);margin-left:8px;">${b.intentos} intentos · ${b.minutosRestantes} min rest.</span></div>
            <button class="btn btn-sm btn-secondary" onclick="desbloquearIP('${b.ip}')">Desbloquear</button>
          </div>
        `).join('');
      }
    }

    const sList = document.getElementById('sec-seguimiento-list');
    if (sList) {
      if (!data.enSeguimiento?.length) { sList.innerHTML = '<p class="text-muted">Sin IPs en seguimiento</p>'; }
      else {
        sList.innerHTML = data.enSeguimiento.map(s => `
          <div class="flex" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
            <div><span style="font-weight:500;">${s.ip}</span><span style="font-size:11px;color:var(--muted);margin-left:8px;">${s.intentos}/${data.configuracion?.maxIntentos||5} intentos · ventana ${s.ventanaExpiraEn}</span></div>
            <progress max="${data.configuracion?.maxIntentos||5}" value="${s.intentos}" style="width:80px;height:6px;border-radius:3px;accent-color:var(--warning);"></progress>
          </div>
        `).join('');
      }
    }
  } catch {}
}

async function desbloquearIP(ip) {
  try {
    await api('/auth/ratelimit-status/' + encodeURIComponent(ip), { method: 'DELETE' });
    cargarSecStatus();
  } catch (e) { alert(e.message); }
}

/* ── Password Change ── */
function abrirChpass() {
  document.getElementById('chpass-error').style.display = 'none';
  document.getElementById('chpass-msg').innerHTML = '';
  document.getElementById('chpass-actual').value = '';
  document.getElementById('chpass-nueva').value = '';
  document.getElementById('chpass-confirm').value = '';
  ['chpreq-len','chpreq-up','chpreq-num','chpreq-sym'].forEach(id => document.getElementById(id).style.color = 'var(--muted)');
  document.getElementById('modal-chpass').classList.add('show');
  document.getElementById('chpass-nueva').addEventListener('input', validarChpassReqs);
}

function cerrarChpass() {
  document.getElementById('modal-chpass').classList.remove('show');
  document.getElementById('chpass-nueva').removeEventListener('input', validarChpassReqs);
}

document.getElementById('modal-chpass')?.addEventListener('click', function(e) {
  if (e.target === this) cerrarChpass();
});

function validarChpassReqs() {
  const p = document.getElementById('chpass-nueva').value;
  const toggle = (id, ok) => document.getElementById(id).style.color = ok ? 'var(--success)' : 'var(--muted)';
  toggle('chpreq-len', p.length >= 8);
  toggle('chpreq-up', /[A-Z]/.test(p));
  toggle('chpreq-num', /[0-9]/.test(p));
  toggle('chpreq-sym', /[!@#$%^&*(),.?":{}|<>_\-+=\\\/[\]~`]/.test(p));
}

async function doChangePass() {
  const actual = document.getElementById('chpass-actual').value;
  const nueva = document.getElementById('chpass-nueva').value;
  const confirm = document.getElementById('chpass-confirm').value;
  const errEl = document.getElementById('chpass-error');
  const msgEl = document.getElementById('chpass-msg');
  errEl.style.display = 'none'; msgEl.innerHTML = '';
  if (!actual || !nueva) { errEl.textContent = 'Completa todos los campos'; errEl.style.display = 'block'; return; }
  if (nueva.length < 8) { errEl.textContent = 'La nueva contraseña debe tener al menos 8 caracteres'; errEl.style.display = 'block'; return; }
  if (nueva !== confirm) { errEl.textContent = 'Las contraseñas no coinciden'; errEl.style.display = 'block'; return; }
  try {
    await api('/auth/cambiar-password', { method: 'POST', body: JSON.stringify({ actual, nueva }) });
    msgEl.innerHTML = '<span style="color:var(--success)">✓ Contraseña actualizada correctamente</span>';
    document.getElementById('chpass-actual').value = '';
    document.getElementById('chpass-nueva').value = '';
    document.getElementById('chpass-confirm').value = '';
    setTimeout(cerrarChpass, 1500);
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
}

/* ── Auditoría Tab ── */
function renderAuditoria(el) {
  el.innerHTML = `
    <div class="stats-row" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat-card"><div class="stat-label">Accesos hoy</div><div class="stat-value" id="aud-exitos-hoy">—</div></div>
      <div class="stat-card"><div class="stat-label">Fallidos hoy</div><div class="stat-value" id="aud-fallidos-hoy" style="color:var(--danger)">—</div></div>
      <div class="stat-card"><div class="stat-label">Accesos (7d)</div><div class="stat-value" id="aud-exitos-7d">—</div></div>
    </div>
    <div class="flex" style="margin-bottom:14px;flex-wrap:wrap;">
      <input type="text" id="aud-buscar" placeholder="🔍 Buscar usuario/email..." style="width:200px;" oninput="cargarAuditoria()">
      <select id="aud-fil-tipo" onchange="cargarAuditoria()" style="width:auto;">
        <option value="">Todos</option><option value="exito">Exitoso</option><option value="fallido">Fallido</option>
      </select>
      <input type="date" id="aud-desde" onchange="cargarAuditoria()" style="width:auto;">
      <input type="date" id="aud-hasta" onchange="cargarAuditoria()" style="width:auto;">
      <button class="btn btn-sm btn-secondary" onclick="cargarAuditoria()">🔄</button>
    </div>
    <div class="tbl-wrap">
      <table class="tbl"><thead><tr><th>Usuario</th><th>Email</th><th>Tipo</th><th>IP</th><th>Fecha</th></tr></thead><tbody id="aud-body"></tbody></table>
    </div>`;
  cargarAuditoria();
}

async function cargarAuditoria() {
  const params = new URLSearchParams();
  const tipo = document.getElementById('aud-fil-tipo')?.value;
  const buscar = document.getElementById('aud-buscar')?.value;
  const desde = document.getElementById('aud-desde')?.value;
  const hasta = document.getElementById('aud-hasta')?.value;
  if (tipo) params.set('tipo', tipo);
  if (buscar) params.set('buscar', buscar);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  try {
    const data = await api('/auditoria?' + params.toString());
    if (data.stats) {
      document.getElementById('aud-exitos-hoy').textContent = data.stats.exitos_hoy || 0;
      document.getElementById('aud-fallidos-hoy').textContent = data.stats.fallidos_hoy || 0;
      document.getElementById('aud-exitos-7d').textContent = data.stats.exitos_7d || 0;
    }
    const tbody = document.getElementById('aud-body');
    if (!data.historial?.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding:24px;">Sin registros</td></tr>'; return; }
    tbody.innerHTML = data.historial.map(h => `
      <tr>
        <td>${esc(h.nombre||'—')}</td>
        <td>${esc(h.email||'—')}</td>
        <td><span class="badge badge-${h.tipo==='exito'?'success':'danger'}">${h.tipo==='exito'?'✅ Exitoso':'❌ Fallido'}</span></td>
        <td>${h.ip||'—'}</td>
        <td>${new Date(h.timestamp).toLocaleString()}</td>
      </tr>
    `).join('');
  } catch {}
}

/* ── Actualizar Tab ── */
let updatePolling = null;

function renderActualizar(el) {
  if (updatePolling) clearInterval(updatePolling);
  el.innerHTML = `
    <div class="card" style="max-width:700px;">
      <h4 style="margin-bottom:16px;font-family:var(--font-head);">🚀 Actualización del sistema</h4>
      <div id="update-status" style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--surface2);border-radius:10px;margin-bottom:12px">
          <div style="width:10px;height:10px;border-radius:50%;background:var(--accent)"></div>
          <div style="flex:1"><div style="font-weight:600" id="update-version">Versión: —</div><div style="font-size:12px;color:var(--muted)" id="update-commit">—</div></div>
          <button class="btn btn-secondary btn-sm" onclick="checkUpdates()" id="btn-check-update">🔍 Verificar</button>
        </div>
        <div id="update-available" style="display:none;padding:16px;background:rgba(79,190,150,.1);border:1px solid rgba(79,190,150,.3);border-radius:10px;margin-bottom:12px">
          <div style="font-weight:600;color:var(--success);margin-bottom:8px">🎉 Nueva versión disponible</div>
          <div id="update-changes" style="font-size:13px;color:var(--text);margin-bottom:12px"></div>
          <div class="flex"><button class="btn btn-primary" onclick="ejecutarActualizacion()" id="btn-update-now">🚀 Actualizar ahora</button></div>
        </div>
        <div id="update-no-changes" style="display:none;padding:14px;background:var(--surface2);border-radius:10px;margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px;color:var(--success);font-weight:500">✓ Sistema actualizado</div></div>
      </div>
      <div style="margin-top:16px">
        <div style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px">Registro de actualizaciones</div>
        <div id="update-log" style="background:#000;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#0f0;max-height:200px;overflow-y:auto;white-space:pre-wrap">Cargando...</div>
      </div>
    </div>`;
  cargarStatusActualizacion();
  cargarLogActualizacion();
}

async function cargarStatusActualizacion() {
  try {
    const data = await api('/actualizador/status');
    document.getElementById('update-version').textContent = 'Versión: ' + (data.commit || '—');
    let com = 'Rama: ' + (data.branch || '—') + ' | Repo: ' + (data.remote || '—');
    if (data.lastUpdate) com += ' | Última: ' + new Date(data.lastUpdate).toLocaleString('es-CO');
    document.getElementById('update-commit').textContent = com;
  } catch {}
}

async function cargarLogActualizacion() {
  try {
    const data = await api('/actualizador/logs');
    const el = document.getElementById('update-log');
    if (el) { el.textContent = data.log || 'Sin registros'; el.scrollTop = el.scrollHeight; }
  } catch {}
}

async function checkUpdates() {
  const btn = document.getElementById('btn-check-update');
  if (!btn) return;
  btn.disabled = true; btn.textContent = 'Verificando...';
  try {
    const data = await api('/actualizador/check', { method: 'POST' });
    const av = document.getElementById('update-available');
    const nc = document.getElementById('update-no-changes');
    if (av) av.style.display = 'none';
    if (nc) nc.style.display = 'none';
    if (data.hasUpdates) {
      if (av) av.style.display = 'block';
      const ch = document.getElementById('update-changes');
      if (ch) ch.innerHTML = '<strong>' + data.commitsBehind + '</strong> actualización(es) pendiente(s)<br>' +
        '<div style="margin-left:12px;margin-top:8px;color:#0f0">🔄 Local: ' + data.currentCommit + ' → Remote: ' + data.remoteCommit + '</div>' +
        (data.changes || []).map(c => '<div style="margin-left:12px;margin-top:4px">• ' + esc(c) + '</div>').join('');
    } else {
      if (nc) nc.style.display = 'block';
    }
  } catch (e) { alert('Error verificando: ' + e.message); }
  if (btn) { btn.disabled = false; btn.innerHTML = '🔍 Verificar'; }
}

async function ejecutarActualizacion() {
  if (!confirm('¿Actualizar el sistema? El servicio se reiniciará automáticamente.')) return;
  const btn = document.getElementById('btn-update-now');
  if (!btn) return;
  btn.disabled = true; btn.textContent = 'Actualizando...';
  try {
    await api('/actualizador/update', { method: 'POST' });
    document.getElementById('update-available').style.display = 'none';
    document.getElementById('update-no-changes').style.display = 'block';
    updatePolling = setInterval(async () => {
      await cargarLogActualizacion();
      try {
        const status = await api('/actualizador/status');
        if (status?.updaterLog?.includes('COMPLETADA')) {
          clearInterval(updatePolling);
          try { await api('/actualizador/restart', { method: 'POST' }); } catch {}
          let intentos = 0;
          const esperar = setInterval(async () => {
            try {
              await fetch('/api/health');
              clearInterval(esperar);
              window.location.reload();
            } catch { intentos++; if (intentos > 60) { clearInterval(esperar); window.location.reload(); } }
          }, 2000);
        }
      } catch {}
    }, 3000);
    await cargarLogActualizacion();
  } catch (e) {
    clearInterval(updatePolling);
    alert('Error: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '🚀 Actualizar ahora';
  }
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ── Google Places Autocomplete para clientes ── */
window.iniciarAutocompleteCliente = function() {
  window.googleMapsListo = true;
};

function configurarAutocompleteCliente() {
  if (typeof google === 'undefined' || !window.googleMapsListo) {
    const input = document.getElementById('c-direccion');
    if (input && !input._aviso) {
      input._aviso = true;
      input.placeholder = '🔑 Configura API Key en Ajustes → Mapas';
      input.title = 'Ve a Configuración → Mapas para ingresar tu API key de Google Maps';
    }
    return;
  }
  const input = document.getElementById('c-direccion');
  if (!input || input._autocomplete) return;

  const ac = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'co' },
    fields: ['address_components', 'formatted_address', 'geometry', 'name']
  });
  input._autocomplete = true;

  ac.addListener('place_changed', () => {
    const place = ac.getPlace();
    if (!place.geometry) return;
    document.getElementById('c-lat').value = place.geometry.location.lat();
    document.getElementById('c-lng').value = place.geometry.location.lng();
    for (const comp of place.address_components || []) {
      if (comp.types.includes('locality') || comp.types.includes('administrative_area_level_2')) {
        document.getElementById('c-ciudad').value = comp.long_name;
        break;
      } else if (comp.types.includes('administrative_area_level_1')) {
        document.getElementById('c-ciudad').value = comp.long_name;
      }
    }
    if (place.formatted_address) input.value = place.formatted_address;
  });
}

function configurarAutocompleteSede() {
  if (typeof google === 'undefined' || !window.googleMapsListo) {
    const input = document.getElementById('s-direccion');
    if (input && !input._aviso) {
      input._aviso = true;
      input.placeholder = '🔑 Configura API Key en Ajustes → Mapas';
      input.title = 'Ve a Configuración → Mapas para ingresar tu API key de Google Maps';
    }
    return;
  }
  const input = document.getElementById('s-direccion');
  if (!input || input._autocomplete) return;

  const ac = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'co' },
    fields: ['address_components', 'formatted_address', 'geometry', 'name']
  });
  input._autocomplete = true;

  ac.addListener('place_changed', () => {
    const place = ac.getPlace();
    if (!place.geometry) return;
    document.getElementById('s-lat').value = place.geometry.location.lat();
    document.getElementById('s-lng').value = place.geometry.location.lng();
    for (const comp of place.address_components || []) {
      if (comp.types.includes('locality') || comp.types.includes('administrative_area_level_2')) {
        document.getElementById('s-ciudad').value = comp.long_name;
        break;
      } else if (comp.types.includes('administrative_area_level_1')) {
        document.getElementById('s-ciudad').value = comp.long_name;
      }
    }
    if (place.formatted_address) input.value = place.formatted_address;
  });
}

function initMapaPin(containerId, latInputId, lngInputId) {
  const container = document.getElementById(containerId);
  if (!container || container._leafletMap) return;
  const latVal = parseFloat(document.getElementById(latInputId)?.value);
  const lngVal = parseFloat(document.getElementById(lngInputId)?.value);
  const hasCoords = !isNaN(latVal) && !isNaN(lngVal);
  const center = hasCoords ? [latVal, lngVal] : [6.2476, -75.5658];
  const map = L.map(container).setView(center, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  container._leafletMap = map;
  window._activeModalMap = map;

  let marker = null;
  if (hasCoords) {
    marker = L.marker(center, { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      document.getElementById(latInputId).value = pos.lat.toFixed(8);
      document.getElementById(lngInputId).value = pos.lng.toFixed(8);
    });
  }
  map.on('click', (e) => {
    if (marker) marker.setLatLng(e.latlng);
    else { marker = L.marker(e.latlng, { draggable: true }).addTo(map); }
    document.getElementById(latInputId).value = e.latlng.lat.toFixed(8);
    document.getElementById(lngInputId).value = e.latlng.lng.toFixed(8);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      document.getElementById(latInputId).value = pos.lat.toFixed(8);
      document.getElementById(lngInputId).value = pos.lng.toFixed(8);
    });
  });
}

/* ── Mapa ── */
let mapInstance = null;
let mapLayers = { rutas: [], vehiculos: [], paradas: [] };

const coloresRuta = ['#00A86B','#4f8ef7','#f7944f','#f7614f','#9b59b6','#1abc9c','#e67e22','#3498db'];
let mapaFitted = false;

function resetMapaLayers() {
  Object.values(mapLayers).forEach(arr => arr.forEach(l => mapInstance?.removeLayer(l)));
  mapLayers = { rutas: [], vehiculos: [], paradas: [] };
}

async function cargarMapa() {
  const el = document.getElementById('mapa-contenedor');
  if (!el) return; // page not visible
  const fecha = document.getElementById('mapa-fecha').value || new Date().toISOString().split('T')[0];

  // Init map once
  if (!mapInstance) {
    mapInstance = L.map(el).setView([6.2476, -75.5658], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(mapInstance);
    mapInstance.on('resize', () => mapInstance.invalidateSize());
  }

  resetMapaLayers();

  try {
    const data = await api('/rutas/mapa/datos?fecha=' + fecha);
    const rutaSelect = document.getElementById('mapa-filtro-ruta');
    rutaSelect.innerHTML = '<option value="">Todas las rutas</option>' +
      data.rutas.map(r => `<option value="${r.id}">${esc(r.nombre||'Ruta #'+r.id)} · ${esc(r.placa)}</option>`).join('');

    // Vehicles
    for (const v of data.vehiculos) {
      if (!v.ultima_posicion_lat || !v.ultima_posicion_lng) continue;
      const marker = L.circleMarker([v.ultima_posicion_lat, v.ultima_posicion_lng], {
        radius: 8, color: '#4f8ef7', fillColor: '#4f8ef7', fillOpacity: 0.8
      }).addTo(mapInstance);
      marker.bindPopup(`<b>${esc(v.placa)}</b><br>${esc(v.alias||'')}<br>Estado: ${v.estado}`);
      mapLayers.vehiculos.push(marker);
    }

    // Routes + stops
    let idx = 0;
    for (const r of data.rutas) {
      const paradasRuta = data.paradas.filter(p => p.ruta_id === r.id).filter(p => p.latitud && p.longitud);
      if (paradasRuta.length < 2) continue;

      const color = coloresRuta[idx % coloresRuta.length];
      const coords = paradasRuta.map(p => [p.latitud, p.longitud]);

      // polyline
      const poly = L.polyline(coords, { color, weight: 3, opacity: 0.8 }).addTo(mapInstance);
      poly.bindPopup(`<b>${esc(r.nombre||'Ruta #'+r.id)}</b><br>${esc(r.placa)}<br>${r.cantidad_paradas||paradasRuta.length} paradas · ${r.distancia_total_estimada||'—'} km`);
      poly.rutaId = r.id;
      mapLayers.rutas.push(poly);

      // stop markers
      for (const p of paradasRuta) {
        const marker = L.circleMarker([p.latitud, p.longitud], {
          radius: 6, color, fillColor: '#fff', fillOpacity: 0.9, weight: 2
        }).addTo(mapInstance);
        marker.bindPopup(`<b>#${p.secuencia}</b> ${esc(p.cliente_nombre||'')}<br>${esc(p.numero_factura||'')}<br>${esc(p.direccion||'')}`);
        mapLayers.paradas.push(marker);
      }
      idx++;
    }

    if (data.rutas.length && !mapaFitted) {
      const bounds = mapLayers.rutas.length ? mapLayers.rutas : mapLayers.vehiculos;
      if (bounds.length) mapInstance.fitBounds(bounds, { padding: [40,40] });
      mapaFitted = true;
    }
  } catch {}
}

function filtrarMapaRuta() {
  const id = document.getElementById('mapa-filtro-ruta')?.value;
  mapLayers.rutas.forEach(poly => {
    if (!id) { poly.setStyle({ opacity: 0.8, weight: 3 }); }
    else { poly.setStyle({ opacity: poly.rutaId == id ? 1 : 0.15, weight: poly.rutaId == id ? 4 : 2 }); }
  });
  mapLayers.paradas.forEach(m => {
    if (!id) { m.setStyle({ opacity: 1 }); m.closeTooltip?.(); }
    else { m.setStyle({ opacity: m.rutaId == id ? 1 : 0.2 }); }
  });
}

/* ── Mapas Tab (Config) ── */
function renderMapas(el) {
  const key = localStorage.getItem('google_maps_key') || '';
  el.innerHTML = `
    <div class="card" style="max-width:600px;">
      <h4 style="margin-bottom:16px;font-family:var(--font-head);">🗺️ Google Maps API Key</h4>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">
        Necesitas una clave de API de Google Maps con la biblioteca "Places" habilitada.
        <br><a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:var(--accent)">Obtener API Key →</a>
      </p>
      <div class="form-group">
        <label>API Key</label>
        <input id="cfg-gmaps-key" value="${esc(key)}" placeholder="AIzaSy..." style="font-family:monospace;">
      </div>
      <div class="flex">
        <button class="btn btn-primary" onclick="guardarGmapsKey()">✓ Guardar</button>
        <button class="btn btn-secondary" onclick="probarGmapsKey()">🧪 Probar</button>
      </div>
      <div id="gmaps-msg" style="margin-top:10px;font-size:13px;"></div>
    </div>`;
}

function guardarGmapsKey() {
  const key = document.getElementById('cfg-gmaps-key').value.trim();
  const msg = document.getElementById('gmaps-msg');
  if (!key) { msg.innerHTML = '<span style="color:var(--danger)">✗ Ingresa una API key</span>'; return; }
  localStorage.setItem('google_maps_key', key);
  msg.innerHTML = '<span style="color:var(--success)">✓ Guardada en localStorage. Recarga la página para aplicar.</span>';
}

function probarGmapsKey() {
  const key = document.getElementById('cfg-gmaps-key').value.trim();
  const msg = document.getElementById('gmaps-msg');
  if (!key) { msg.innerHTML = '<span style="color:var(--danger)">✗ Ingresa una API key primero</span>'; return; }
  msg.innerHTML = '<span class="text-muted">Probando...</span>';
  fetch('https://maps.googleapis.com/maps/api/geocode/json?address=Medellin&key=' + key)
    .then(r => r.json())
    .then(d => {
      if (d.status === 'OK') msg.innerHTML = '<span style="color:var(--success)">✓ API key válida</span>';
      else if (d.status === 'REQUEST_DENIED') msg.innerHTML = '<span style="color:var(--danger)">✗ API key denegada — habilita Geocoding API y Places API</span>';
      else msg.innerHTML = '<span style="color:var(--danger)">✗ Error: ' + d.status + '</span>';
    })
    .catch(e => msg.innerHTML = '<span style="color:var(--danger)">✗ ' + e.message + '</span>');
}

init();


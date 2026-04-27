/* =============================================
   ADMIN.JS — Panel de administración completo
   ============================================= */

/* ── State ── */
const admin = {
  user:          null,
  categorias:    [],
  editProductoId: null,
  editCategoriaId: null,
  editPromocionId: null,
  pedidoRefresh:  null,
  newImageFile:   null,
  catImageFile:   null,
};


/* ══════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════ */

async function initAuth() {
  const { data: { session } } = await db.auth.getSession();

  if (session) {
    admin.user = session.user;
    showApp();
  } else {
    showLogin();
  }

  db.auth.onAuthStateChange((_event, session) => {
    if (session) { admin.user = session.user; showApp(); }
    else         { showLogin(); }
  });
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('adminApp').classList.add('hidden');
  bindLoginForm();
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
  document.getElementById('topbarUser').textContent = admin.user?.email || '';
  initStorage();
  bindApp();
  showSection('dashboard');
}

function bindLoginForm() {
  const form    = document.getElementById('loginForm');
  const pwInput = document.getElementById('loginPassword');
  const toggle  = document.getElementById('pwToggle');

  toggle.addEventListener('click', () => {
    const isText = pwInput.type === 'text';
    pwInput.type = isText ? 'password' : 'text';
    toggle.querySelector('ion-icon').setAttribute('name', isText ? 'eye-outline' : 'eye-off-outline');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn    = document.getElementById('loginBtn');
    const errEl  = document.getElementById('loginError');
    const email  = document.getElementById('loginEmail').value.trim();
    const pw     = document.getElementById('loginPassword').value;

    btn.disabled = true;
    btn.textContent = 'Ingresando...';
    errEl.classList.add('hidden');

    const { error } = await db.auth.signInWithPassword({ email, password: pw });

    if (error) {
      errEl.textContent = 'Email o contraseña incorrectos.';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = 'Ingresar <ion-icon name="arrow-forward-outline"></ion-icon>';
    }
  });
}


/* ══════════════════════════════════════════
   APP BINDING
   ══════════════════════════════════════════ */

function bindApp() {
  /* Sidebar nav */
  document.querySelectorAll('.sidebar-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      showSection(btn.dataset.section);
      document.getElementById('adminSidebar').classList.remove('open');
    });
  });

  /* Mobile sidebar toggle */
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('adminSidebar').classList.toggle('open');
  });

  /* Logout */
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await db.auth.signOut();
  });
}

function showSection(name) {
  /* Hide all sections */
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));

  /* Show target */
  document.getElementById(`section${cap(name)}`)?.classList.remove('hidden');
  document.querySelector(`.sidebar-item[data-section="${name}"]`)?.classList.add('active');
  document.getElementById('topbarTitle').textContent = {
    dashboard: 'Dashboard', pedidos: 'Pedidos', productos: 'Productos',
    categorias: 'Categorías', promociones: 'Promociones', config: 'Configuración'
  }[name] || '';

  /* Load section data */
  switch (name) {
    case 'dashboard':   loadDashboard();    break;
    case 'pedidos':     loadPedidos();      break;
    case 'productos':   loadProductos();    break;
    case 'categorias':  loadCategorias();   break;
    case 'promociones': loadPromociones();  break;
    case 'config':      loadConfig();       break;
  }
}


/* ══════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════ */

async function loadDashboard() {
  const [productosRes, pedidosRes, stockRes] = await Promise.all([
    db.from('productos').select('id', { count: 'exact' }).eq('activo', true),
    db.from('pedidos').select('id', { count: 'exact' }).eq('estado', 'pendiente').gt('expires_at', new Date().toISOString()),
    db.from('productos').select('id', { count: 'exact' }).eq('activo', true).lte('stock', 3).gt('stock', 0),
  ]);

  document.getElementById('statProductos').textContent  = productosRes.count ?? '—';
  document.getElementById('statPedidos').textContent    = pedidosRes.count   ?? '—';
  document.getElementById('statStockBajo').textContent  = stockRes.count     ?? '—';

  /* Update sidebar badge */
  const badge = document.getElementById('pedidosBadge');
  const count = pedidosRes.count || 0;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);

  /* Recent orders */
  const { data: pedidos } = await db
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  const el = document.getElementById('dashboardPedidos');
  if (!pedidos?.length) { el.innerHTML = '<p class="empty-msg">No hay pedidos aún.</p>'; return; }

  el.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Cliente</th><th>Total</th><th>Modalidad</th><th>Estado</th><th>Fecha</th>
        </tr></thead>
        <tbody>
          ${pedidos.map(p => `
            <tr>
              <td>${p.nombre_cliente}</td>
              <td>$${fmt(p.total)}</td>
              <td>${p.modalidad === 'envio' ? '🚚 Envío' : '🏪 Retiro'}</td>
              <td><span class="estado-badge estado-${p.estado}">${p.estado}</span></td>
              <td>${fmtDate(p.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}


/* ══════════════════════════════════════════
   PEDIDOS
   ══════════════════════════════════════════ */

async function loadPedidos() {
  const filter = document.getElementById('pedidosFilter').value;
  document.getElementById('pedidosFilter').onchange = loadPedidos;

  let query = db.from('pedidos').select('*').order('created_at', { ascending: false });
  if (filter !== 'all') query = query.eq('estado', filter);

  const { data: pedidos } = await query;
  const el = document.getElementById('pedidosList');

  if (!pedidos?.length) {
    el.innerHTML = '<p class="empty-msg">No hay pedidos con ese filtro.</p>';
    return;
  }

  el.innerHTML = pedidos.map(p => buildPedidoCard(p)).join('');

  /* Bind actions */
  el.querySelectorAll('[data-confirmar]').forEach(btn => {
    btn.addEventListener('click', () => confirmarPedido(btn.dataset.confirmar));
  });
  el.querySelectorAll('[data-rechazar]').forEach(btn => {
    btn.addEventListener('click', () => rechazarPedido(btn.dataset.rechazar));
  });

  /* Start countdowns */
  startCountdowns();
}

function buildPedidoCard(p) {
  const items = Array.isArray(p.productos_json) ? p.productos_json : [];
  const expired = new Date(p.expires_at) < new Date();
  const isPendiente = p.estado === 'pendiente';

  const itemsList = items.map(i =>
    `<span class="pedido-item-tag">${i.nombre} x${i.cantidad}</span>`
  ).join('');

  const actions = isPendiente && !expired ? `
    <button class="btn-success btn-sm" data-confirmar="${p.id}">
      <ion-icon name="checkmark-outline"></ion-icon> Confirmar
    </button>
    <button class="btn-danger btn-sm" data-rechazar="${p.id}">
      <ion-icon name="close-outline"></ion-icon> Rechazar
    </button>
  ` : '';

  const countdown = isPendiente && !expired
    ? `<span class="countdown" data-expires="${p.expires_at}">...</span>`
    : '';

  return `
    <div class="pedido-card estado-border-${p.estado}">
      <div class="pedido-card-header">
        <div>
          <p class="pedido-cliente">${p.nombre_cliente}</p>
          <p class="pedido-meta">
            ${p.modalidad === 'envio' ? `🚚 ${p.direccion || 'Sin dirección'}` : '🏪 Retiro en local'}
            ${p.telefono ? ` · 📱 ${p.telefono}` : ''}
          </p>
        </div>
        <div class="pedido-card-right">
          <p class="pedido-total">$${fmt(p.total)}</p>
          <span class="estado-badge estado-${p.estado}">${p.estado}</span>
          ${countdown}
        </div>
      </div>

      <div class="pedido-items">${itemsList}</div>

      ${p.notas ? `<p class="pedido-notas">📝 ${p.notas}</p>` : ''}

      ${actions ? `<div class="pedido-actions">${actions}</div>` : ''}
    </div>
  `;
}

function startCountdowns() {
  document.querySelectorAll('.countdown').forEach(el => {
    const expires = new Date(el.dataset.expires);
    const update = () => {
      const diff = expires - new Date();
      if (diff <= 0) { el.textContent = 'Expirado'; el.style.color = 'var(--text-dim)'; return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      el.textContent = `⏱ ${h}h ${m}m`;
    };
    update();
    setInterval(update, 60000);
  });
}

async function confirmarPedido(id) {
  const ok = await showConfirm('¿Confirmás este pedido? Se descontará el stock de los productos.', '✅');
  if (!ok) return;

  const { data: pedido } = await db.from('pedidos').select('productos_json').eq('id', id).single();
  if (!pedido) { toast('Error al obtener el pedido.', 'error'); return; }

  /* Descontar stock de cada producto */
  for (const item of pedido.productos_json) {
    const { data: prod } = await db.from('productos').select('stock').eq('id', item.id).single();
    if (!prod) continue;
    const newStock = Math.max(0, prod.stock - item.cantidad);
    await db.from('productos').update({ stock: newStock }).eq('id', item.id);
  }

  await db.from('pedidos').update({ estado: 'confirmado' }).eq('id', id);
  toast('Pedido confirmado y stock actualizado ✓', 'success');
  loadPedidos();
  loadDashboard();
}

async function rechazarPedido(id) {
  const ok = await showConfirm('¿Rechazás este pedido? El stock vuelve a estar disponible.', '❌');
  if (!ok) return;
  await db.from('pedidos').update({ estado: 'rechazado' }).eq('id', id);
  toast('Pedido rechazado.', 'info');
  loadPedidos();
  loadDashboard();
}


/* ══════════════════════════════════════════
   PRODUCTOS
   ══════════════════════════════════════════ */

async function loadProductos() {
  await loadCategoriasData();

  /* Populate category filter */
  const catFilter = document.getElementById('productosCatFilter');
  catFilter.innerHTML = `<option value="all">Todas las categorías</option>` +
    admin.categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

  catFilter.onchange   = renderProductosTable;
  document.getElementById('productosSearch').oninput = renderProductosTable;
  document.getElementById('newProductoBtn').onclick  = () => openProductoModal();

  await renderProductosTable();
}

async function renderProductosTable() {
  const search    = document.getElementById('productosSearch').value.toLowerCase();
  const catFilter = document.getElementById('productosCatFilter').value;

  let query = db.from('productos').select('*, categorias(nombre)').order('orden');
  if (catFilter !== 'all') query = query.eq('categoria_id', catFilter);

  const { data, error } = await query;
  const el = document.getElementById('productosTable');

  if (error) { el.innerHTML = '<p class="empty-msg">Error cargando productos.</p>'; return; }

  let products = data || [];
  if (search) products = products.filter(p => p.nombre.toLowerCase().includes(search));

  if (!products.length) {
    el.innerHTML = '<p class="empty-msg">No hay productos con ese filtro.</p>';
    return;
  }

  el.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Imagen</th><th>Nombre</th><th>Categoría</th>
          <th>Precio</th><th>Stock</th><th>Activo</th><th>Destacado</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${products.map(p => `
            <tr data-id="${p.id}">
              <td>
                <div class="table-img">
                  <img src="${p.imagen_url || 'assets/placeholder.jpg'}" alt="${esc(p.nombre)}" loading="lazy" />
                </div>
              </td>
              <td class="td-name">${p.nombre}</td>
              <td>${p.categorias?.nombre || '—'}</td>
              <td>
                $${fmt(p.precio)}
                ${p.precio_oferta ? `<br><small style="color:var(--accent-amber)">Oferta: $${fmt(p.precio_oferta)}</small>` : ''}
              </td>
              <td class="${p.stock <= 3 && p.stock > 0 ? 'td-warn' : ''} ${p.stock === 0 ? 'td-danger' : ''}">
                ${p.stock}
                ${p.stock <= 3 && p.stock > 0 ? ' ⚠️' : ''}
              </td>
              <td>
                <label class="toggle-switch">
                  <input type="checkbox" ${p.activo ? 'checked' : ''} onchange="toggleActivo('${p.id}', this.checked)" />
                  <span class="toggle-slider"></span>
                </label>
              </td>
              <td>
                <label class="toggle-switch">
                  <input type="checkbox" ${p.destacado ? 'checked' : ''} onchange="toggleDestacado('${p.id}', this.checked)" />
                  <span class="toggle-slider"></span>
                </label>
              </td>
              <td class="td-actions">
                <button class="icon-btn" onclick="openProductoModal('${p.id}')" title="Editar">
                  <ion-icon name="create-outline"></ion-icon>
                </button>
                <button class="icon-btn icon-btn--danger" onclick="deleteProducto('${p.id}', '${esc(p.nombre)}')" title="Eliminar">
                  <ion-icon name="trash-outline"></ion-icon>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function openProductoModal(id = null) {
  admin.editProductoId = id;
  admin.newImageFile   = null;
  await loadCategoriasData();

  /* Populate category select */
  const catSel = document.getElementById('pCategoria');
  catSel.innerHTML = `<option value="">Sin categoría</option>` +
    admin.categorias.map(c => `<option value="${c.id}">${c.icono} ${c.nombre}</option>`).join('');

  /* Reset form */
  ['pNombre','pDescCorta','pDescLarga','pPrecio','pPrecioOferta','pStock','pOrden'].forEach(f => {
    document.getElementById(f).value = '';
  });
  document.getElementById('pActivo').checked    = true;
  document.getElementById('pDestacado').checked = false;
  resetImageUpload();

  if (id) {
    /* Load existing product */
    document.getElementById('productoModalTitle').textContent = 'Editar producto';
    const { data: p } = await db.from('productos').select('*').eq('id', id).single();
    if (!p) return;

    document.getElementById('pNombre').value     = p.nombre           || '';
    document.getElementById('pDescCorta').value  = p.descripcion_corta || '';
    document.getElementById('pDescLarga').value  = p.descripcion_larga || '';
    document.getElementById('pPrecio').value     = p.precio            || '';
    document.getElementById('pPrecioOferta').value = p.precio_oferta   || '';
    document.getElementById('pCategoria').value  = p.categoria_id      || '';
    document.getElementById('pStock').value      = p.stock             ?? '';
    document.getElementById('pOrden').value      = p.orden             ?? '';
    document.getElementById('pActivo').checked   = p.activo;
    document.getElementById('pDestacado').checked = p.destacado;

    if (p.imagen_url) {
      showImagePreview(p.imagen_url);
    }
  } else {
    document.getElementById('productoModalTitle').textContent = 'Nuevo producto';
  }

  /* Bind image upload */
  bindImageUpload();

  /* Bind save/cancel */
  document.getElementById('productoModalSave').onclick   = saveProducto;
  document.getElementById('productoModalCancel').onclick = closeProductoModal;
  document.getElementById('productoModalClose').onclick  = closeProductoModal;

  document.getElementById('productoModal').classList.remove('hidden');
}

function closeProductoModal() {
  document.getElementById('productoModal').classList.add('hidden');
  admin.editProductoId = null;
  admin.newImageFile   = null;
}

async function saveProducto() {
  const nombre  = document.getElementById('pNombre').value.trim();
  const precio  = parseFloat(document.getElementById('pPrecio').value);

  if (!nombre)        { toast('El nombre es obligatorio.', 'error'); return; }
  if (isNaN(precio))  { toast('El precio es obligatorio.', 'error'); return; }

  const btn = document.getElementById('productoModalSave');
  btn.disabled = true;
  btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Guardando...';

  try {
    /* Upload image if new file selected */
    let imagen_url = null;
    if (admin.newImageFile) {
      imagen_url = await uploadImagen(admin.newImageFile, admin.editProductoId || 'new_' + Date.now());
    } else if (admin.editProductoId) {
      const { data: existing } = await db.from('productos').select('imagen_url').eq('id', admin.editProductoId).single();
      imagen_url = existing?.imagen_url || null;
    }

    const payload = {
      nombre,
      descripcion_corta: document.getElementById('pDescCorta').value.trim() || null,
      descripcion_larga: document.getElementById('pDescLarga').value.trim() || null,
      precio,
      precio_oferta:  parseFloat(document.getElementById('pPrecioOferta').value) || null,
      categoria_id:   document.getElementById('pCategoria').value || null,
      stock:          parseInt(document.getElementById('pStock').value)  || 0,
      orden:          parseInt(document.getElementById('pOrden').value)  || 0,
      activo:         document.getElementById('pActivo').checked,
      destacado:      document.getElementById('pDestacado').checked,
      ...(imagen_url && { imagen_url }),
    };

    if (admin.editProductoId) {
      const { error } = await db.from('productos').update(payload).eq('id', admin.editProductoId);
      if (error) throw error;
      toast('Producto actualizado ✓', 'success');
    } else {
      const { error } = await db.from('productos').insert(payload);
      if (error) throw error;
      toast('Producto creado ✓', 'success');
    }

    closeProductoModal();
    renderProductosTable();

  } catch (err) {
    console.error(err);
    toast('Error al guardar el producto.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<ion-icon name="save-outline"></ion-icon> Guardar producto';
  }
}

async function deleteProducto(id, nombre) {
  const ok = await showConfirm(`¿Eliminás "${nombre}"? Esta acción no se puede deshacer.`, '🗑️');
  if (!ok) return;
  const { error } = await db.from('productos').delete().eq('id', id);
  if (error) { toast('Error al eliminar.', 'error'); return; }
  toast('Producto eliminado.', 'info');
  renderProductosTable();
}

async function toggleActivo(id, value) {
  await db.from('productos').update({ activo: value }).eq('id', id);
  toast(value ? 'Producto activado ✓' : 'Producto ocultado.', 'info');
  loadDashboard();
}

async function toggleDestacado(id, value) {
  await db.from('productos').update({ destacado: value }).eq('id', id);
  toast(value ? 'Marcado como destacado ✓' : 'Quitado de destacados.', 'info');
}


/* ── Image upload ── */
function bindImageUpload() {
  const area       = document.getElementById('imageUploadArea');
  const input      = document.getElementById('imageInput');
  const changeBtn  = document.getElementById('imageChangeBtn');

  area.addEventListener('click', () => input.click());
  changeBtn.addEventListener('click', (e) => { e.stopPropagation(); input.click(); });

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('La imagen no puede superar 5MB.', 'error'); return; }
    admin.newImageFile = file;
    const url = URL.createObjectURL(file);
    showImagePreview(url);
  });

  /* Drag and drop */
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      admin.newImageFile = file;
      showImagePreview(URL.createObjectURL(file));
    }
  });
}

function showImagePreview(url) {
  document.getElementById('imagePreview').src = url;
  document.getElementById('imagePreview').classList.remove('hidden');
  document.getElementById('imageUploadPlaceholder').classList.add('hidden');
  document.getElementById('imageChangeBtn').classList.remove('hidden');
}

function resetImageUpload() {
  document.getElementById('imagePreview').src = '';
  document.getElementById('imagePreview').classList.add('hidden');
  document.getElementById('imageUploadPlaceholder').classList.remove('hidden');
  document.getElementById('imageChangeBtn').classList.add('hidden');
  document.getElementById('imageInput').value = '';
}

/* ── Category image upload ── */
function bindCatImageUpload() {
  const area      = document.getElementById('catImageUploadArea');
  const input     = document.getElementById('catImageInput');
  const changeBtn = document.getElementById('catImageChangeBtn');

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('La imagen no puede superar 5MB.', 'error'); return; }
    admin.catImageFile = file;
    showCatImagePreview(URL.createObjectURL(file));
  };

  area.onclick = () => input.click();
  changeBtn.onclick = (e) => { e.stopPropagation(); input.click(); };
  input.onchange = (e) => handleFile(e.target.files[0]);

  area.addEventListener('dragover',  (e) => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', ()  => area.classList.remove('drag-over'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) handleFile(file);
  });
}

function showCatImagePreview(url) {
  document.getElementById('catImagePreview').src = url;
  document.getElementById('catImagePreview').classList.remove('hidden');
  document.getElementById('catImageUploadPlaceholder').classList.add('hidden');
  document.getElementById('catImageChangeBtn').classList.remove('hidden');
}

function resetCatImageUpload() {
  document.getElementById('catImagePreview').src = '';
  document.getElementById('catImagePreview').classList.add('hidden');
  document.getElementById('catImageUploadPlaceholder').classList.remove('hidden');
  document.getElementById('catImageChangeBtn').classList.add('hidden');
  document.getElementById('catImageInput').value = '';
}

/* ── Asegura que el bucket exista al iniciar la sesión admin ── */
async function initStorage() {
  try {
    const { error } = await db.storage.getBucket('productos');
    if (error) {
      const { error: createErr } = await db.storage.createBucket('productos', {
        public: true,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      });
      if (!createErr) console.log('[Storage] Bucket "productos" creado automáticamente.');
      else console.warn('[Storage] No se pudo crear el bucket automáticamente. Ejecutá el SQL de setup en Supabase.');
    }
  } catch (e) {
    console.warn('[Storage] initStorage:', e.message);
  }
}

async function uploadImagen(file, name) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${name}.${ext}`;

  let { error } = await db.storage
    .from('productos')
    .upload(path, file, { upsert: true, contentType: file.type });

  /* Si el bucket no existe, intentamos crearlo y reintentamos */
  if (error && (error.statusCode === 404 || error.error === 'Bucket not found' || error.message?.includes('not found'))) {
    await db.storage.createBucket('productos', {
      public: true, fileSizeLimit: 5242880,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
    const retry = await db.storage
      .from('productos')
      .upload(path, file, { upsert: true, contentType: file.type });
    error = retry.error;
  }

  if (error) {
    const msg = error.message || error.error || JSON.stringify(error);
    if (msg.includes('Bucket') || msg.includes('not found') || error.statusCode === 404) {
      throw new Error('Bucket de imágenes no encontrado. Ejecutá el script de Storage en Supabase SQL Editor.');
    }
    if (error.statusCode === 403 || msg.includes('policy') || msg.includes('permission')) {
      throw new Error('Sin permisos para subir imágenes. Ejecutá las políticas de Storage del SQL de setup.');
    }
    throw new Error(`Error al subir imagen: ${msg}`);
  }

  const { data: { publicUrl } } = db.storage.from('productos').getPublicUrl(path);
  return publicUrl;
}


/* ══════════════════════════════════════════
   CATEGORÍAS
   ══════════════════════════════════════════ */

async function loadCategoriasData() {
  const { data } = await db.from('categorias').select('*').order('orden');
  admin.categorias = data || [];
}

async function loadCategorias() {
  await loadCategoriasData();
  const el = document.getElementById('categoriasTable');

  document.getElementById('newCategoriaBtn').onclick = () => openCategoriaModal();

  if (!admin.categorias.length) {
    el.innerHTML = '<p class="empty-msg">No hay categorías aún.</p>';
    return;
  }

  el.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Imagen</th><th>Nombre</th><th>Slug</th><th>Orden</th><th>Activo</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${admin.categorias.map(c => `
            <tr>
              <td>
                ${c.imagen_url
                  ? `<div class="table-img"><img src="${c.imagen_url}" alt="${esc(c.nombre)}" loading="lazy" /></div>`
                  : `<span style="font-size:1.5rem">${c.icono || '🌿'}</span>`}
              </td>
              <td class="td-name">${c.nombre}</td>
              <td><code>${c.slug}</code></td>
              <td>${c.orden}</td>
              <td>
                <label class="toggle-switch">
                  <input type="checkbox" ${c.activo ? 'checked' : ''} onchange="toggleCategoriaActivo('${c.id}', this.checked)" />
                  <span class="toggle-slider"></span>
                </label>
              </td>
              <td class="td-actions">
                <button class="icon-btn" onclick="openCategoriaModal('${c.id}')" title="Editar">
                  <ion-icon name="create-outline"></ion-icon>
                </button>
                <button class="icon-btn icon-btn--danger" onclick="deleteCategoria('${c.id}', '${esc(c.nombre)}')" title="Eliminar">
                  <ion-icon name="trash-outline"></ion-icon>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openCategoriaModal(id = null) {
  admin.editCategoriaId = id;
  admin.catImageFile    = null;
  ['cNombre','cSlug','cOrden'].forEach(f => document.getElementById(f).value = '');
  resetCatImageUpload();

  document.getElementById('categoriaModalTitle').textContent = id ? 'Editar categoría' : 'Nueva categoría';

  if (id) {
    const cat = admin.categorias.find(c => c.id === id);
    if (!cat) return;
    document.getElementById('cNombre').value = cat.nombre;
    document.getElementById('cSlug').value   = cat.slug;
    document.getElementById('cOrden').value  = cat.orden;
    if (cat.imagen_url) showCatImagePreview(cat.imagen_url);
  }

  /* Auto-generate slug from name */
  document.getElementById('cNombre').oninput = (e) => {
    if (!id) {
      document.getElementById('cSlug').value = slugify(e.target.value);
    }
  };

  bindCatImageUpload();
  document.getElementById('categoriaModalSave').onclick   = saveCategoria;
  document.getElementById('categoriaModalCancel').onclick = closeCategoriaModal;
  document.getElementById('categoriaModalClose').onclick  = closeCategoriaModal;
  document.getElementById('categoriaModal').classList.remove('hidden');
}

function closeCategoriaModal() {
  document.getElementById('categoriaModal').classList.add('hidden');
  admin.editCategoriaId = null;
  admin.catImageFile    = null;
}

async function saveCategoria() {
  const nombre = document.getElementById('cNombre').value.trim();
  const slug   = document.getElementById('cSlug').value.trim();
  const orden  = parseInt(document.getElementById('cOrden').value) || 0;

  if (!nombre || !slug) { toast('Nombre y slug son obligatorios.', 'error'); return; }

  const btn = document.getElementById('categoriaModalSave');
  btn.disabled = true;
  btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Guardando...';

  try {
    /* 1. Subir imagen si hay archivo seleccionado */
    let imagen_url = null;
    if (admin.catImageFile) {
      imagen_url = await uploadImagen(
        admin.catImageFile,
        'cat_' + (admin.editCategoriaId || 'new_' + Date.now())
      );
    } else if (admin.editCategoriaId) {
      const existing = admin.categorias.find(c => c.id === admin.editCategoriaId);
      imagen_url = existing?.imagen_url || null;
    }

    const icono = admin.editCategoriaId
      ? (admin.categorias.find(c => c.id === admin.editCategoriaId)?.icono || '🌿')
      : '🌿';

    const payload = {
      nombre, slug, orden, icono,
      ...(imagen_url !== null && { imagen_url }),
    };

    /* 2. Guardar en BD */
    let { error } = admin.editCategoriaId
      ? await db.from('categorias').update(payload).eq('id', admin.editCategoriaId)
      : await db.from('categorias').insert({ ...payload, activo: true });

    /* 3. Si falla por columna imagen_url inexistente, reintentar sin ella */
    if (error && (error.message?.includes('imagen_url') || error.code === '42703')) {
      console.warn('[DB] Columna imagen_url ausente, guardando sin imagen.');
      const { imagen_url: _omit, ...payloadBase } = payload;
      const retry = admin.editCategoriaId
        ? await db.from('categorias').update(payloadBase).eq('id', admin.editCategoriaId)
        : await db.from('categorias').insert({ ...payloadBase, activo: true });
      error = retry.error;
      if (!error) {
        toast('Categoría guardada sin imagen. Para habilitar imágenes ejecutá el SQL de setup en Supabase.', 'info');
        closeCategoriaModal();
        loadCategorias();
        return;
      }
    }

    if (error) {
      if (error.code === '23505') toast('El slug ya existe.', 'error');
      else { toast(`Error: ${error.message}`, 'error'); console.error(error); }
      return;
    }

    toast(admin.editCategoriaId ? 'Categoría actualizada ✓' : 'Categoría creada ✓', 'success');
    closeCategoriaModal();
    loadCategorias();

  } catch (err) {
    console.error(err);
    toast(err.message || 'Error al guardar la categoría.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<ion-icon name="save-outline"></ion-icon> Guardar';
  }
}

async function deleteCategoria(id, nombre) {
  const ok = await showConfirm(`¿Eliminás la categoría "${nombre}"?`, '🗑️');
  if (!ok) return;
  const { error } = await db.from('categorias').delete().eq('id', id);
  if (error) { toast('No se puede eliminar: tiene productos asociados.', 'error'); return; }
  toast('Categoría eliminada.', 'info');
  loadCategorias();
}

async function toggleCategoriaActivo(id, value) {
  await db.from('categorias').update({ activo: value }).eq('id', id);
}


/* ══════════════════════════════════════════
   PROMOCIONES
   ══════════════════════════════════════════ */

async function loadPromociones() {
  document.getElementById('newPromocionBtn').onclick = () => openPromocionModal();
  
  const { data: promos, error } = await db.from('promociones').select('*, productos(nombre), categorias(nombre)').order('fecha_inicio', { ascending: false });
  const el = document.getElementById('promocionesTable');

  if (error) { el.innerHTML = '<p class="empty-msg">Error cargando promociones.</p>'; return; }
  if (!promos?.length) { el.innerHTML = '<p class="empty-msg">No hay promociones configuradas.</p>'; return; }

  el.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Título</th><th>Tipo / Valor</th><th>Aplica a</th><th>Inicio / Fin</th><th>Activa</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          ${promos.map(p => {
            const aplicaA = p.productos?.nombre ? `Prod: ${p.productos.nombre}` : 
                            (p.categorias?.nombre ? `Cat: ${p.categorias.nombre}` : 'Todo el catálogo');
            const valorFmt = p.tipo === 'porcentaje' ? `${p.valor}%` : 
                             (p.tipo === 'monto_fijo' ? `$${fmt(p.valor)}` : 'N/A');
            const inicio = p.fecha_inicio ? fmtDate(p.fecha_inicio) : 'Inmediato';
            const fin = p.fecha_fin ? fmtDate(p.fecha_fin) : 'Sin límite';
            
            return `
            <tr>
              <td class="td-name">
                ${esc(p.titulo)}
                ${p.descripcion ? `<br><small style="color:var(--text-dim)">${esc(p.descripcion)}</small>` : ''}
              </td>
              <td>${p.tipo.toUpperCase()} <br><span style="color:var(--accent-gold)">${valorFmt}</span></td>
              <td>${aplicaA}</td>
              <td style="font-size:0.75rem">${inicio}<br>${fin}</td>
              <td>
                <label class="toggle-switch">
                  <input type="checkbox" ${p.activo ? 'checked' : ''} onchange="togglePromocionActivo('${p.id}', this.checked)" />
                  <span class="toggle-slider"></span>
                </label>
              </td>
              <td class="td-actions">
                <button class="icon-btn" onclick="openPromocionModal('${p.id}')" title="Editar">
                  <ion-icon name="create-outline"></ion-icon>
                </button>
                <button class="icon-btn icon-btn--danger" onclick="deletePromocion('${p.id}', '${esc(p.titulo)}')" title="Eliminar">
                  <ion-icon name="trash-outline"></ion-icon>
                </button>
              </td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function openPromocionModal(id = null) {
  admin.editPromocionId = id;
  
  // Load products & categories for selects
  await loadCategoriasData();
  const { data: prods } = await db.from('productos').select('id, nombre').order('nombre');
  
  const pSelect = document.getElementById('prProducto');
  pSelect.innerHTML = '<option value="">Todo el catálogo</option>' + 
    (prods || []).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
  const cSelect = document.getElementById('prCategoria');
  cSelect.innerHTML = '<option value="">Todas las categorías</option>' + 
    admin.categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

  // Reset form
  ['prTitulo','prDesc','prValor','prInicio','prFin'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('prTipo').value = 'porcentaje';
  pSelect.value = '';
  cSelect.value = '';
  document.getElementById('prActivo').checked = true;

  document.getElementById('promocionModalTitle').textContent = id ? 'Editar promoción' : 'Nueva promoción';

  if (id) {
    const { data: p } = await db.from('promociones').select('*').eq('id', id).single();
    if (p) {
      document.getElementById('prTitulo').value = p.titulo;
      document.getElementById('prDesc').value = p.descripcion || '';
      document.getElementById('prTipo').value = p.tipo;
      document.getElementById('prValor').value = p.valor || '';
      document.getElementById('prProducto').value = p.producto_id || '';
      document.getElementById('prCategoria').value = p.categoria_id || '';
      
      // Convert dates to local datetime-local format (YYYY-MM-DDThh:mm)
      if (p.fecha_inicio) {
        const d = new Date(p.fecha_inicio);
        document.getElementById('prInicio').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
      if (p.fecha_fin) {
        const d = new Date(p.fecha_fin);
        document.getElementById('prFin').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
      document.getElementById('prActivo').checked = p.activo;
    }
  }

  document.getElementById('promocionModalSave').onclick   = savePromocion;
  document.getElementById('promocionModalCancel').onclick = closePromocionModal;
  document.getElementById('promocionModalClose').onclick  = closePromocionModal;
  document.getElementById('promocionModal').classList.remove('hidden');
}

function closePromocionModal() {
  document.getElementById('promocionModal').classList.add('hidden');
  admin.editPromocionId = null;
}

async function savePromocion() {
  const titulo = document.getElementById('prTitulo').value.trim();
  const tipo = document.getElementById('prTipo').value;
  const valor = parseFloat(document.getElementById('prValor').value);
  const producto_id = document.getElementById('prProducto').value || null;
  const categoria_id = document.getElementById('prCategoria').value || null;
  
  // Format dates to ISO UTC
  const iVal = document.getElementById('prInicio').value;
  const fVal = document.getElementById('prFin').value;
  const fecha_inicio = iVal ? new Date(iVal).toISOString() : null;
  const fecha_fin = fVal ? new Date(fVal).toISOString() : null;

  if (!titulo) { toast('El título es obligatorio.', 'error'); return; }
  if (tipo !== '2x1' && isNaN(valor)) { toast('El valor es obligatorio para este tipo de promo.', 'error'); return; }

  const payload = {
    titulo,
    descripcion: document.getElementById('prDesc').value.trim() || null,
    tipo,
    valor: tipo === '2x1' ? null : valor,
    producto_id,
    categoria_id,
    fecha_inicio,
    fecha_fin,
    activo: document.getElementById('prActivo').checked
  };

  const btn = document.getElementById('promocionModalSave');
  btn.disabled = true;
  btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Guardando...';

  const { error } = admin.editPromocionId
    ? await db.from('promociones').update(payload).eq('id', admin.editPromocionId)
    : await db.from('promociones').insert(payload);

  btn.disabled = false;
  btn.innerHTML = '<ion-icon name="save-outline"></ion-icon> Guardar';

  if (error) { toast('Error al guardar.', 'error'); console.error(error); return; }

  toast(admin.editPromocionId ? 'Promoción actualizada ✓' : 'Promoción creada ✓', 'success');
  closePromocionModal();
  loadPromociones();
}

async function deletePromocion(id, titulo) {
  const ok = await showConfirm(`¿Eliminás la promoción "${titulo}"?`, '🗑️');
  if (!ok) return;
  const { error } = await db.from('promociones').delete().eq('id', id);
  if (error) { toast('Error al eliminar.', 'error'); return; }
  toast('Promoción eliminada.', 'info');
  loadPromociones();
}

async function togglePromocionActivo(id, value) {
  await db.from('promociones').update({ activo: value }).eq('id', id);
  toast(value ? 'Promoción activada ✓' : 'Promoción desactivada.', 'info');
}


/* ══════════════════════════════════════════
   CONFIGURACIÓN
   ══════════════════════════════════════════ */

async function loadConfig() {
  const { data } = await db.from('config').select('key, value');
  if (!data) return;
  const cfg = Object.fromEntries(data.map(r => [r.key, r.value]));

  document.getElementById('cfgWhatsapp').value      = cfg.whatsapp_numero    || '';
  document.getElementById('cfgInstagram').value     = cfg.instagram_usuario  || '';
  document.getElementById('cfgMensaje').value       = cfg.mensaje_pedido_intro || '';
  document.getElementById('cfgEnvioGratis').value   = cfg.envio_gratis_desde || '';
  document.getElementById('cfgDireccionLocal').value = cfg.direccion_local   || '';
  document.getElementById('cfgHorario').value       = cfg.horario_local      || '';
  document.getElementById('cfgBannerActivo').checked = cfg.banner_activo === 'true';
  document.getElementById('cfgBannerTexto').value   = cfg.banner_texto       || '';
  document.getElementById('cfgHorasReserva').value  = cfg.tiempo_reserva_horas || '24';

  document.getElementById('saveConfigBtn').onclick = saveConfig;
}

async function saveConfig() {
  const updates = [
    { key: 'whatsapp_numero',      value: document.getElementById('cfgWhatsapp').value.trim() },
    { key: 'instagram_usuario',    value: document.getElementById('cfgInstagram').value.trim() },
    { key: 'mensaje_pedido_intro', value: document.getElementById('cfgMensaje').value.trim() },
    { key: 'envio_gratis_desde',   value: document.getElementById('cfgEnvioGratis').value.trim() },
    { key: 'direccion_local',      value: document.getElementById('cfgDireccionLocal').value.trim() },
    { key: 'horario_local',        value: document.getElementById('cfgHorario').value.trim() },
    { key: 'banner_activo',        value: document.getElementById('cfgBannerActivo').checked ? 'true' : 'false' },
    { key: 'banner_texto',         value: document.getElementById('cfgBannerTexto').value.trim() },
    { key: 'tiempo_reserva_horas', value: document.getElementById('cfgHorasReserva').value.trim() },
  ];

  const btn = document.getElementById('saveConfigBtn');
  btn.disabled = true;
  btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Guardando...';

  const { error } = await db.from('config').upsert(updates, { onConflict: 'key' });

  btn.disabled = false;
  btn.innerHTML = '<ion-icon name="save-outline"></ion-icon> Guardar configuración';

  if (error) { toast('Error al guardar la configuración.', 'error'); return; }
  toast('Configuración guardada ✓', 'success');
}


/* ══════════════════════════════════════════
   CONFIRM DIALOG
   ══════════════════════════════════════════ */

function showConfirm(msg, icon = '⚠️') {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmMsg').textContent  = msg;
    document.getElementById('confirmIcon').textContent = icon;
    modal.classList.remove('hidden');

    const ok     = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');

    const cleanup = (result) => {
      modal.classList.add('hidden');
      ok.onclick     = null;
      cancel.onclick = null;
      resolve(result);
    };

    ok.onclick     = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
  });
}


/* ══════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════ */

function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <ion-icon name="${type === 'success' ? 'checkmark-circle-outline' : type === 'error' ? 'alert-circle-outline' : 'information-circle-outline'}"></ion-icon>
    ${msg}
  `;
  container.appendChild(el);

  requestAnimationFrame(() => el.classList.add('toast-visible'));
  setTimeout(() => {
    el.classList.remove('toast-visible');
    setTimeout(() => el.remove(), 400);
  }, 3500);
}


/* ══════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════ */

function fmt(n)   { return Number(n).toLocaleString('es-AR'); }
function esc(s)   { return String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }
function cap(s)   { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtDate(s) {
  return new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function slugify(str) {
  return str.toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}


/* ── Boot ── */
initAuth();

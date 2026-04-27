/* =============================================
   CATALOGO.JS — Catálogo con filtros, búsqueda y modal de detalle
   ============================================= */

/* ── State ── */
const state = {
  products:   [],      // todos los productos cargados
  categories: [],
  activeSlug: 'all',   // categoría activa
  search:     '',
  sort:       'orden',
  modalProduct: null,
  modalQty:   1
};


/* ── Init ── */
async function init() {
  Cart.updateBadges();
  readURLParams();
  await Promise.all([loadConfig(), loadCategories(), loadProducts()]);
  bindEvents();
  checkURLProduct();
}


/* ── Read URL params on load ── */
function readURLParams() {
  const params = new URLSearchParams(location.search);
  if (params.get('categoria')) state.activeSlug = params.get('categoria');
  if (params.get('buscar'))    state.search      = params.get('buscar');
}

/* ── Open modal if ?producto=id in URL ── */
function checkURLProduct() {
  const params = new URLSearchParams(location.search);
  const id = params.get('producto');
  if (id) {
    const producto = state.products.find(p => p.id === id);
    if (producto) openModal(producto);
  }
}


/* ── Load config ── */
async function loadConfig() {
  const { data } = await db.from('config').select('key, value');
  if (!data) return;
  const config = Object.fromEntries(data.map(r => [r.key, r.value]));

  const banner    = document.getElementById('promoBanner');
  const navHeader = document.getElementById('navHeader');

  if (banner && config.banner_activo === 'true' && config.banner_texto) {
    banner.textContent = config.banner_texto;
    banner.classList.add('active');
    navHeader?.classList.add('has-promo');
  }
}


/* ── Load categories → render filter chips ── */
async function loadCategories() {
  const { data } = await db
    .from('categorias')
    .select('id, nombre, icono, slug')
    .eq('activo', true)
    .order('orden');

  if (!data?.length) return;
  state.categories = data;

  const chips = document.getElementById('filterChips');
  const extraChips = data.map(cat => `
    <button class="filter-chip ${state.activeSlug === cat.slug ? 'active' : ''}"
            data-slug="${cat.slug}">
      ${cat.icono} ${cat.nombre}
    </button>
  `).join('');

  chips.innerHTML = `
    <button class="filter-chip ${state.activeSlug === 'all' ? 'active' : ''}" data-slug="all">
      Todos
    </button>
    ${extraChips}
  `;

  chips.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeSlug = btn.dataset.slug;
      chips.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFiltered();
      updateURL();
    });
  });
}


/* ── Load all active products ── */
async function loadProducts() {
  const { data, error } = await db
    .from('productos')
    .select('*, categorias(nombre, slug)')
    .eq('activo', true)
    .gt('stock', 0)
    .order('orden');

  if (error) {
    renderEmpty('Ocurrió un error al cargar los productos.');
    return;
  }

  state.products = data || [];
  renderFiltered();
}


/* ── Apply active filters and sort, then render ── */
function renderFiltered() {
  let filtered = [...state.products];

  // Category filter
  if (state.activeSlug !== 'all') {
    filtered = filtered.filter(p => p.categorias?.slug === state.activeSlug);
  }

  // Search filter (nombre + descripcion_corta)
  if (state.search.trim()) {
    const q = state.search.toLowerCase();
    filtered = filtered.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.descripcion_corta || '').toLowerCase().includes(q)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    switch (state.sort) {
      case 'precio_asc':  return (a.precio_oferta ?? a.precio) - (b.precio_oferta ?? b.precio);
      case 'precio_desc': return (b.precio_oferta ?? b.precio) - (a.precio_oferta ?? a.precio);
      case 'reciente':    return new Date(b.created_at) - new Date(a.created_at);
      case 'nombre':      return a.nombre.localeCompare(b.nombre, 'es');
      default:            return (a.orden ?? 0) - (b.orden ?? 0);
    }
  });

  renderGrid(filtered);
}


/* ── Render products grid ── */
function renderGrid(products) {
  const grid  = document.getElementById('productsGrid');
  const count = document.getElementById('catalogCount');

  if (!products.length) {
    renderEmpty();
    count.textContent = '';
    return;
  }

  count.textContent = `${products.length} producto${products.length !== 1 ? 's' : ''}`;
  grid.innerHTML = products.map(buildCard).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.product-add-btn, .product-share-btn')) return;
      const p = state.products.find(x => x.id === id);
      if (p) openModal(p);
    });
  });
}


/* ── Build product card HTML ── */
function buildCard(p) {
  const precio   = p.precio_oferta ?? p.precio;
  const hasOffer = p.precio_oferta != null && p.precio_oferta < p.precio;
  const lastUnits = p.stock > 0 && p.stock <= 3;

  const badge = hasOffer
    ? `<span class="product-badge badge-offer">Oferta</span>`
    : lastUnits
      ? `<span class="product-badge badge-last-units">¡Últimas unidades!</span>`
      : '';

  const priceHTML = hasOffer
    ? `<span class="product-price">$${fmt(precio)}</span>
       <span class="product-price-old">$${fmt(p.precio)}</span>`
    : `<span class="product-price">$${fmt(precio)}</span>`;

  return `
    <div class="product-card" data-id="${p.id}">
      <div class="product-img-wrap">
        <img src="${p.imagen_url || 'assets/placeholder.jpg'}" alt="${esc(p.nombre)}" loading="lazy" />
        ${badge}
        <button class="product-share-btn" onclick="shareProduct(event,'${p.id}','${esc(p.nombre)}')">
          <ion-icon name="share-social-outline"></ion-icon>
        </button>
      </div>
      <div class="product-info">
        <p class="product-category">${p.categorias?.nombre || ''}</p>
        <h3 class="product-name">${p.nombre}</h3>
        <div class="product-price-row">${priceHTML}</div>
        <button class="product-add-btn" onclick="quickAdd(event,'${p.id}')">
          <ion-icon name="add-outline"></ion-icon>
          Agregar al carrito
        </button>
      </div>
    </div>
  `;
}


/* ── Empty state ── */
function renderEmpty(msg = '') {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-icon">🌿</p>
      <p class="empty-state-title">
        ${msg || 'No encontramos productos con ese criterio'}
      </p>
      <p class="empty-state-desc">
        ${msg ? '' : 'Probá con otra categoría o cambiá los términos de búsqueda'}
      </p>
    </div>
  `;
}


/* ── Quick add to cart from card (without opening modal) ── */
function quickAdd(e, id) {
  e.stopPropagation();
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  Cart.add(p);

  const btn = e.currentTarget;
  btn.classList.add('added');
  btn.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon> Agregado';
  setTimeout(() => {
    btn.classList.remove('added');
    btn.innerHTML = '<ion-icon name="add-outline"></ion-icon> Agregar al carrito';
  }, 1800);
}


/* ── Share product ── */
async function shareProduct(e, id, nombre) {
  e.stopPropagation();
  const url = `${location.origin}${location.pathname}?producto=${id}`;
  if (navigator.share) {
    await navigator.share({ title: `Áurea Elizabeth — ${nombre}`, url }).catch(() => {});
  } else {
    await navigator.clipboard.writeText(url).catch(() => {});
  }
}


/* ══════════════════════════════════════════
   PRODUCT DETAIL MODAL
   ══════════════════════════════════════════ */

function openModal(producto) {
  state.modalProduct = producto;
  state.modalQty = 1;

  const hasOffer  = producto.precio_oferta != null && producto.precio_oferta < producto.precio;
  const precio    = producto.precio_oferta ?? producto.precio;
  const lastUnits = producto.stock > 0 && producto.stock <= 3;

  /* Populate fields */
  document.getElementById('modalImg').src        = producto.imagen_url || 'assets/placeholder.jpg';
  document.getElementById('modalImg').alt        = producto.nombre;
  document.getElementById('modalCategory').textContent = producto.categorias?.nombre || '';
  document.getElementById('modalName').textContent     = producto.nombre;
  document.getElementById('modalDesc').textContent     = producto.descripcion_larga || producto.descripcion_corta || '';
  document.getElementById('modalPrice').textContent    = `$${fmt(precio)}`;
  document.getElementById('qtyValue').textContent = '1';

  const priceOldEl = document.getElementById('modalPriceOld');
  priceOldEl.textContent = hasOffer ? `$${fmt(producto.precio)}` : '';

  /* Badge */
  const badgeEl = document.getElementById('modalBadge');
  if (hasOffer) {
    badgeEl.className = 'modal-img-badge product-badge badge-offer';
    badgeEl.textContent = 'Oferta';
  } else if (lastUnits) {
    badgeEl.className = 'modal-img-badge product-badge badge-last-units';
    badgeEl.textContent = '¡Últimas unidades!';
  } else {
    badgeEl.className = '';
    badgeEl.textContent = '';
  }

  /* Stock info */
  const stockEl = document.getElementById('modalStock');
  if (producto.stock <= 3) {
    stockEl.innerHTML = `<span class="stock-dot low"></span> Últimas ${producto.stock} unidades`;
  } else {
    stockEl.innerHTML = `<span class="stock-dot"></span> En stock`;
  }

  /* Reset add button */
  const addBtn = document.getElementById('modalAddBtn');
  addBtn.className = 'modal-add-btn';
  addBtn.innerHTML = '<ion-icon name="bag-add-outline"></ion-icon> Agregar al carrito';

  /* URL update */
  history.replaceState(null, '', `?producto=${producto.id}`);

  /* Open */
  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}


function closeModal() {
  document.getElementById('productModal').classList.remove('open');
  document.body.style.overflow = '';
  state.modalProduct = null;
  history.replaceState(null, '', location.pathname + (state.activeSlug !== 'all' ? `?categoria=${state.activeSlug}` : ''));
}


/* ── Bind all UI events ── */
function bindEvents() {
  /* Search input */
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');

  if (state.search) {
    searchInput.value = state.search;
    searchClear.classList.add('visible');
  }

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    state.search = searchInput.value;
    searchClear.classList.toggle('visible', state.search.length > 0);
    debounceTimer = setTimeout(renderFiltered, 280);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.search = '';
    searchClear.classList.remove('visible');
    searchInput.focus();
    renderFiltered();
  });

  /* Sort select */
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderFiltered();
  });

  /* Modal close button */
  document.getElementById('modalClose').addEventListener('click', closeModal);

  /* Modal overlay click (outside content) */
  document.getElementById('productModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('productModal')) closeModal();
  });

  /* Escape key */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  /* Qty buttons */
  document.getElementById('qtyMinus').addEventListener('click', () => {
    if (state.modalQty <= 1) return;
    state.modalQty--;
    document.getElementById('qtyValue').textContent = state.modalQty;
  });

  document.getElementById('qtyPlus').addEventListener('click', () => {
    const max = state.modalProduct?.stock ?? 99;
    if (state.modalQty >= max) return;
    state.modalQty++;
    document.getElementById('qtyValue').textContent = state.modalQty;
  });

  /* Modal add to cart */
  document.getElementById('modalAddBtn').addEventListener('click', () => {
    if (!state.modalProduct) return;
    Cart.add(state.modalProduct, state.modalQty);

    const btn = document.getElementById('modalAddBtn');
    btn.classList.add('added');
    btn.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon> ¡Agregado!';

    setTimeout(() => {
      btn.classList.remove('added');
      btn.innerHTML = '<ion-icon name="bag-add-outline"></ion-icon> Agregar al carrito';
    }, 2000);
  });

  /* Modal share */
  document.getElementById('modalShareBtn').addEventListener('click', async () => {
    if (!state.modalProduct) return;
    const url = `${location.origin}${location.pathname}?producto=${state.modalProduct.id}`;
    if (navigator.share) {
      await navigator.share({ title: `Áurea Elizabeth — ${state.modalProduct.nombre}`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  });
}


/* ── Update URL without reload ── */
function updateURL() {
  const params = new URLSearchParams();
  if (state.activeSlug !== 'all') params.set('categoria', state.activeSlug);
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}


/* ── Helpers ── */
function fmt(n) {
  return Number(n).toLocaleString('es-AR');
}

function esc(str) {
  return String(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}


/* ── Nav search → filters catalog directly ── */
(function initNavSearch() {
  const btn      = document.getElementById('navSearchBtn');
  const bar      = document.getElementById('navSearchBar');
  const input    = document.getElementById('globalSearchInput');
  const closeBtn = document.getElementById('navSearchClose');
  if (!btn || !bar) return;

  function open() {
    bar.classList.add('open');
    btn.classList.add('active');
    input.focus();
  }
  function close() {
    bar.classList.remove('open');
    btn.classList.remove('active');
    input.value = '';
  }

  btn.addEventListener('click', () => bar.classList.contains('open') ? close() : open());
  closeBtn.addEventListener('click', close);

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') {
      const q = input.value.trim();
      const catalogInput = document.getElementById('searchInput');
      const catalogClear = document.getElementById('searchClear');
      if (catalogInput) {
        catalogInput.value = q;
        state.search = q;
        catalogClear?.classList.toggle('visible', q.length > 0);
        renderFiltered();
        close();
        document.getElementById('catalogCount')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
})();


/* ── Go ── */
init();

/* =============================================
   INDEX.JS — Landing page logic
   ============================================= */

/* ── Splash Screen ── */
(function initSplash() {
  const splash  = document.getElementById('splash');
  const app     = document.getElementById('app');
  const skipBtn = document.getElementById('splashSkip');

  function hideSplash() {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.remove();
      app.classList.remove('hidden');
    }, 750);
    sessionStorage.setItem('aurea_intro', '1');
  }

  if (sessionStorage.getItem('aurea_intro')) {
    splash.remove();
    app.classList.remove('hidden');
    return;
  }

  const autoTimer = setTimeout(hideSplash, 5500);

  skipBtn.addEventListener('click', () => {
    clearTimeout(autoTimer);
    hideSplash();
  });
})();


/* ── Hero floating particles ── */
(function initParticles() {
  const container = document.getElementById('heroParticles');
  if (!container) return;

  const symbols = ['✦', '✧', '◈', '❋', '✿', '⋆', '᯾', '⟡'];

  for (let i = 0; i < 14; i++) {
    const el       = document.createElement('span');
    el.className   = 'hero-particle';
    el.textContent = symbols[i % symbols.length];

    el.style.cssText = `
      left:               ${Math.random() * 100}%;
      font-size:          ${0.5 + Math.random() * 1.2}rem;
      animation-duration: ${16 + Math.random() * 22}s;
      animation-delay:    ${-(Math.random() * 22)}s;
    `;

    container.appendChild(el);
  }
})();


/* ── Load config from Supabase ── */
async function loadConfig() {
  const { data } = await db.from('config').select('key, value');
  if (!data) return {};
  return Object.fromEntries(data.map(r => [r.key, r.value]));
}


/* ── Apply config to UI ── */
function applyConfig(config) {
  // Promo banner
  const banner    = document.getElementById('promoBanner');
  const navHeader = document.getElementById('navHeader');

  if (banner && config.banner_activo === 'true' && config.banner_texto) {
    banner.textContent = config.banner_texto;
    banner.classList.add('active');
    navHeader?.classList.add('has-promo');
  }

  // WhatsApp & Instagram links
  if (config.whatsapp_numero) {
    const el = document.getElementById('footerWhatsapp');
    const cleanedNumber = config.whatsapp_numero.replace(/\D/g, '');
    if (el) el.href = `https://wa.me/${cleanedNumber}`;
  }

  if (config.instagram_usuario) {
    const el = document.getElementById('footerInstagram');
    if (el) el.href = `https://instagram.com/${config.instagram_usuario}`;
  }
}


/* ── Category visual backgrounds (multi-layer gradients, themed per category) ── */
const CAT_GRADIENTS = {
  'sahumerios': [
    'radial-gradient(ellipse 75% 55% at 72% 18%, rgba(201,168,76,0.55) 0%, transparent 60%)',
    'radial-gradient(ellipse 60% 75% at 22% 78%, rgba(107,63,160,0.65) 0%, transparent 58%)',
    'linear-gradient(148deg, #0f0618 0%, #2a1050 45%, #0d0a0e 100%)'
  ].join(', '),
  'cristales': [
    'radial-gradient(ellipse 70% 55% at 68% 22%, rgba(80,210,230,0.5) 0%, transparent 58%)',
    'radial-gradient(ellipse 55% 70% at 25% 72%, rgba(30,90,165,0.6) 0%, transparent 55%)',
    'linear-gradient(148deg, #05101f 0%, #0d2d62 48%, #05101f 100%)'
  ].join(', '),
  'aceites': [
    'radial-gradient(ellipse 70% 52% at 70% 20%, rgba(155,210,80,0.45) 0%, transparent 58%)',
    'radial-gradient(ellipse 55% 68% at 24% 76%, rgba(201,168,76,0.4) 0%, transparent 55%)',
    'linear-gradient(148deg, #07120a 0%, #1c3d22 48%, #07120a 100%)'
  ].join(', '),
  'velas': [
    'radial-gradient(ellipse 65% 55% at 62% 18%, rgba(240,170,50,0.65) 0%, transparent 58%)',
    'radial-gradient(ellipse 52% 68% at 24% 78%, rgba(185,65,20,0.55) 0%, transparent 55%)',
    'linear-gradient(148deg, #160600 0%, #3d1200 48%, #160600 100%)'
  ].join(', '),
  'inciensos': [
    'radial-gradient(ellipse 70% 52% at 68% 20%, rgba(145,105,228,0.55) 0%, transparent 58%)',
    'radial-gradient(ellipse 55% 70% at 25% 76%, rgba(38,18,105,0.65) 0%, transparent 55%)',
    'linear-gradient(148deg, #070420 0%, #1a1055 48%, #070420 100%)'
  ].join(', '),
  'bienestar': [
    'radial-gradient(ellipse 68% 52% at 65% 20%, rgba(210,125,148,0.55) 0%, transparent 58%)',
    'radial-gradient(ellipse 54% 70% at 24% 76%, rgba(125,42,82,0.65) 0%, transparent 55%)',
    'linear-gradient(148deg, #170610 0%, #3d102a 48%, #170610 100%)'
  ].join(', '),
};


/* ── Load and render categories ── */
async function loadCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;

  const { data, error } = await db
    .from('categorias')
    .select('id, nombre, icono, slug, imagen_url')
    .eq('activo', true)
    .order('orden');

  if (error || !data?.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">No hay categorías disponibles aún.</p>';
    return;
  }

  grid.innerHTML = data.map(cat => {
    const bg = cat.imagen_url
      ? `url(${cat.imagen_url}) center / cover no-repeat`
      : (CAT_GRADIENTS[cat.slug] || 'linear-gradient(155deg, #1a0a2e, #6b3fa0)');

    return `
      <a href="catalogo.html?categoria=${cat.slug}"
         class="category-photo-card"
         style="background: ${bg}">
        <span class="category-photo-name">${cat.nombre}</span>
      </a>
    `;
  }).join('');
}


/* ── Load and render featured products ── */
async function loadFeatured() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;

  const { data, error } = await db
    .from('productos')
    .select('*, categorias(nombre)')
    .eq('activo', true)
    .eq('destacado', true)
    .gt('stock', 0)
    .order('orden')
    .limit(8);

  if (error || !data?.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">No hay productos destacados aún.</p>';
    return;
  }

  grid.innerHTML = data.map(buildProductCard).join('');
}


/* ── Product card HTML builder ── */
function buildProductCard(p) {
  const precio    = p.precio_oferta ?? p.precio;
  const hasOffer  = p.precio_oferta != null && p.precio_oferta < p.precio;
  const lastUnits = p.stock > 0 && p.stock <= 3;

  const badge = hasOffer
    ? `<span class="product-badge badge-offer">Oferta</span>`
    : lastUnits
      ? `<span class="product-badge badge-last-units">¡Últimas unidades!</span>`
      : '';

  const priceHTML = hasOffer
    ? `<span class="product-price">$${formatPrice(precio)}</span>
       <span class="product-price-old">$${formatPrice(p.precio)}</span>`
    : `<span class="product-price">$${formatPrice(precio)}</span>`;

  const safeP = encodeURIComponent(JSON.stringify(p));

  return `
    <div class="product-card" onclick="window.location='catalogo.html?producto=${p.id}'">
      <div class="product-img-wrap">
        <img src="${p.imagen_url || 'assets/placeholder.jpg'}" alt="${p.nombre}" loading="lazy" />
        ${badge}
        <button class="product-share-btn" onclick="shareProduct(event,'${p.id}','${escapeAttr(p.nombre)}')">
          <ion-icon name="share-social-outline"></ion-icon>
        </button>
      </div>
      <div class="product-info">
        <p class="product-category">${p.categorias?.nombre || ''}</p>
        <h3 class="product-name">${p.nombre}</h3>
        <div class="product-price-row">${priceHTML}</div>
        <button
          class="product-add-btn"
          data-id="${p.id}"
          onclick="handleAddToCart(event, '${safeP}')">
          <ion-icon name="add-outline"></ion-icon>
          Agregar al carrito
        </button>
      </div>
    </div>
  `;
}


/* ── Add to cart handler ── */
function handleAddToCart(e, encodedProducto) {
  e.stopPropagation();
  const producto = JSON.parse(decodeURIComponent(encodedProducto));
  Cart.add(producto);

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
  const url = `${location.origin}${location.pathname.replace('index.html', 'catalogo.html')}?producto=${id}`;

  if (navigator.share) {
    await navigator.share({ title: `Áurea Elizabeth — ${nombre}`, url }).catch(() => {});
  } else {
    await navigator.clipboard.writeText(url).catch(() => {});
  }
}


/* ── Helpers ── */
function formatPrice(n) {
  return Number(n).toLocaleString('es-AR');
}

function escapeAttr(str) {
  return String(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}


/* ── Init ── */
async function init() {
  const [config] = await Promise.all([
    loadConfig(),
    loadCategories(),
    loadFeatured()
  ]);

  applyConfig(config);
}

init();


/* ── Nav search → redirects to catalog ── */
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
      window.location.href = q
        ? `catalogo.html?buscar=${encodeURIComponent(q)}`
        : 'catalogo.html';
    }
  });
})();


/* ── Banner hide on scroll ── */
(function initBannerScroll() {
  const banner = document.getElementById('promoBanner');
  const nav    = document.getElementById('navHeader');
  if (!banner || !nav) return;
  window.addEventListener('scroll', () => {
    const past = window.scrollY > 60;
    banner.classList.toggle('scrolled-out', past);
    nav.classList.toggle('banner-scrolled-out', past);
  }, { passive: true });
})();

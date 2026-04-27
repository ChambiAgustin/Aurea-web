/* =============================================
   CARRITO.JS — Cart render, delivery form, WhatsApp checkout
   ============================================= */

const ADDRESS_KEY = 'aurea_address';

/* ── App state ── */
const state = {
  config:   {},
  mode:     'envio',  // 'envio' | 'retiro'
};


/* ── Init ── */
async function init() {
  Cart.updateBadges();
  state.config = await loadConfig();
  applyConfig(state.config);
  renderCart();
  restoreAddress();
  bindEvents();
}


/* ── Load config ── */
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

  // Retiro info
  const retiroDireccion = document.getElementById('retiroDireccion');
  const retiroHorario   = document.getElementById('retiroHorario');
  if (retiroDireccion && config.direccion_local) {
    retiroDireccion.textContent = config.direccion_local;
  }
  if (retiroHorario && config.horario_local) {
    retiroHorario.textContent = config.horario_local;
  }
}


/* ── Render cart items and summary ── */
function renderCart() {
  const items = Cart.get();

  const emptyEl   = document.getElementById('cartEmpty');
  const layoutEl  = document.getElementById('cartLayout');
  const successEl = document.getElementById('cartSuccess');

  if (!items.length) {
    emptyEl.classList.remove('hidden');
    layoutEl.classList.add('hidden');
    successEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  layoutEl.classList.remove('hidden');

  renderItems(items);
  renderSummary(items);
}


/* ── Render item rows ── */
function renderItems(items) {
  const list      = document.getElementById('cartItemsList');
  const countSpan = document.getElementById('cartItemCount');

  const total = items.reduce((s, i) => s + i.cantidad, 0);
  countSpan.textContent = `(${total} ${total === 1 ? 'artículo' : 'artículos'})`;

  list.innerHTML = items.map(item => `
    <div class="cart-item" data-id="${item.id}">

      <div class="cart-item-img">
        <img src="${item.imagen_url || 'assets/placeholder.jpg'}" alt="${esc(item.nombre)}" loading="lazy" />
      </div>

      <div class="cart-item-info">
        <p class="cart-item-name">${item.nombre}</p>
        <p class="cart-item-price">$${fmt(item.precio)} c/u</p>
      </div>

      <div class="cart-item-controls">
        <div class="qty-selector">
          <button class="qty-btn" onclick="changeQty('${item.id}', -1)">
            <ion-icon name="remove-outline"></ion-icon>
          </button>
          <span class="qty-value">${item.cantidad}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}', 1)">
            <ion-icon name="add-outline"></ion-icon>
          </button>
        </div>

        <p class="cart-item-subtotal">$${fmt(item.precio * item.cantidad)}</p>

        <button class="cart-item-remove" onclick="removeItem('${item.id}')" aria-label="Eliminar">
          <ion-icon name="trash-outline"></ion-icon>
        </button>
      </div>

    </div>
  `).join('');
}


/* ── Render order summary ── */
function renderSummary(items) {
  const subtotal        = Cart.total();
  const envioGratisDesde = parseFloat(state.config.envio_gratis_desde || '0');
  const isRetiro        = state.mode === 'retiro';
  const isFreeShipping  = subtotal >= envioGratisDesde && envioGratisDesde > 0;

  document.getElementById('summarySubtotal').textContent = `$${fmt(subtotal)}`;

  const shippingRow   = document.getElementById('summaryShippingRow');
  const shippingEl    = document.getElementById('summaryShipping');
  const progressWrap  = document.getElementById('shippingProgress');
  const fillEl        = document.getElementById('shippingFill');
  const labelEl       = document.getElementById('shippingLabel');

  if (isRetiro) {
    shippingRow.style.display  = 'none';
    progressWrap.style.display = 'none';
  } else {
    shippingRow.style.display  = '';

    if (isFreeShipping || envioGratisDesde === 0) {
      shippingEl.textContent     = '¡Gratis!';
      shippingEl.style.color     = 'var(--accent-gold)';
      progressWrap.style.display = 'none';
    } else {
      const falta    = envioGratisDesde - subtotal;
      const pct      = Math.min((subtotal / envioGratisDesde) * 100, 100);

      shippingEl.textContent     = 'A confirmar';
      shippingEl.style.color     = '';
      progressWrap.style.display = '';
      fillEl.style.width         = `${pct}%`;
      labelEl.textContent        = `Sumá $${fmt(falta)} más para envío gratis`;
    }
  }

  document.getElementById('summaryTotal').textContent = `$${fmt(subtotal)}`;
}


/* ── Change item quantity ── */
function changeQty(id, delta) {
  const items = Cart.get();
  const item  = items.find(i => i.id === id);
  if (!item) return;

  const newQty = item.cantidad + delta;
  if (newQty < 1) {
    removeItem(id);
    return;
  }

  Cart.updateQuantity(id, newQty);
  renderCart();
}


/* ── Remove item ── */
function removeItem(id) {
  Cart.remove(id);
  renderCart();
}


/* ══════════════════════════════════════════
   DELIVERY FORM
   ══════════════════════════════════════════ */

/* ── Bind all UI events ── */
function bindEvents() {
  // Delivery tabs
  document.querySelectorAll('.delivery-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.mode = tab.dataset.mode;
      document.querySelectorAll('.delivery-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updateDeliveryForm();
      renderSummary(Cart.get());
    });
  });

  // Confirm button
  document.getElementById('confirmBtn').addEventListener('click', handleConfirm);

  // Autosave address fields
  ['fieldNombre', 'fieldTelefono', 'fieldDireccion', 'fieldNotas'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', saveAddress);
  });
}


/* ── Toggle form fields based on delivery mode ── */
function updateDeliveryForm() {
  const isEnvio  = state.mode === 'envio';
  const groupDir = document.getElementById('groupDireccion');
  const retiroEl = document.getElementById('retiroInfo');
  const dirInput = document.getElementById('fieldDireccion');

  groupDir.classList.toggle('hidden', !isEnvio);
  retiroEl.classList.toggle('hidden', isEnvio);
  dirInput.required = isEnvio;
}


/* ── Restore saved address from localStorage ── */
function restoreAddress() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADDRESS_KEY) || '{}');
    if (saved.nombre)    document.getElementById('fieldNombre').value    = saved.nombre;
    if (saved.telefono)  document.getElementById('fieldTelefono').value  = saved.telefono;
    if (saved.direccion) document.getElementById('fieldDireccion').value = saved.direccion;
    if (saved.notas)     document.getElementById('fieldNotas').value     = saved.notas;
  } catch {}
}


/* ── Save address to localStorage ── */
function saveAddress() {
  const data = {
    nombre:    document.getElementById('fieldNombre').value,
    telefono:  document.getElementById('fieldTelefono').value,
    direccion: document.getElementById('fieldDireccion').value,
    notas:     document.getElementById('fieldNotas').value,
  };
  localStorage.setItem(ADDRESS_KEY, JSON.stringify(data));
}


/* ══════════════════════════════════════════
   CHECKOUT — Create order + Open WhatsApp
   ══════════════════════════════════════════ */

async function handleConfirm() {
  const items = Cart.get();
  if (!items.length) return;

  /* Validate */
  const nombre    = document.getElementById('fieldNombre').value.trim();
  const telefono  = document.getElementById('fieldTelefono').value.trim();
  const direccion = document.getElementById('fieldDireccion').value.trim();
  const notas     = document.getElementById('fieldNotas').value.trim();

  if (!nombre) {
    showFieldError('fieldNombre', 'Ingresá tu nombre');
    return;
  }

  if (state.mode === 'envio' && !direccion) {
    showFieldError('fieldDireccion', 'Ingresá la dirección de entrega');
    return;
  }

  /* Loading state */
  const btn = document.getElementById('confirmBtn');
  btn.disabled = true;
  btn.innerHTML = '<ion-icon name="hourglass-outline"></ion-icon> Procesando...';

  /*
   * Abrimos la ventana ANTES del await para que no sea bloqueada
   * por el bloqueador de popups del navegador (iOS Safari, etc.).
   */
  const waWindow = window.open('', '_blank');

  try {
    /* 1. Calculate totals */
    const subtotal     = Cart.total();
    const horasReserva = parseInt(state.config.tiempo_reserva_horas || '24');
    const expiresAt    = new Date(Date.now() + horasReserva * 3600 * 1000).toISOString();

    /* 2. Create pedido in Supabase */
    const { data: pedido, error } = await db.from('pedidos').insert({
      productos_json: items,
      nombre_cliente: nombre,
      telefono:       telefono || null,
      modalidad:      state.mode,
      direccion:      state.mode === 'envio' ? direccion : null,
      notas:          notas || null,
      total:          subtotal,
      estado:         'pendiente',
      expires_at:     expiresAt,
    }).select('id').single();

    if (error) throw error;

    /* 3. Generate WhatsApp message and navigate the pre-opened window */
    const mensaje = buildWhatsAppMessage({ items, subtotal, nombre, telefono, direccion, notas });
    const numero  = (state.config.whatsapp_numero || '').replace(/\D/g, '');
    const waURL   = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;

    if (waWindow) {
      waWindow.location.href = waURL;
    } else {
      window.location.href = waURL;
    }

    /* 4. Clear cart and show success */
    Cart.clear();
    showSuccess();

  } catch (err) {
    console.error('Error creando pedido:', err);
    waWindow?.close();
    btn.disabled = false;
    btn.innerHTML = '<ion-icon name="logo-whatsapp"></ion-icon> Confirmar pedido por WhatsApp';
    showGlobalError('Ocurrió un error al procesar tu pedido. Intentá de nuevo.');
  }
}


/* ── Build WhatsApp message ── */
function buildWhatsAppMessage({ items, subtotal, nombre, telefono, direccion, notas }) {
  const intro   = state.config.mensaje_pedido_intro || '🌿 *Nuevo pedido — Áurea Elizabeth*';
  const isRetiro = state.mode === 'retiro';

  const envioGratisDesde = parseFloat(state.config.envio_gratis_desde || '0');
  const isFreeShipping   = envioGratisDesde > 0 && subtotal >= envioGratisDesde;

  const lineasProductos = items
    .map(i => `• ${i.nombre} x${i.cantidad} — $${fmt(i.precio * i.cantidad)}`)
    .join('\n');

  const envioLinea = isRetiro
    ? '🏪 *Modalidad:* Retiro en local'
    : isFreeShipping
      ? '🚚 *Envío:* ¡Gratis!'
      : '🚚 *Envío:* A confirmar';

  const direccionLinea = !isRetiro && direccion
    ? `📍 *Dirección:* ${direccion}`
    : '';

  const telefonoLinea = telefono ? `📱 *Teléfono:* ${telefono}` : '';
  const notasLinea    = notas    ? `📝 *Notas:* ${notas}`       : '';

  const lineas = [
    intro,
    '',
    '📦 *Productos:*',
    lineasProductos,
    '',
    `💰 *Total: $${fmt(subtotal)}*`,
    envioLinea,
    direccionLinea,
    '',
    `👤 *Nombre:* ${nombre}`,
    telefonoLinea,
    notasLinea,
  ].filter(l => l !== null && l !== undefined);

  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}


/* ── Show success screen ── */
function showSuccess() {
  document.getElementById('cartLayout').classList.add('hidden');
  document.getElementById('cartEmpty').classList.add('hidden');
  document.getElementById('cartSuccess').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ── Field error helper ── */
function showFieldError(fieldId, mensaje) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.add('input-error');
  field.focus();

  let errEl = field.parentElement.querySelector('.field-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'field-error';
    field.parentElement.appendChild(errEl);
  }
  errEl.textContent = mensaje;

  field.addEventListener('input', () => {
    field.classList.remove('input-error');
    errEl.remove();
  }, { once: true });
}


/* ── Global error helper ── */
function showGlobalError(msg) {
  let errEl = document.getElementById('globalError');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.id        = 'globalError';
    errEl.className = 'global-error';
    document.getElementById('confirmBtn').insertAdjacentElement('afterend', errEl);
  }
  errEl.textContent = msg;
  setTimeout(() => errEl.remove(), 5000);
}


/* ── Helpers ── */
function fmt(n) { return Number(n).toLocaleString('es-AR'); }
function esc(s) { return String(s).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }


/* ── Go ── */
init();

/* =============================================
   CART — localStorage-based cart management
   ============================================= */

const CART_KEY = 'aurea_cart';

const Cart = {

  get() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
  },

  save(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    Cart.updateBadges();
  },

  add(producto, cantidad = 1) {
    const items = Cart.get();
    const existing = items.find(i => i.id === producto.id);

    if (existing) {
      existing.cantidad += cantidad;
    } else {
      items.push({
        id:        producto.id,
        nombre:    producto.nombre,
        precio:    producto.precio_oferta ?? producto.precio,
        imagen_url: producto.imagen_url || null,
        cantidad
      });
    }

    Cart.save(items);
  },

  remove(productoId) {
    Cart.save(Cart.get().filter(i => i.id !== productoId));
  },

  updateQuantity(productoId, cantidad) {
    if (cantidad < 1) { Cart.remove(productoId); return; }
    const items = Cart.get().map(i =>
      i.id === productoId ? { ...i, cantidad } : i
    );
    Cart.save(items);
  },

  count() {
    return Cart.get().reduce((sum, i) => sum + i.cantidad, 0);
  },

  total() {
    return Cart.get().reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  },

  clear() {
    localStorage.removeItem(CART_KEY);
    Cart.updateBadges();
  },

  updateBadges() {
    const count = Cart.count();
    document.querySelectorAll('.cart-badge').forEach(el => {
      el.textContent = count;
      el.classList.toggle('visible', count > 0);
    });
  }
};

/* Init badges on load */
document.addEventListener('DOMContentLoaded', () => Cart.updateBadges());

# Áurea Elizabeth — Plan de Implementación

> Documento de contexto para agentes de IA y continuidad entre sesiones.
> Leer **completo** antes de escribir cualquier línea de código.

---

## 1. Descripción del proyecto

Tienda online de artículos holísticos para **Áurea Elizabeth**.
El cliente puede navegar el catálogo, agregar productos al carrito, y finalizar el pedido **vía WhatsApp** con un mensaje automático que incluye el detalle del pedido y la dirección/modalidad de entrega.
El dueño gestiona todo (productos, stock, promociones, configuración) desde un panel de administrador **sin tocar código**.

---

## 2. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Vanilla HTML5 / CSS3 / JavaScript ES6+ (sin frameworks) |
| BaaS | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Checkout | WhatsApp Business API vía `wa.me` |
| PWA | `sw.js` + `site.webmanifest` |
| Iconos | Ionicons v7 (CDN) |
| Fuentes | Cinzel · Cormorant Garamond · Poppins (Google Fonts) |
| Supabase JS | `@supabase/supabase-js@2` (CDN UMD) |

**Regla de oro**: cero librerías externas de UI. Todo construido a mano para máximo control.

---

## 3. Credenciales Supabase

```
URL:  https://zqhbasfealagcgydpjmz.supabase.co
KEY:  sb_publishable_aOWcraKF7xDwAYk3rI1rlQ_fiBqZtsx
```

> Nota: Supabase ahora usa formato `sb_publishable_xxx` para la anon key (antes era JWT `eyJ...`).
> El cliente se instancia en `js/supabase-client.js` como `const db = window.supabase.createClient(URL, KEY)`.

---

## 4. Design System

### Paleta de colores

```css
--bg-base:        #0D0A0E;   /* Negro profundo — fondo base */
--bg-dark:        #150920;   /* Púrpura muy oscuro — fondo de secciones */
--bg-card:        rgba(21, 9, 32, 0.75);   /* Cards con glassmorphism */
--accent-gold:    #C9A84C;   /* Dorado cálido — color de marca */
--accent-gold-lt: #E8D5A3;   /* Dorado claro — textos destacados */
--accent-amber:   #E8A030;   /* Ámbar — hover, CTA */
--accent-purple:  #6B3FA0;   /* Púrpura — acentos de fondo */
--text-cream:     #F5EDD6;   /* Crema — texto principal */
--text-muted:     #A89880;   /* Texto secundario */
--text-dim:       #5E5248;   /* Texto muy suave, copyright */
--border-glass:   rgba(201, 168, 76, 0.20);
--border-subtle:  rgba(201, 168, 76, 0.07);
```

### Tipografía

| Variable | Fuente | Uso |
|----------|--------|-----|
| `--font-heading` | Cinzel (serif) | Títulos, nav, botones, badges |
| `--font-sub` | Cormorant Garamond | Subtítulos, eyebrows, descripciones |
| `--font-body` | Poppins | Cuerpo, UI, formularios |

### Logo
`logo.jpeg` en la raíz del proyecto. Serif dorado, "Áurea" grande + "Elizabeth" debajo, motivo botánico (hoja) a la derecha. Fondo blanco/crema. Usar con `filter: brightness(1.05)` sobre fondos oscuros.

### Efectos visuales clave
- **Glassmorphism**: `backdrop-filter: blur(18px)` en nav y cards
- **Glow dorado**: `box-shadow: 0 0 40px rgba(201,168,76,0.4)` en hover
- **Shimmer en botones**: sweep de `rgba(255,255,255,0.22)` con `transform: translateX`
- **Animación de humo**: partículas CSS absolutas que suben con `smokeRise` keyframe

---

## 5. Arquitectura de stock (Opción B — Reserva temporal)

### El problema
El checkout es por WhatsApp: el cliente envía el pedido pero **no hay confirmación de pago automática**. Sin control, dos personas pueden pedir el último artículo simultáneamente.

### La solución
**Dos capas de stock:**

| Campo/Vista | Qué representa |
|-------------|----------------|
| `productos.stock` | Stock físico real (el admin lo controla manualmente) |
| `stock_disponible` (VIEW) | `stock_real - SUM(cantidades de pedidos pendientes no expirados)` |

**Flujo completo:**
```
Cliente arma carrito
    ↓
Completa nombre + modalidad (envío/retiro) + dirección/datos
    ↓
Click "Confirmar pedido"
    ↓
[JS] → crea registro en tabla `pedidos` con estado='pendiente' y expires_at = now() + 24hs
    ↓
[JS] → abre WhatsApp con mensaje automático formateado
    ↓
Admin recibe WhatsApp y ve el pedido en su panel
    ↓
¿Pago recibido?
├── SÍ → Admin hace click "Confirmar" → stock_real se descuenta → estado='confirmado'
└── NO → Admin hace "Rechazar" O espera que expire (24hs) → stock vuelve a estar disponible
```

**El stock que ven los clientes** siempre viene de la VIEW `stock_disponible`, nunca de `productos.stock` directamente.

---

## 6. Schema de Supabase

### Tabla: `config`
```sql
key TEXT PRIMARY KEY, value TEXT
```
**Filas clave:**
- `whatsapp_numero` — número de WhatsApp del negocio (con código de país, ej: `549XXXXXXXXXX`)
- `instagram_usuario` — usuario de Instagram
- `banner_activo` — `'true'` / `'false'`
- `banner_texto` — texto del banner promocional sticky
- `envio_gratis_desde` — monto mínimo para envío gratis (en ARS)
- `tiempo_reserva_horas` — horas que dura una reserva pendiente (default: `'24'`)
- `mensaje_pedido_intro` — primera línea del mensaje de WhatsApp

### Tabla: `categorias`
```sql
id UUID PK, nombre TEXT, icono TEXT (emoji), slug TEXT UNIQUE,
orden INT, activo BOOLEAN
```

### Tabla: `productos`
```sql
id UUID PK, nombre TEXT, descripcion_corta TEXT, descripcion_larga TEXT,
precio NUMERIC(10,2), precio_oferta NUMERIC(10,2) nullable,
imagen_url TEXT, categoria_id UUID FK → categorias,
stock INT, activo BOOLEAN, destacado BOOLEAN, orden INT, created_at TIMESTAMPTZ
```
**Reglas de negocio:**
- Si `stock = 0` → el producto no aparece en el catálogo (filtro `gt('stock', 0)`)
- Si `stock <= 3` → badge "¡Últimas unidades!" en la card
- Si `precio_oferta != null && precio_oferta < precio` → badge "Oferta" + precio tachado
- Si `destacado = true` → aparece en la sección "Productos Destacados" del index

### Tabla: `pedidos`
```sql
id UUID PK, productos_json JSONB (snapshot del carrito),
nombre_cliente TEXT, telefono TEXT,
modalidad TEXT ('envio' | 'retiro'),
direccion TEXT nullable (solo si modalidad='envio'),
notas TEXT, total NUMERIC(10,2),
estado TEXT ('pendiente' | 'confirmado' | 'rechazado'),
expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ
```

### Tabla: `promociones`
```sql
id UUID PK, titulo TEXT, descripcion TEXT,
tipo TEXT ('porcentaje' | 'monto_fijo' | '2x1'), valor NUMERIC(10,2),
producto_id UUID FK nullable, categoria_id UUID FK nullable,
fecha_inicio TIMESTAMPTZ, fecha_fin TIMESTAMPTZ, activo BOOLEAN
```

### View: `stock_disponible`
```sql
-- Retorna stock_real y stock_disponible por producto.
-- Usar esta view en el catálogo, nunca productos.stock directamente.
SELECT id, nombre, stock AS stock_real,
  GREATEST(0, stock - SUM(pedidos_pendientes)) AS stock_disponible
FROM productos ...
```

### RLS (Row Level Security)
- **Lectura pública** (`anon`): `config`, `categorias`, `productos`, `promociones`
- **Insert público**: `pedidos` (los clientes crean pedidos sin autenticación)
- **Todo** (CRUD completo): solo `authenticated` (el admin logueado)

---

## 7. Estructura de archivos

```
Aurea-Web/
├── index.html              ✅ Landing page (hero, categorías, destacados)
├── catalogo.html           ✅ Catálogo completo con filtros, búsqueda y modal
├── carrito.html            ✅ Carrito + form entrega + checkout WhatsApp
├── admin.html              ⏳ Panel de administrador
├── style.css               ✅ Design system + estilos catálogo + modal
├── site.webmanifest        ✅ PWA
├── sw.js                   ⏳ Service Worker
├── supabase-setup.sql      ✅ Schema completo (ejecutado en Supabase ✓)
├── logo.jpeg               ✅ Logo de la tienda
├── assets/
│   └── placeholder.jpg     ⏳ Imagen placeholder para productos sin foto
└── js/
    ├── supabase-client.js  ✅ Instancia de Supabase (`const db`)
    ├── cart.js             ✅ Lógica del carrito (localStorage)
    ├── index.js            ✅ Splash + partículas + carga dinámica landing
    ├── catalogo.js         ✅ Filtros, búsqueda, sort, modal de detalle
    ├── carrito.js          ✅ Render carrito + form entrega + generador WhatsApp
    └── admin.js            ⏳ CRUD completo del panel admin
```

---

## 8. Páginas — Descripción detallada

### `index.html` ✅
- **Splash screen**: animación de 3 sahumerios con humo CSS (session-aware via `sessionStorage`)
- **Promo banner**: franja sticky superior, controlada desde `config.banner_activo`
- **Nav**: logo centrado-izquierda, links, botón carrito con badge. Mobile: bottom nav
- **Hero**: gradiente oscuro con partículas flotantes, título con highlight dorado, 2 CTAs
- **Sección categorías**: grid dinámico desde `categorias` table
- **Sección destacados**: grid dinámico desde `productos` donde `destacado=true`
- **Footer**: logo, links de navegación, WhatsApp e Instagram dinámicos desde config

### `catalogo.html` ⏳
- Filtros por categoría (chips horizontales, scrollables en mobile)
- Buscador en tiempo real (filtra por nombre)
- Ordenar por: precio asc/desc, más reciente, destacados primero
- Grid de products cards (mismo componente que index)
- Paginación o infinite scroll
- URL params: `?categoria=sahumerios` (viene del click en categoría del index)

### `carrito.html` ⏳
- Lista de items: imagen, nombre, precio unitario, selector de cantidad (+/-), eliminar
- Resumen de precios: subtotal, envío (gratis si supera el mínimo), total
- **Selector de modalidad**: radio buttons "Envío a domicilio" / "Retiro en local"
  - Si "Envío": mostrar campos dirección (con autoguardado en localStorage)
  - Si "Retiro": mostrar dirección del local y horarios (desde `config`)
- Campo "Nombre" y "Notas opcionales"
- Botón "Confirmar pedido": crea el registro en `pedidos` + abre WhatsApp
- **Formato del mensaje WhatsApp**:
```
🌿 *Nuevo pedido — Áurea Elizabeth*

📦 *Productos:*
• [nombre] x[cantidad] — $[precio]
• ...

💰 *Total: $[total]*
[Si envío] 🚚 *Dirección: [dirección]*
[Si retiro] 🏪 *Retiro en local*
👤 *Nombre: [nombre]*
📝 *Notas: [notas]* (si hay)
```

### `admin.html` ⏳
**Requiere login con Supabase Auth** (email + password). Solo el dueño tiene acceso.

Secciones del panel:
1. **Dashboard**: resumen (productos activos, pedidos pendientes hoy, stock bajo)
2. **Pedidos**: tabla de pedidos pendientes con countdown de expiración, botones Confirmar/Rechazar
3. **Productos**: tabla con búsqueda, toggle activo/inactivo, botones editar/eliminar. Botón "Nuevo producto"
4. **Nuevo / Editar producto**: formulario completo con upload de imagen a Supabase Storage + preview
5. **Categorías**: CRUD simple con orden drag-and-drop
6. **Promociones**: CRUD con fechas de inicio/fin
7. **Configuración**: formulario para editar todos los valores de la tabla `config`

---

## 9. Funcionalidades especiales

### Dirección guardada (localStorage)
Al completar un pedido, la dirección se guarda en `localStorage` como `aurea_address`. En la próxima visita al carrito, el campo aparece pre-cargado.

### Badge de stock bajo
Si `stock_disponible <= 3`, la card muestra "¡Últimas unidades!" automáticamente.

### Auto-hide por stock cero
El catálogo siempre filtra con `.gt('stock', 0)` o usa la VIEW `stock_disponible`. Si el stock llega a 0, el producto desaparece del catálogo sin que el admin haga nada.

### Compartir producto (Web Share API)
Botón de compartir en cada card. Usa `navigator.share()` si está disponible (mobile), sino copia la URL al clipboard.

### Banner promocional sticky
Franja arriba del header, texto y estado controlados desde `config` en el admin. Cuando está activo, el nav se desplaza hacia abajo con `has-promo` class.

### Envío gratis automático
Si el total del carrito supera `config.envio_gratis_desde`, el resumen del carrito muestra "Envío gratis" y el mensaje de WhatsApp lo indica.

### Promociones con vencimiento
Las promociones en tabla `promociones` tienen `fecha_inicio` y `fecha_fin`. El JS las filtra: `fecha_inicio <= now() AND fecha_fin >= now() AND activo = true`. El admin no tiene que acordarse de desactivarlas.

---

## 10. Fases de implementación

### Fase 1 — Fundación ✅ COMPLETADA
- [x] Design system CSS completo (tokens, animaciones, componentes)
- [x] `index.html` — landing page completo
- [x] `js/supabase-client.js` — conexión a Supabase
- [x] `js/cart.js` — lógica del carrito
- [x] `js/index.js` — splash, partículas, carga dinámica
- [x] `supabase-setup.sql` — schema completo con RLS y VIEW
- [x] `site.webmanifest` — PWA

**Pendiente del cliente:** ejecutar `supabase-setup.sql` en Supabase SQL Editor.

---

### Fase 2 — Catálogo ✅ COMPLETADA
- [x] `catalogo.html` — estructura HTML completa
- [x] `js/catalogo.js` — filtros, búsqueda debounceada, render grid, sort
- [x] Soporte para URL params (`?categoria=slug`, `?producto=id`)
- [x] Skeleton loaders durante la carga
- [x] Modal de detalle de producto con qty selector y compartir
- [x] CSS catálogo: search bar, filter chips sticky, sort select, empty state, modal responsive

---

### Fase 3 — Carrito y Checkout ✅ COMPLETADA
- [x] `carrito.html` — estructura HTML completa
- [x] `js/carrito.js` — render items, cantidad +/-, eliminar, totales
- [x] Formulario de entrega con tabs (envío/retiro) dinámico
- [x] Autoguardado de dirección en localStorage (`aurea_address`)
- [x] Generador de mensaje WhatsApp formateado con emojis
- [x] Creación del pedido en Supabase ANTES de abrir WhatsApp
- [x] Barra de progreso de envío gratis con monto configurable desde config
- [x] Estado de éxito post-pedido con animación
- [x] Validación de formulario con mensajes de error inline

**Notas importantes de carrito.js**:
- `config.direccion_local` y `config.horario_local` → deben agregarse a la tabla config para la info de retiro
- El pedido se crea con `estado='pendiente'` y `expires_at = now() + tiempo_reserva_horas`
- WhatsApp se abre con `window.open(waURL, '_blank')` — requiere que el browser no bloquee popups
- El carrito se limpia DESPUÉS de que el pedido se crea exitosamente en Supabase

---

### Fase 4 — Panel Admin ⏳
- [ ] `admin.html` — layout del panel
- [ ] `js/admin.js` — toda la lógica
- [ ] Login con Supabase Auth
- [ ] Dashboard con resumen
- [ ] Gestión de pedidos (confirmar/rechazar con countdown)
- [ ] CRUD productos con upload imagen → Supabase Storage + preview
- [ ] CRUD categorías
- [ ] CRUD promociones con fechas
- [ ] Formulario de configuración global

---

### Fase 5 — PWA y Polish ⏳
- [ ] `sw.js` — Service Worker con estrategias network-first / cache-first
- [ ] `assets/placeholder.jpg` — imagen de fallback para productos
- [ ] Micro-interacciones de polish
- [ ] Optimización de imágenes con `loading="lazy"` y `content-visibility`
- [ ] Open Graph completo para redes sociales

---

## 11. Decisiones clave tomadas

| Decisión | Opción elegida | Motivo |
|----------|---------------|--------|
| Control de stock | Reserva temporal (Opción B) | Previene overselling sin pasarela de pago |
| Modalidad de entrega | Ambas (envío + retiro) | El formulario del carrito tiene selector dinámico |
| Frontend framework | Ninguno (Vanilla JS) | Máximo control, sin dependencias, mejor perf |
| Auth admin | Supabase Auth (email/password) | Sin necesidad de backend custom |
| Imágenes productos | Supabase Storage | El admin sube desde el panel, URL pública |
| Estado del carrito | localStorage | Sin necesidad de auth para el cliente |
| Supabase key format | `sb_publishable_xxx` | Nuevo formato de Supabase (antes era JWT) |

---

## 12. Convenciones de código

- **Instancia de Supabase**: siempre `db` (no `supabase`, no `client`)
- **Carrito**: siempre a través del objeto `Cart` de `cart.js`
- **Precios**: formatear con `Number(n).toLocaleString('es-AR')` → `$12.500`
- **Stock visible**: usar siempre la VIEW `stock_disponible`, nunca `productos.stock` directamente en el catálogo
- **IDs**: UUIDs generados por Supabase (`gen_random_uuid()`)
- **Fechas**: siempre en UTC en la DB, formatear en el cliente con `toLocaleDateString('es-AR')`
- **Atributos HTML con datos de JS**: usar `encodeURIComponent(JSON.stringify(obj))` para embeber objetos en atributos `data-*`
- **Imágenes sin URL**: fallback a `assets/placeholder.jpg`

---

## 13. Notas importantes para el agente

1. **Nunca** usar `supabase` como nombre de variable, siempre `db` (ya está instanciado en `supabase-client.js`)
2. **Nunca** leer `productos.stock` en el catálogo — usar la VIEW `stock_disponible`
3. El `logo.jpeg` tiene fondo blanco — en fondos oscuros usar `filter: brightness(1.05)`, nunca `filter: invert()`
4. La animación del splash es **session-aware**: si `sessionStorage.getItem('aurea_intro')` existe, saltearla completamente
5. Los pedidos se crean con `estado='pendiente'` y `expires_at = now() + interval X hours` (X viene de `config.tiempo_reserva_horas`)
6. Los RLS policies permiten `INSERT` anónimo en `pedidos` pero `SELECT/UPDATE/DELETE` solo a `authenticated`
7. El `supabase-setup.sql` ya fue creado y debe ser ejecutado por el cliente en el SQL Editor de Supabase
8. El número de WhatsApp en `config` debe estar en formato internacional sin `+` (ej: `549XXXXXXXXXX` para Argentina)

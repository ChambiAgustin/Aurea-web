/* =============================================
   ÁUREA ELIZABETH — Supabase Schema Setup
   Ejecutar en: Supabase > SQL Editor
   ============================================= */


/* ── Config (clave-valor, todo editable desde el admin) ── */
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO config (key, value) VALUES
  ('nombre_tienda',         'Áurea Elizabeth'),
  ('whatsapp_numero',       '5493875218180'),
  ('instagram_usuario',     'aurea.elizabeth'),
  ('banner_activo',         'false'),
  ('banner_texto',          '🌿 Envío gratis en compras mayores a $10.000'),
  ('envio_gratis_desde',    '10000'),
  ('tiempo_reserva_horas',  '24'),
  ('mensaje_pedido_intro',  '🌿 *Nuevo pedido — Áurea Elizabeth*'),
  ('direccion_local',       'Av. Ejemplo 1234, Tu Ciudad'),
  ('horario_local',         'Lun a Vie 10hs - 18hs')
ON CONFLICT (key) DO NOTHING;


/* ── Categorías ── */
CREATE TABLE IF NOT EXISTS categorias (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL,
  icono      TEXT NOT NULL DEFAULT '🌿',
  slug       TEXT NOT NULL UNIQUE,
  imagen_url TEXT,
  orden      INT  NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT true
);

-- Si la tabla ya existe, agregar la columna imagen_url:
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS imagen_url TEXT;

INSERT INTO categorias (nombre, icono, slug, orden) VALUES
  ('Sahumerios',       '🪔', 'sahumerios',     1),
  ('Cristales',        '💎', 'cristales',       2),
  ('Aceites',          '🫙', 'aceites',         3),
  ('Velas',            '🕯️', 'velas',           4),
  ('Inciensos',        '✨', 'inciensos',       5),
  ('Bienestar',        '🌸', 'bienestar',       6)
ON CONFLICT (slug) DO NOTHING;


/* ── Productos ── */
CREATE TABLE IF NOT EXISTS productos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT    NOT NULL,
  descripcion_corta TEXT,
  descripcion_larga TEXT,
  precio           NUMERIC(10,2) NOT NULL,
  precio_oferta    NUMERIC(10,2),
  imagen_url       TEXT,
  categoria_id     UUID REFERENCES categorias(id) ON DELETE SET NULL,
  stock            INT     NOT NULL DEFAULT 0,
  activo           BOOLEAN NOT NULL DEFAULT true,
  destacado        BOOLEAN NOT NULL DEFAULT false,
  orden            INT     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productos_activo   ON productos(activo);
CREATE INDEX IF NOT EXISTS idx_productos_destacado ON productos(destacado);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);


/* ── Pedidos (reserva temporal, Opción B) ── */
CREATE TABLE IF NOT EXISTS pedidos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  productos_json JSONB NOT NULL,            -- snapshot del carrito al momento del pedido
  nombre_cliente TEXT NOT NULL,
  telefono       TEXT NOT NULL,
  modalidad      TEXT NOT NULL DEFAULT 'envio',  -- 'envio' | 'retiro'
  direccion      TEXT,                       -- solo si modalidad = 'envio'
  notas          TEXT,
  total          NUMERIC(10,2) NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'confirmado' | 'rechazado'
  expires_at     TIMESTAMPTZ NOT NULL,       -- created_at + tiempo_reserva_horas
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado   ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_expires  ON pedidos(expires_at);


/* ── Promociones ── */
CREATE TABLE IF NOT EXISTS promociones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  tipo          TEXT NOT NULL DEFAULT 'porcentaje',  -- 'porcentaje' | 'monto_fijo' | '2x1'
  valor         NUMERIC(10,2),
  producto_id   UUID REFERENCES productos(id) ON DELETE CASCADE,
  categoria_id  UUID REFERENCES categorias(id) ON DELETE CASCADE,
  fecha_inicio  TIMESTAMPTZ,
  fecha_fin     TIMESTAMPTZ,
  activo        BOOLEAN NOT NULL DEFAULT true
);


/* ── RLS: habilitar acceso público de lectura ── */
ALTER TABLE config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE promociones  ENABLE ROW LEVEL SECURITY;

-- Lectura pública (catálogo)
CREATE POLICY "public_read_config"      ON config      FOR SELECT USING (true);
CREATE POLICY "public_read_categorias"  ON categorias  FOR SELECT USING (true);
CREATE POLICY "public_read_productos"   ON productos   FOR SELECT USING (true);
CREATE POLICY "public_read_promociones" ON promociones FOR SELECT USING (true);

-- Los clientes pueden crear pedidos (sin autenticación)
CREATE POLICY "public_insert_pedidos" ON pedidos FOR INSERT WITH CHECK (true);

-- El admin (autenticado) puede hacer todo
CREATE POLICY "admin_all_config"      ON config      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_categorias"  ON categorias  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_productos"   ON productos   FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_pedidos"     ON pedidos     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_promociones" ON promociones FOR ALL USING (auth.role() = 'authenticated');


/* ── Vista: stock disponible (descuenta reservas pendientes) ── */
CREATE OR REPLACE VIEW stock_disponible AS
SELECT
  p.id,
  p.nombre,
  p.stock AS stock_real,
  GREATEST(0,
    p.stock - COALESCE(
      (SELECT SUM((item->>'cantidad')::int)
       FROM pedidos pe,
            jsonb_array_elements(pe.productos_json) AS item
       WHERE (item->>'id')::uuid = p.id
         AND pe.estado = 'pendiente'
         AND pe.expires_at > now()),
      0
    )
  ) AS stock_disponible
FROM productos p;

GRANT SELECT ON stock_disponible TO anon, authenticated;

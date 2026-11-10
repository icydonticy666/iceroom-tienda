CREATE TABLE IF NOT EXISTS payment_intents (
  claim TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('mp', 'flow')),
  product_key TEXT NOT NULL,
  amount_clp INTEGER NOT NULL,
  email TEXT,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'created',
  payment_id TEXT UNIQUE,
  provider_token TEXT,
  last_reconcile_at INTEGER NOT NULL DEFAULT 0,
  coupon_code TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  referrer TEXT,
  landing_url TEXT,
  fbclid TEXT,
  fbp TEXT,
  fbc TEXT,
  client_ip TEXT,
  user_agent TEXT,
  mp_status_detail TEXT,
  mp_device INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_reservations (
  code TEXT NOT NULL,
  slot INTEGER NOT NULL,
  claim TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'processing', 'pending', 'approved')),
  PRIMARY KEY (code, slot),
  FOREIGN KEY (claim) REFERENCES payment_intents(claim)
);

CREATE TABLE IF NOT EXISTS payment_fulfillments (
  payment_id TEXT PRIMARY KEY,
  claim TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'processing',
  email_sent INTEGER NOT NULL DEFAULT 0,
  capi_sent INTEGER NOT NULL DEFAULT 0,
  refunded INTEGER NOT NULL DEFAULT 0,
  refund_action_required INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (claim) REFERENCES payment_intents(claim)
);

-- Seguimiento de servicios (Plantilla a tu voz, Mezcla + Master), 9-nov-2026.
-- Un proyecto por compra: UNIQUE(origen, pago) evita duplicados si el aviso de pago llega dos veces.
CREATE TABLE IF NOT EXISTS proyectos (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  token_sal TEXT NOT NULL,
  servicio TEXT NOT NULL,
  producto TEXT NOT NULL,
  email TEXT NOT NULL,
  nombre TEXT,
  origen TEXT NOT NULL,
  pago TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'esperando_material',
  rondas_usadas INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  vence_en TEXT,
  prueba INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (origen, pago)
);
CREATE INDEX IF NOT EXISTS proyectos_email ON proyectos (email);
CREATE INDEX IF NOT EXISTS proyectos_estado ON proyectos (estado);

CREATE TABLE IF NOT EXISTS proyecto_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id TEXT NOT NULL,
  quien TEXT NOT NULL,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL,
  texto TEXT,
  enlace TEXT,
  creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
);
CREATE INDEX IF NOT EXISTS proyecto_eventos_proyecto ON proyecto_eventos (proyecto_id, id);
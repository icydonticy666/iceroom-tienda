ALTER TABLE payment_intents ADD COLUMN coupon_code TEXT;

CREATE TABLE IF NOT EXISTS coupon_reservations (
  code TEXT NOT NULL,
  slot INTEGER NOT NULL,
  claim TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'processing', 'pending', 'approved')),
  PRIMARY KEY (code, slot),
  FOREIGN KEY (claim) REFERENCES payment_intents(claim)
);

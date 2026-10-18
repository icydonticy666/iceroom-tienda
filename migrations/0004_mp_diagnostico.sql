-- Motivo de MP (status_detail) y si el pago llevó device ID: para medir los rechazos por riesgo.
ALTER TABLE payment_intents ADD COLUMN mp_status_detail TEXT;
ALTER TABLE payment_intents ADD COLUMN mp_device INTEGER;

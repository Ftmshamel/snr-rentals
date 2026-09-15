-- ============================================================
-- S&R Rentals — Supabase Schema
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

CREATE TABLE bookings (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id           TEXT UNIQUE NOT NULL,
  submitted_at          TIMESTAMPTZ,

  -- Renter info
  full_name             TEXT NOT NULL,
  facebook_profile_link TEXT,
  facebook_account_name TEXT,
  contact_number        TEXT,
  complete_address      TEXT,

  -- Trip details
  type_of_trip          TEXT,
  specific_destination  TEXT,
  pick_up_date          DATE NOT NULL,
  pick_up_time          TIME,
  return_date           DATE NOT NULL,
  return_time           TIME,
  preferred_mode        TEXT,
  preferred_camera      TEXT NOT NULL,

  -- Financial & status
  rental_fee            NUMERIC(10, 2),
  security_deposit      NUMERIC(10, 2),
  total_payable_before_release NUMERIC(10, 2),
  half_day_late         BOOLEAN DEFAULT false,
  half_day_early        BOOLEAN DEFAULT false,
  status                TEXT NOT NULL DEFAULT 'pending',

  -- Signed rental contract (captured on the public booking site)
  contract_camera        TEXT,
  contract_terms         TEXT[],
  renter_e_signature     TEXT,
  e_signature_date       TIMESTAMPTZ,

  -- Consent (NULL = pre-dates this requirement)
  data_privacy_consent  BOOLEAN,
  terms_consent         BOOLEAN,

  -- Document file IDs (Google Drive)
  gov_id_1              TEXT,
  gov_id_2              TEXT,
  proof_of_billing      TEXT,
  selfie_with_id        TEXT,
  proof_of_downpayment  TEXT,

  -- Admin notes
  notes                 TEXT,
  downpayment_paid      NUMERIC(10, 2),

  -- Fulfillment: NULL = not picked up, 'out' = picked up, 'returned' = back
  fulfillment_status    TEXT,

  -- Metadata
  source                TEXT DEFAULT 'google_form',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE booking_addons (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  addon_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_bookings_pick_up_date     ON bookings (pick_up_date);
CREATE INDEX idx_bookings_status           ON bookings (status);
CREATE INDEX idx_bookings_preferred_camera ON bookings (preferred_camera);
CREATE INDEX idx_booking_addons_booking    ON booking_addons (booking_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Migration (run in Supabase SQL Editor if upgrading an existing database):
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS downpayment_paid NUMERIC(10, 2);
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS fulfillment_status TEXT;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS security_deposit NUMERIC(10, 2);
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_payable_before_release NUMERIC(10, 2);
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_camera TEXT;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contract_terms TEXT[];
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS renter_e_signature TEXT;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS e_signature_date TIMESTAMPTZ;

-- ── Expenses ──────────────────────────────────────────────────────────────────

CREATE TABLE expenses (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  amount      NUMERIC(10, 2) NOT NULL,
  description TEXT NOT NULL,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_date ON expenses (date);

-- Migration for existing databases:
-- CREATE TABLE IF NOT EXISTS expenses (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   amount NUMERIC(10, 2) NOT NULL,
--   description TEXT NOT NULL,
--   date DATE NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date);

-- ── Date Notes ────────────────────────────────────────────────────────────────

CREATE TABLE date_notes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date       DATE UNIQUE NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_date_notes_date ON date_notes (date);

-- Migration for existing databases:
-- CREATE TABLE IF NOT EXISTS date_notes (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   date DATE UNIQUE NOT NULL,
--   note TEXT NOT NULL DEFAULT '',
--   updated_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS idx_date_notes_date ON date_notes (date);

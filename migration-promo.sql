-- 1. Add promo_price to products
ALTER TABLE products ADD COLUMN promo_price INTEGER;

-- 2. Create promo_codes table
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  status BOOLEAN DEFAULT true,
  expiry_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create settings table for announcement
CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  is_active BOOLEAN DEFAULT false,
  show_timer BOOLEAN DEFAULT false,
  timer_duration INTEGER DEFAULT 60,
  text TEXT,
  promo_code TEXT,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  is_top_banner BOOLEAN DEFAULT true,
  show_popup BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS timer_unit TEXT DEFAULT 'hours';

-- Insert initial setting for announcement
INSERT INTO settings (id, is_active, show_timer, timer_duration, text, promo_code, is_top_banner)
VALUES ('announcement', false, true, 60, 'Use promo code RAAG to get exclusive discount on your favourite design', 'RAAG', true)
ON CONFLICT (id) DO NOTHING;

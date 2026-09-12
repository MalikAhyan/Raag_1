-- Migration: inventory and stock movement tables
-- Run this SQL on your Supabase database (e.g., via Supabase SQL editor or CLI)

-- Table to store each variant's inventory
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  size TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Index for fast lookup during order processing
CREATE INDEX IF NOT EXISTS idx_inventory_product_variant ON inventory(product_id, color, size);

-- Table to log every stock change
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  change_quantity INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  change_type TEXT NOT NULL, -- e.g., 'adjustment', 'order', 'cancellation', 'restock'
  reason TEXT,
  related_order_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Function to safely deduct stock atomically and record movement
CREATE OR REPLACE FUNCTION deduct_stock(p_inventory_id UUID, p_qty INTEGER, p_order_id TEXT, p_reason TEXT DEFAULT 'Order deduction')
RETURNS VOID AS $$
DECLARE
  v_current_stock INTEGER;
BEGIN
  SELECT stock INTO v_current_stock FROM inventory WHERE id = p_inventory_id FOR UPDATE;
  IF v_current_stock IS NULL THEN
    RAISE EXCEPTION 'Inventory record not found';
  END IF;
  IF v_current_stock < p_qty THEN
    RAISE EXCEPTION 'Insufficient stock: available %', v_current_stock;
  END IF;
  UPDATE inventory SET stock = stock - p_qty, updated_at = now() WHERE id = p_inventory_id;
  INSERT INTO stock_movements (inventory_id, change_quantity, previous_quantity, new_quantity, change_type, reason, related_order_id)
  VALUES (p_inventory_id, -p_qty, v_current_stock, v_current_stock - p_qty, 'order', p_reason, p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely restore stock on order cancellation (idempotent)
CREATE OR REPLACE FUNCTION restore_stock(p_inventory_id UUID, p_qty INTEGER, p_order_id TEXT, p_reason TEXT DEFAULT 'Order cancellation')
RETURNS VOID AS $$
DECLARE
  v_current_stock INTEGER;
  v_exists INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_exists FROM stock_movements
  WHERE inventory_id = p_inventory_id AND related_order_id = p_order_id AND change_type = 'order' AND change_quantity = -p_qty;
  IF v_exists = 0 THEN
    RETURN; -- no prior deduction, nothing to restore
  END IF;
  SELECT stock INTO v_current_stock FROM inventory WHERE id = p_inventory_id FOR UPDATE;
  UPDATE inventory SET stock = stock + p_qty, updated_at = now() WHERE id = p_inventory_id;
  INSERT INTO stock_movements (inventory_id, change_quantity, previous_quantity, new_quantity, change_type, reason, related_order_id)
  VALUES (p_inventory_id, p_qty, v_current_stock, v_current_stock + p_qty, 'cancellation', p_reason, p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- End of migration

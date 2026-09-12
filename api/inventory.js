// api/inventory.js
// Inventory management API (Supabase backend)
// Provides CRUD for inventory records and stock adjustments.

const supabase = require('./_supabase');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const method = String(req.method || '').toUpperCase();

  // ---------- GET: list inventory with filters ----------
  if (method === 'GET' && !req.url.includes('/history/') && !req.url.includes('/dashboard')) {
    const { product_id, sku, color, size, status } = req.query || {};
    // If history_id is provided, return stock movements for that inventory item
    if (req.query && req.query.history_id) {
      const { data: moves, error: mErr } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('inventory_id', req.query.history_id)
        .order('created_at', { ascending: false });
      if (mErr) return res.status(500).json({ error: mErr.message });
      return res.status(200).json(moves);
    }

    let query = supabase.from('inventory').select('*');
    if (product_id) query = query.eq('product_id', product_id);
    if (sku) query = query.eq('sku', sku);
    if (color) query = query.eq('color', color);
    if (size) query = query.eq('size', size);
    const { data, error } = await query.order('product_id', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ---------- POST: create inventory record ----------
  if (method === 'POST') {
    const { productId, sku, color, size, stock, lowStockThreshold } = req.body || {};
    if (!productId || !sku || !color || !size) {
      return res.status(400).json({ error: 'Missing required fields (productId, sku, color, size)' });
    }
    const dbRec = {
      product_id: productId,
      sku,
      color,
      size,
      stock: stock || 0,
      low_stock_threshold: lowStockThreshold || 5,
    };
    const { data, error } = await supabase.from('inventory').insert([dbRec]).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // ---------- PUT: adjust stock (increase, decrease, set) ----------
  if (method === 'PUT') {
    const { id, action, quantity, reason } = req.body || {};
    if (!id || !action || typeof quantity !== 'number') {
      return res.status(400).json({ error: 'Missing id, action, or quantity' });
    }
    const { data: inv, error: fetchErr } = await supabase.from('inventory').select('stock, low_stock_threshold').eq('id', id).single();
    if (fetchErr) return res.status(404).json({ error: 'Inventory record not found' });

    let newStock;
    if (action === 'increase') newStock = inv.stock + quantity;
    else if (action === 'decrease') newStock = inv.stock - quantity;
    else if (action === 'set') newStock = quantity;
    else return res.status(400).json({ error: 'Invalid action' });

    if (newStock < 0) return res.status(400).json({ error: 'Resulting stock cannot be negative' });

    const { data: updated, error: updErr } = await supabase.from('inventory').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', id).select();
    if (updErr) return res.status(500).json({ error: updErr.message });

    const changeQty = newStock - inv.stock; // positive for increase, negative for decrease
    await supabase.from('stock_movements').insert([
      {
        inventory_id: id,
        change_quantity: changeQty,
        previous_quantity: inv.stock,
        new_quantity: newStock,
        change_type: action,
        reason: reason || null,
        related_order_id: null,
      },
    ]);

    return res.status(200).json(updated);
  }

  // ---------- GET history for a specific inventory id ----------
  if (method === 'GET' && req.url.startsWith('/api/inventory/history/')) {
    const parts = req.url.split('/');
    const invId = parts[parts.length - 1];
    const { data, error } = await supabase.from('stock_movements').select('*').eq('inventory_id', invId).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ---------- GET dashboard stats ----------
  if (method === 'GET' && req.url.startsWith('/api/inventory/dashboard')) {
    const { data: all, error } = await supabase.from('inventory').select('stock, low_stock_threshold');
    if (error) return res.status(500).json({ error: error.message });
    let totalUnits = 0;
    let lowStock = 0;
    let outOfStock = 0;
    all.forEach(i => {
      totalUnits += i.stock;
      if (i.stock === 0) outOfStock++;
      else if (i.stock <= i.low_stock_threshold) lowStock++;
    });
    const recentMovements = await supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(10);
    return res.status(200).json({ totalUnits, lowStock, outOfStock, recentMovements: recentMovements.data });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).json({ error: `Method ${method} Not Allowed` });
};

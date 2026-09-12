const supabase = require('./_supabase');

async function deleteOrderById(res, id) {
  if (!id) return res.status(400).json({ error: 'Missing order ID' });

  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}

module.exports = async function handler(req, res) {
  const method = String(req.method || '').toUpperCase();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (method === 'GET') {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const formattedData = data.map(o => ({
      orderId: o.id,
      customerName: o.customer_name,
      phone: o.phone,
      email: o.email,
      address: o.address,
      city: o.city,
      province: o.province,
      postalCode: o.postal_code,
      whatsapp: o.whatsapp,
      notes: o.notes,
      items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
      subtotal: o.subtotal,
      deliveryCharges: o.delivery_charges,
      total: o.total,
      paymentMethod: o.payment_method,
      status: o.status,
      createdAt: o.created_at
    }));

    return res.status(200).json(formattedData);
  }

  if (method === 'POST') {
    const o = req.body || {};

    // Hosts often block HTTP DELETE; cancel/delete via POST instead.
    if (o.action === 'delete') {
      return deleteOrderById(res, o.orderId || o.id);
    }

    // Recalculate true totals on backend for security
    let trueSubtotal = 0;
    
    // Check if promo code is valid
    let promoValid = false;
    if (o.promoCode) {
      const { data: promoData } = await supabase.from('promo_codes').select('*').eq('code', o.promoCode).single();
      if (promoData && promoData.status !== false) {
         if (!promoData.expiry_date || new Date(promoData.expiry_date) > new Date()) {
            promoValid = true;
         }
      }
    }

    const items = o.items || [];
    const itemIds = items.map(item => item.productId);
    const { data: productsData } = await supabase.from('products').select('*').in('id', itemIds);
    const productMap = {};
    if (productsData) {
      productsData.forEach(p => productMap[p.id] = p);
    }

    for (let item of items) {
      const p = productMap[item.productId];
      if (p) {
        let priceToUse = p.price;
        if (promoValid && p.promo_price) {
          priceToUse = p.promo_price;
        }
        trueSubtotal += priceToUse * item.qty;
      }
    }

    // Deduct stock for each item using inventory function
    for (let item of items) {
      const { productId, qty, color, size } = item;
      const { data: inv, error: invErr } = await supabase
        .from('inventory')
        .select('id, stock')
        .eq('product_id', productId)
        .eq('color', color)
        .eq('size', size)
        .single();
      if (invErr || !inv) {
        return res.status(400).json({ error: `Inventory not found for product ${productId}` });
      }
      try {
        await supabase.rpc('deduct_stock', {
          p_inventory_id: inv.id,
          p_qty: qty,
          p_order_id: o.orderId,
          p_reason: 'Order placement'
        });
      } catch (e) {
        const msg = e?.message || e?.data?.message || 'Insufficient stock';
        return res.status(400).json({ error: msg });
      }
    }

    const trueTotal = trueSubtotal + (o.deliveryCharges || 0);

    const dbOrder = {
      id: o.orderId,
      customer_name: o.customerName,
      phone: o.phone,
      email: o.email || null,
      address: o.address,
      city: o.city,
      province: o.province,
      postal_code: o.postalCode || null,
      whatsapp: o.whatsapp || null,
      notes: o.notes || null,
      items: JSON.stringify(items),
      subtotal: trueSubtotal,
      delivery_charges: o.deliveryCharges,
      total: trueTotal,
      payment_method: o.paymentMethod || 'Cash on Delivery',
      status: o.status || 'New',
      created_at: o.createdAt || new Date().toISOString()
    };

    const { data, error } = await supabase.from('orders').insert([dbOrder]).select();
    if (error) return res.status(500).json({ error: error.message });

    const { data: customers } = await supabase.from('customers').select('*').eq('phone', o.phone);
    if (customers && customers.length > 0) {
      const existing = customers[0];
      await supabase.from('customers').update({
        total_orders: existing.total_orders + 1,
        total_spent: existing.total_spent + o.total,
        name: o.customerName,
        city: o.city,
        province: o.province,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
    } else {
      await supabase.from('customers').insert([{
        name: o.customerName,
        phone: o.phone,
        email: o.email || null,
        city: o.city,
        province: o.province,
        total_orders: 1,
        total_spent: o.total
      }]);
    }

    return res.status(201).json(data);
  }

  if (method === 'PUT' || method === 'PATCH') {
    const { orderId, status } = req.body || {};
    if (!orderId || !status) return res.status(400).json({ error: 'Missing orderId or status' });

    // Fetch existing order to handle cancellation logic
    const { data: existingOrder, error: fetchErr } = await supabase.from('orders').select('status, items').eq('id', orderId).single();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });

    // If transitioning to Cancelled and was not cancelled before, restore stock
    if (status === 'Cancelled' && existingOrder.status !== 'Cancelled') {
      const orderItems = typeof existingOrder.items === 'string' ? JSON.parse(existingOrder.items) : existingOrder.items;
      for (let item of orderItems) {
        const { productId, qty, color, size } = item;
        const { data: inv, error: invErr } = await supabase
          .from('inventory')
          .select('id')
          .eq('product_id', productId)
          .eq('color', color)
          .eq('size', size)
          .single();
        if (inv && !invErr) {
          try {
            await supabase.rpc('restore_stock', {
              p_inventory_id: inv.id,
              p_qty: qty,
              p_order_id: orderId,
              p_reason: 'Order cancellation'
            });
          } catch (e) {
            // ignore errors, restoration is idempotent
          }
        }
      }
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (method === 'DELETE') {
    const id = (req.query && (req.query.id || req.query.orderId)) || (req.body && (req.body.id || req.body.orderId));
    return deleteOrderById(res, id);
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  return res.status(405).json({ error: `Method ${method} not allowed` });
};

const supabase = require('./_supabase');

// Helper: strip base64 data URIs from images array to prevent oversized DB writes
function sanitizeImages(images) {
  if (!images) return [];
  let arr = images;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch(e) { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  // Only keep real URLs, strip base64 data URIs
  return arr.filter(img => typeof img === 'string' && img.trim() && !img.startsWith('data:'));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) return res.status(500).json({ error: error.message });
    
    // Parse JSON fields from the DB (sizes, images, etc.) which come as string or arrays
    const formattedData = data.map(p => ({
      ...p,
      sizes: typeof p.sizes === 'string' ? JSON.parse(p.sizes) : p.sizes,
      outOfStockSizes: typeof p.out_of_stock_sizes === 'string' ? JSON.parse(p.out_of_stock_sizes) : p.out_of_stock_sizes,
      bestSeller: p.best_seller,
      soldOut: p.sold_out,
      compareAt: p.compare_at,
      promoPrice: p.promo_price,
      sizeGuide: p.size_guide,
      images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images,
      details: typeof p.details === 'string' ? JSON.parse(p.details) : p.details
    }));
    
    return res.status(200).json(formattedData);
  }

  if (req.method === 'POST') {
    const p = req.body;
    
    const dbProduct = {
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      compare_at: p.compareAt || null,
      promo_price: p.promoPrice || null,
      description: p.description,
      sizes: JSON.stringify(p.sizes || []),
      out_of_stock_sizes: JSON.stringify(p.outOfStockSizes || []),
      best_seller: p.bestSeller || false,
      limited: p.limited || false,
      sold_out: p.soldOut || false,
      edition: p.edition || null,
      details: JSON.stringify(p.details || []),
      size_guide: p.sizeGuide || null,
      shipping: p.shipping || null,
      returns: p.returns || null,
      glyph: p.glyph || null,
      images: JSON.stringify(sanitizeImages(p.images))
    };
    
    const { data, error } = await supabase.from('products').insert([dbProduct]).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const p = req.body;
    const dbProduct = {
      name: p.name,
      category: p.category,
      price: p.price,
      compare_at: p.compareAt || null,
      promo_price: p.promoPrice || null,
      description: p.description,
      sizes: JSON.stringify(p.sizes || []),
      out_of_stock_sizes: JSON.stringify(p.outOfStockSizes || []),
      best_seller: p.bestSeller || false,
      limited: p.limited || false,
      sold_out: p.soldOut || false,
      edition: p.edition || null,
      details: JSON.stringify(p.details || []),
      size_guide: p.sizeGuide || null,
      shipping: p.shipping || null,
      returns: p.returns || null,
      glyph: p.glyph || null,
      images: JSON.stringify(sanitizeImages(p.images)),
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase.from('products').update(dbProduct).eq('id', p.id).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing product ID" });
    
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}

const supabase = require('./_supabase');

module.exports = async function handler(req, res) {
  // Set CORS & Cache-Control headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { productId, imageData, slot } = req.body;
    // imageData = base64 data URI like "data:image/jpeg;base64,/9j/4AAQ..."
    // slot = 0 (front) or 1 (back)

    if (!productId || !imageData) {
      return res.status(400).json({ error: 'Missing productId or imageData' });
    }

    // Extract raw base64 and content type
    const matches = imageData.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid base64 data URI format' });
    }
    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Determine file extension
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const slotName = slot === 1 ? 'back' : 'front';
    const fileName = productId === 'community' 
      ? `community/comm-${Date.now()}.${ext}` 
      : `products/${productId}/${slotName}.${ext}`;

    // Upload to Supabase Storage (bucket: "product-images")
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, buffer, {
        contentType: contentType,
        upsert: true  // Overwrite existing file
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({ error: 'Storage upload failed: ' + uploadError.message });
    }

    // Get public URL with timestamp cache buster so all browsers fetch the new image immediately
    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    const baseUrl = (urlData.publicUrl || '').split('?')[0];
    const publicUrl = `${baseUrl}?v=${Date.now()}`;

    if (productId === 'community') {
      return res.status(200).json({
        success: true,
        url: publicUrl
      });
    }

    // Now update the product's images array in the database
    // First, get the current product
    const { data: productRows, error: fetchErr } = await supabase
      .from('products')
      .select('images')
      .eq('id', productId)
      .single();

    if (fetchErr) {
      console.error('Product fetch error:', fetchErr);
      return res.status(500).json({ error: 'Could not fetch product: ' + fetchErr.message });
    }

    // Parse images
    let images = [];
    if (productRows && productRows.images) {
      if (typeof productRows.images === 'string') {
        try { images = JSON.parse(productRows.images); } catch (e) { images = []; }
      } else if (Array.isArray(productRows.images)) {
        images = productRows.images;
      }
    }

    // Filter out any old base64 data URIs from images (cleanup)
    images = images.map(img => {
      if (typeof img === 'string' && img.startsWith('data:')) return ''; // clear base64
      return img;
    });

    // Ensure array has enough slots
    while (images.length <= (slot || 0)) {
      images.push('');
    }

    // Set the URL at the right slot
    const imageSlot = slot || 0;
    images[imageSlot] = publicUrl;

    // Remove trailing empty strings
    while (images.length > 0 && !images[images.length - 1]) {
      images.pop();
    }

    // Update the product in database
    const { error: updateErr } = await supabase
      .from('products')
      .update({ images: JSON.stringify(images), updated_at: new Date().toISOString() })
      .eq('id', productId);

    if (updateErr) {
      console.error('Product update error:', updateErr);
      return res.status(500).json({ error: 'Database update failed: ' + updateErr.message });
    }

    return res.status(200).json({
      success: true,
      url: publicUrl,
      slot: imageSlot,
      images: images
    });

  } catch (err) {
    console.error('Upload handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};

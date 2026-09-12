const supabase = require('./_supabase');

module.exports = async function handler(req, res) {
  // Disable caching so mobile devices always get latest community posts
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'community')
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }

    if (!data || !data.text) {
      return res.status(200).json([]);
    }

    try {
      const posts = JSON.parse(data.text);
      return res.status(200).json(Array.isArray(posts) ? posts : []);
    } catch(e) {
      return res.status(200).json([]);
    }
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const posts = req.body || [];
    const postsArray = Array.isArray(posts) ? posts : (posts.posts || []);
    
    const dbRecord = {
      id: 'community',
      text: JSON.stringify(postsArray),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('settings').upsert(dbRecord).select();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(postsArray);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing post ID' });

    // Fetch existing posts
    const { data } = await supabase.from('settings').select('text').eq('id', 'community').single();
    let posts = [];
    if (data && data.text) {
      try { posts = JSON.parse(data.text); } catch(e) {}
    }

    posts = posts.filter(p => String(p.id) !== String(id));

    const dbRecord = {
      id: 'community',
      text: JSON.stringify(posts),
      updated_at: new Date().toISOString()
    };

    await supabase.from('settings').upsert(dbRecord);
    return res.status(200).json({ success: true, posts });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};

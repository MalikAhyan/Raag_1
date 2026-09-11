const supabase = require('./_supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'announcement')
      .single();
      
    if (error && error.code !== 'PGRST116') { // PGRST116 is multiple/no rows
        return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data || {});
  }

  if (req.method === 'PUT') {
    const s = req.body;
    const dbSettings = {
      id: 'announcement',
      is_active: s.is_active || false,
      show_timer: s.show_timer || false,
      timer_duration: s.timer_duration !== undefined ? s.timer_duration : 2,
      timer_unit: s.timer_unit || 'hours',
      text: s.text || '',
      promo_code: s.promo_code || '',
      start_date: s.start_date || null,
      end_date: s.end_date || null,
      is_top_banner: s.is_top_banner !== undefined ? s.is_top_banner : true,
      show_popup: s.show_popup || false,
      updated_at: new Date().toISOString()
    };
    
    // Upsert the settings
    const { data, error } = await supabase.from('settings').upsert(dbSettings).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}

const supabase = require('./_supabase');

function toBool(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'on' || s === 'yes';
  }
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'announcement')
      .single();
      
    if (error && error.code !== 'PGRST116') { // PGRST116 is multiple/no rows
        return res.status(500).json({ error: error.message });
    }
    
    if (!data) return res.status(200).json({});

    const sanitized = {
      ...data,
      is_active: toBool(data.is_active),
      show_timer: toBool(data.show_timer),
      timer_duration: typeof data.timer_duration === 'number' ? data.timer_duration : (parseInt(data.timer_duration, 10) || 2),
      timer_unit: data.timer_unit || 'hours',
      is_top_banner: data.is_top_banner !== undefined ? toBool(data.is_top_banner) : true,
      show_popup: toBool(data.show_popup)
    };

    return res.status(200).json(sanitized);
  }

  if (req.method === 'PUT') {
    const s = req.body || {};
    const dbSettings = {
      id: 'announcement',
      is_active: toBool(s.is_active),
      show_timer: toBool(s.show_timer),
      timer_duration: typeof s.timer_duration === 'number' ? s.timer_duration : (parseInt(s.timer_duration, 10) || 2),
      timer_unit: s.timer_unit || 'hours',
      text: s.text || '',
      promo_code: s.promo_code || '',
      start_date: s.start_date || null,
      end_date: s.end_date || null,
      is_top_banner: s.is_top_banner !== undefined ? toBool(s.is_top_banner) : true,
      show_popup: toBool(s.show_popup),
      updated_at: new Date().toISOString()
    };
    
    // Upsert the settings with fallback if schema cache lacks timer_unit
    let { data, error } = await supabase.from('settings').upsert(dbSettings).select();
    if (error && error.message && error.message.includes('timer_unit')) {
      const fallbackSettings = { ...dbSettings };
      delete fallbackSettings.timer_unit;
      const retry = await supabase.from('settings').upsert(fallbackSettings).select();
      data = retry.data;
      error = retry.error;
    }
    if (error) return res.status(500).json({ error: error.message });
    
    const resultData = Array.isArray(data) ? data[0] : (data || dbSettings);
    const sanitizedResult = {
      ...resultData,
      is_active: toBool(resultData.is_active),
      show_timer: toBool(resultData.show_timer),
      timer_unit: resultData.timer_unit || s.timer_unit || 'hours'
    };

    return res.status(200).json(sanitizedResult);
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}

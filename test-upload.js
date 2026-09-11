require('dotenv').config();
const supabase = require('./api/_supabase');

async function testUpload() {
  console.log("Testing Supabase connection...");
  const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  
  console.log("Uploading dummy image...");
  const { data, error } = await supabase.storage
    .from('product-images')
    .upload('test.png', buffer, {
      contentType: 'image/png',
      upsert: true
    });
    
  if (error) {
    console.error("UPLOAD FAILED:", error);
  } else {
    console.log("UPLOAD SUCCESS:", data);
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl('test.png');
    console.log("PUBLIC URL:", urlData.publicUrl);
  }
}

testUpload();

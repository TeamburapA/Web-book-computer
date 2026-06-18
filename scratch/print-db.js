require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  try {
    const { data: settings, error } = await supabase.from('settings').select('*');
    if (error) throw error;
    console.log('Settings in DB:', JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();

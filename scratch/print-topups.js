require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  try {
    const { data: topups, error } = await supabase
      .from('topups')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    console.log('Recent Topups:', JSON.stringify(topups, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();

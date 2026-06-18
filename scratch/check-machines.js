require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  try {
    const { data: machines, error } = await supabase
      .from('machines')
      .select('id, name, tuya_device_id, anydesk_id');
      
    if (error) throw error;
    console.log('Machines in Database:');
    console.log(JSON.stringify(machines, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, role, created_at, credit')
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    console.error('Error fetching users:', error);
  } else {
    data.forEach(u => {
      console.log(`${u.id} | ${u.username} | ${u.role} | credit: ${u.credit} | created: ${u.created_at}`);
    });
  }
}

checkUsers();

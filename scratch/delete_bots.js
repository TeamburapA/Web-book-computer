require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function deleteBots() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, credit')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  const regex = /^[a-zA-Z0-9_\u0E00-\u0E7F]{3,20}$/;
  const bots = users.filter(u => {
    return !regex.test(u.username) || /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(u.username) || /[🔥🚀💀😀🌟]/.test(u.username);
  });

  const botIds = bots.map(b => b.id);
  console.log(`Found ${botIds.length} bot accounts to delete.`);

  if (botIds.length === 0) {
    console.log('No bot accounts found.');
    return;
  }

  const { data, error: delErr } = await supabase
    .from('users')
    .delete()
    .in('id', botIds);

  if (delErr) {
    console.error('Error deleting bots:', delErr);
  } else {
    console.log(`Successfully deleted ${botIds.length} bot accounts from database.`);
  }
}

deleteBots();

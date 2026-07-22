require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkBotDetailsFast() {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  const regex = /^[a-zA-Z0-9_\u0E00-\u0E7F]{3,20}$/;
  const bots = users.filter(u => {
    return !regex.test(u.username) || /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(u.username) || /[🔥🚀💀😀🌟]/.test(u.username);
  });

  console.log(`Found ${bots.length} bot accounts out of ${users.length} total users.`);
  const botIds = bots.map(b => b.id);

  // Batch query rentals & topups
  const { data: rentals } = await supabase.from('rentals').select('user_id').in('user_id', botIds);
  const { data: topups } = await supabase.from('topups').select('user_id').in('user_id', botIds);

  const activeBotUserIds = new Set([
    ...(rentals || []).map(r => r.user_id),
    ...(topups || []).map(t => t.user_id),
    ...bots.filter(b => b.credit > 0).map(b => b.id)
  ]);

  const safeToDelete = bots.filter(b => !activeBotUserIds.has(b.id));

  console.log(`Safe to delete bot accounts: ${safeToDelete.length} / ${bots.length}`);
  if (activeBotUserIds.size > 0) {
    console.log(`⚠️ Active bot user IDs skipped:`, Array.from(activeBotUserIds));
  }
}

checkBotDetailsFast();

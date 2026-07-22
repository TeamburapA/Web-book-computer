require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectBots() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, role, credit, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  console.log(`Total users: ${users.length}`);
  
  // Find accounts created recently (e.g., today) or with non-ascii/emoji/bot-like patterns
  const recent = users.filter(u => new Date(u.created_at) > new Date(Date.now() - 24*3600*1000));
  console.log(`Users created in last 24h: ${recent.length}`);

  const suspicious = users.filter(u => {
    // Check if username has emojis or strange patterns or role is user and credit is 0 with weird username
    return /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(u.username) || u.username.length > 50 || /[🔥🚀💀😀🌟]/.test(u.username);
  });

  console.log(`Suspicious bot users count: ${suspicious.length}`);
  console.log('Sample bot usernames:');
  suspicious.slice(0, 10).forEach(u => console.log(u.id, u.username.substring(0, 30) + '...', u.created_at));
}

inspectBots();

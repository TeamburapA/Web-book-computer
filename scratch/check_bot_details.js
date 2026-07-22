require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkBotDetails() {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  const bots = users.filter(u => {
    // Check if username fails standard regex or contains emojis or suspicious bot patterns
    const regex = /^[a-zA-Z0-9_\u0E00-\u0E7F]{3,20}$/;
    return !regex.test(u.username) || /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(u.username) || /[🔥🚀💀😀🌟]/.test(u.username);
  });

  console.log(`Found ${bots.length} bot accounts out of ${users.length} total users.`);

  let safeToDeleteCount = 0;
  for (const bot of bots) {
    // Check rentals
    const { data: rentals } = await supabase.from('rentals').select('id').eq('user_id', bot.id);
    // Check topups / transactions if table exists
    const { data: topups } = await supabase.from('topups').select('id').eq('user_id', bot.id);

    const hasRentals = rentals && rentals.length > 0;
    const hasTopups = topups && topups.length > 0;
    const hasCredit = bot.credit > 0;

    if (!hasRentals && !hasTopups && !hasCredit) {
      safeToDeleteCount++;
    } else {
      console.log(`⚠️ WARNING: Bot account ${bot.id} (${bot.username}) has credit:${bot.credit}, rentals:${rentals?.length}, topups:${topups?.length}`);
    }
  }

  console.log(`Safe to delete: ${safeToDeleteCount} / ${bots.length}`);
}

checkBotDetails();

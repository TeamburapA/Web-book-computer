const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function dryRun() {
  try {
    console.log('--- Dry Run Bot Identification ---');
    const attackDate = '2026-07-15T00:00:00.000Z';

    // 1. Fetch all users registered on/after Jul 15, 2026
    // Since there are 14,000+ users, we can paginate or fetch in batches,
    // but we can also use SQL queries to verify count directly or fetch batch by batch.
    // Let's query them using direct filters.
    // Wait, to do it efficiently in Javascript:
    // Let's fetch page by page of users matching the timeframe, role='user', credit=0.
    let page = 0;
    const pageSize = 1000;
    let allCandidates = [];
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, created_at')
        .eq('role', 'user')
        .eq('credit', 0)
        .gte('created_at', attackDate)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (data.length === 0) {
        hasMore = false;
      } else {
        allCandidates = allCandidates.concat(data);
        page++;
      }
    }

    console.log(`Found ${allCandidates.length} candidate users registered on/after ${attackDate} with credit=0 and role=user.`);

    // 2. Cross reference with rentals, topups, and chat_rooms to be 100% safe
    // Since we want to ensure none of these users have rentals or topups,
    // we can fetch all user_ids that have rentals
    const { data: rentals, error: rentErr } = await supabase
      .from('rentals')
      .select('user_id');
    if (rentErr) throw rentErr;
    const activeRentalUserIds = new Set(rentals.map(r => r.user_id));
    console.log(`User IDs with rentals: ${activeRentalUserIds.size}`);

    // Fetch all user_ids that have topups
    const { data: topups, error: topupErr } = await supabase
      .from('topups')
      .select('user_id');
    if (topupErr) throw topupErr;
    const activeTopupUserIds = new Set(topups.map(t => t.user_id));
    console.log(`User IDs with topups: ${activeTopupUserIds.size}`);

    // Fetch all user_ids that have chat rooms
    const { data: chats, error: chatErr } = await supabase
      .from('chat_rooms')
      .select('user_id');
    if (chatErr) throw chatErr;
    const activeChatUserIds = new Set(chats.map(c => c.user_id));
    console.log(`User IDs with chats: ${activeChatUserIds.size}`);

    // 3. Filter candidates
    const botsToDelete = allCandidates.filter(u => {
      return !activeRentalUserIds.has(u.id) && 
             !activeTopupUserIds.has(u.id) && 
             !activeChatUserIds.has(u.id);
    });

    const activeUsersSaved = allCandidates.length - botsToDelete.length;

    console.log(`\nResults:`);
    console.log(`- Bots identified for deletion: ${botsToDelete.length}`);
    console.log(`- Legitimate users in the same period saved (due to having rentals/topups/chats): ${activeUsersSaved}`);

    if (botsToDelete.length > 0) {
      console.log(`\nSample bot usernames to delete:`);
      botsToDelete.slice(0, 10).forEach(b => {
        console.log(`- ${b.username} (${b.created_at})`);
      });
    }

  } catch (err) {
    console.error('Dry run failed:', err);
  }
}

dryRun();

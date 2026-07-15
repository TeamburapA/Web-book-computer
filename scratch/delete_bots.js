const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteBots() {
  try {
    console.log('--- Starting Database Cleanup of Bot Accounts ---');
    const attackDate = '2026-07-15T00:00:00.000Z';

    // 1. Fetch candidates first to ensure we know exactly who we are deleting
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

    console.log(`Found ${allCandidates.length} potential bot accounts (credit=0, role=user, created >= ${attackDate}).`);

    // 2. Fetch active relations to exclude them
    const { data: rentals, error: rentErr } = await supabase.from('rentals').select('user_id');
    if (rentErr) throw rentErr;
    const activeRentalUserIds = new Set(rentals.map(r => r.user_id));

    const { data: topups, error: topupErr } = await supabase.from('topups').select('user_id');
    if (topupErr) throw topupErr;
    const activeTopupUserIds = new Set(topups.map(t => t.user_id));

    const { data: chats, error: chatErr } = await supabase.from('chat_rooms').select('user_id');
    if (chatErr) throw chatErr;
    const activeChatUserIds = new Set(chats.map(c => c.user_id));

    // Filter bots to delete
    const botsToDelete = allCandidates.filter(u => {
      return !activeRentalUserIds.has(u.id) && 
             !activeTopupUserIds.has(u.id) && 
             !activeChatUserIds.has(u.id);
    });

    console.log(`Identified ${botsToDelete.length} accounts to delete.`);
    
    if (botsToDelete.length === 0) {
      console.log('No bot accounts identified for deletion. Exiting.');
      return;
    }

    // 3. Delete in batches of 100 to avoid request payload limits or timeout
    const batchSize = 100;
    let deletedCount = 0;

    for (let i = 0; i < botsToDelete.length; i += batchSize) {
      const batch = botsToDelete.slice(i, i + batchSize);
      const batchIds = batch.map(b => b.id);

      const { error: deleteErr } = await supabase
        .from('users')
        .delete()
        .in('id', batchIds);

      if (deleteErr) {
        console.error(`Error deleting batch starting at index ${i}:`, deleteErr);
      } else {
        deletedCount += batch.length;
        console.log(`Successfully deleted ${deletedCount}/${botsToDelete.length} bot accounts...`);
      }
    }

    console.log('\n--- Cleanup Complete ---');
    console.log(`Total bot accounts deleted: ${deletedCount}`);

  } catch (err) {
    console.error('Cleanup process failed:', err);
  }
}

deleteBots();

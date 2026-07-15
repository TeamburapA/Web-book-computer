const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Supabase URL or Service Role Key missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyze() {
  try {
    console.log('--- Analyzing User Database ---');
    
    // 1. Total users count
    const { count: totalUsers, error: countErr } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
      
    if (countErr) throw countErr;
    console.log(`Total Users in DB: ${totalUsers}`);

    // 2. Count users with role='admin' vs 'user'
    const { data: roleCounts, error: roleErr } = await supabase
      .from('users')
      .select('role');
    if (roleErr) throw roleErr;

    const roles = { admin: 0, user: 0 };
    roleCounts.forEach(u => {
      roles[u.role] = (roles[u.role] || 0) + 1;
    });
    console.log(`Role Distribution:`, roles);

    // 3. Let's retrieve registration history
    // Since we might have 14,000+ users, we don't want to load all user details.
    // Instead, let's query users created_at grouped by day/hour using a range.
    // Let's fetch the most recent 100 users to inspect their usernames and created_at timestamps.
    const { data: recentUsers, error: recentErr } = await supabase
      .from('users')
      .select('username, credit, role, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (recentErr) throw recentErr;
    console.log('\n--- 20 Most Recent Registrations ---');
    recentUsers.forEach(u => {
      console.log(`[${u.created_at}] Username: "${u.username}", Credit: ${u.credit}, Role: ${u.role}`);
    });

    // 4. Let's count potential bots
    // Criteria: role='user', credit=0, created_at >= some date (e.g. last 7 days)
    // We will inspect users count created on each day of the last 7 days.
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      
      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDay.toISOString())
        .lt('created_at', endOfDay.toISOString());
        
      if (!error) {
        console.log(`Registered on ${startOfDay.toDateString()}: ${count}`);
      }
    }

    // 5. Let's find how many users have 0 credit, never rented, and never topped up
    // We can fetch user IDs, but fetching 14,000 might exceed the response or memory size.
    // So let's check counts of users with credit > 0.
    const { count: usersWithCredit, error: creditCountErr } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('credit', 0);
      
    if (creditCountErr) throw creditCountErr;
    console.log(`\nUsers with Credit > 0: ${usersWithCredit}`);

    // Count how many rentals exist
    const { count: totalRentals, error: rentCountErr } = await supabase
      .from('rentals')
      .select('*', { count: 'exact', head: true });
    if (rentCountErr) throw rentCountErr;
    console.log(`Total Rentals in DB: ${totalRentals}`);

    // Count how many topups exist
    const { count: totalTopups, error: topupCountErr } = await supabase
      .from('topups')
      .select('*', { count: 'exact', head: true });
    if (topupCountErr) throw topupCountErr;
    console.log(`Total Topups in DB: ${totalTopups}`);

  } catch (err) {
    console.error('Analysis failed:', err);
  }
}

analyze();

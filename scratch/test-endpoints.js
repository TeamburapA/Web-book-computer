const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function test() {
  console.log('--- STARTING PROGRAMMATIC API TESTS ---');
  try {
    // 1. Login to get token
    console.log('Logging in as Team...');
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Team', password: 'gta08865' })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    const token = loginData.token;
    console.log('Login successful. Token obtained.');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Fetch initial summary
    console.log('\nFetching initial financial summary...');
    const summaryRes1 = await fetch(`${BASE_URL}/api/admin/financial-summary`, { headers });
    const summaryData1 = await summaryRes1.json();
    console.log('Initial daily summaries count:', summaryData1.daily?.length || 0);

    // 3. Add a daily electricity cost
    const testDate = '2026-07-01';
    console.log(`\nAdding electricity cost for day ${testDate}...`);
    const addRes = await fetch(`${BASE_URL}/api/admin/electricity-costs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        period_type: 'day',
        period_key: testDate,
        amount: 150.00,
        note: 'ค่าไฟเทสรายวัน'
      })
    });
    const addData = await addRes.json();
    console.log('Add response:', JSON.stringify(addData, null, 2));
    if (!addData.success) throw new Error('Failed to add electricity cost');
    const addedId = addData.record.id;

    // 4. Fetch list of electricity costs
    console.log('\nFetching electricity costs list...');
    const listRes = await fetch(`${BASE_URL}/api/admin/electricity-costs`, { headers });
    const listData = await listRes.json();
    console.log('Electricity costs list:', JSON.stringify(listData.electricity_costs, null, 2));

    // 5. Fetch updated summary and check deduction
    console.log('\nFetching updated financial summary...');
    const summaryRes2 = await fetch(`${BASE_URL}/api/admin/financial-summary`, { headers });
    const summaryData2 = await summaryRes2.json();
    const targetDay = summaryData2.daily.find(d => d.period === testDate);
    console.log(`Financial summary for ${testDate}:`, JSON.stringify(targetDay, null, 2));

    if (targetDay && parseFloat(targetDay.electricity) === 150) {
      console.log('✅ SUCCESS: Electricity cost correctly updated and aggregated in daily summary.');
    } else {
      console.log('❌ FAILURE: Daily summary did not reflect the electricity cost deduction.');
    }

    // 6. Delete the test record
    console.log(`\nDeleting test electricity cost record ID: ${addedId}...`);
    const delRes = await fetch(`${BASE_URL}/api/admin/electricity-costs/${addedId}`, {
      method: 'DELETE',
      headers
    });
    const delData = await delRes.json();
    console.log('Delete response:', JSON.stringify(delData, null, 2));

    // 7. Verify deletion in summary
    console.log('\nVerifying deletion in financial summary...');
    const summaryRes3 = await fetch(`${BASE_URL}/api/admin/financial-summary`, { headers });
    const summaryData3 = await summaryRes3.json();
    const targetDay2 = summaryData3.daily.find(d => d.period === testDate);
    console.log(`Financial summary for ${testDate} after delete:`, JSON.stringify(targetDay2, null, 2));

    if (!targetDay2 || parseFloat(targetDay2.electricity) === 0) {
      console.log('✅ SUCCESS: Electricity cost successfully deleted and profit recalculated.');
    } else {
      console.log('❌ FAILURE: Electricity cost was not cleared after deletion.');
    }

    console.log('\n--- TESTS COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('\n--- TEST RUN ENCOUNTERED ERROR ---');
    console.error(err.message);
  }
}

test();

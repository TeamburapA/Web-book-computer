const fetch = require('node-fetch');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function test() {
  console.log('--- Testing Cloudflare Turnstile Verification API ---');
  
  // Test 1: Verify test keys directly with Cloudflare API (Success case)
  const testSecretPass = '1x0000000000000000000000000000000AA';
  const testResponseTokenPass = '1x00000000000000000000AA';

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(testSecretPass)}&response=${encodeURIComponent(testResponseTokenPass)}`
    });
    const result = await res.json();
    console.log('Cloudflare Direct Verify (Always Pass key): success =', result.success);
    if (result.success) {
      console.log('   Cloudflare Pass test: OK');
    } else {
      console.log('   Cloudflare Pass test: FAILED');
    }
  } catch (err) {
    console.error('Error contacting Cloudflare API:', err);
  }

  // Test 2: Verify test keys directly with Cloudflare API (Failure case)
  const testSecretFail = '2x0000000000000000000000000000000AA';
  const testResponseTokenFail = 'invalid_token_here';

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(testSecretFail)}&response=${encodeURIComponent(testResponseTokenFail)}`
    });
    const result = await res.json();
    console.log('Cloudflare Direct Verify (Always Fail key): success =', result.success);
    if (!result.success) {
      console.log('   Cloudflare Fail test: OK (Rejected correctly)');
    } else {
      console.log('   Cloudflare Fail test: FAILED (Did not reject)');
    }
  } catch (err) {
    console.error('Error contacting Cloudflare API:', err);
  }

  // Now, let's start the actual server on port 3001 and send registrations
  console.log('\n--- Testing local endpoint POST /api/register ---');
  process.env.PORT = '3001';
  
  // Start server.js as a subprocess
  const server = spawn('node', ['server.js'], {
    env: { ...process.env }
  });

  server.stdout.on('data', (data) => {
    // console.log(`Server: ${data}`);
  });

  server.stderr.on('data', (data) => {
    // console.error(`Server Error: ${data}`);
  });

  // Wait 3 seconds for server to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  const usernamesToClean = ['testuser_missing', 'testuser_invalid', 'testuser_valid'];

  try {
    // Scenario A: Missing Token
    const res1 = await fetch('http://localhost:3001/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser_missing',
        password: 'password123'
      })
    });
    const json1 = await res1.json();
    console.log('Scenario A (No token): Status =', res1.status, json1);
    if (res1.status === 400 && json1.error && json1.error.includes('Turnstile Token Missing')) {
      console.log('✅ Success: Rejected correctly due to missing Turnstile token.');
    } else {
      console.log('❌ Failure: Did not reject correctly for missing token.');
    }

    // Scenario B: Valid Token (should pass Turnstile and succeed or fail with duplicate username)
    const res2 = await fetch('http://localhost:3001/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser_valid',
        password: 'password123',
        turnstileToken: '1x00000000000000000000AA' // always pass token
      })
    });
    const json2 = await res2.json();
    console.log('Scenario B (Valid test token): Status =', res2.status, json2.error || 'User registered');
    if (res2.status === 200 || (res2.status === 400 && json2.error && json2.error.includes('ถูกใช้งานแล้ว'))) {
      console.log('✅ Success: Passed Turnstile validation successfully!');
    } else {
      console.log('❌ Failure: Turnstile validation failed unexpectedly.');
    }

  } catch (err) {
    console.error('Testing requests failed:', err);
  } finally {
    // Kill the server process
    server.kill();
    console.log('Test server shut down.');

    // Cleanup database
    console.log('\n--- Cleaning up test accounts from database ---');
    const { data, error } = await supabase
      .from('users')
      .delete()
      .in('username', usernamesToClean);
      
    if (error) {
      console.error('Cleanup failed:', error);
    } else {
      console.log('✅ Test accounts cleaned up successfully.');
    }
  }
}

test();

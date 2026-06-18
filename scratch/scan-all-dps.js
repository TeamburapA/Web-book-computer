require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

const TUYA_HOST = 'https://openapi-sg.iotbing.com'; // Singapore
const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const deviceId = 'a3b9bca14ab5321353fi1k'; // DDC-2

function generateSignature(clientId, secret, t, method, path, body = '', accessToken = '') {
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const str = clientId + accessToken + t + stringToSign;
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

async function getAccessToken() {
  const t = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  const sign = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, t, 'GET', path);

  const res = await fetch(`${TUYA_HOST}${path}`, {
    headers: {
      'client_id': TUYA_CLIENT_ID,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256'
    }
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.msg || 'Token fetch failed');
  }
  return data.result.access_token;
}

async function testCommand(accessToken, code, value) {
  const t = Date.now().toString();
  const path = `/v1.0/devices/${deviceId}/commands`;
  const body = JSON.stringify({ commands: [{ code, value }] });
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = ['POST', contentHash, '', path].join('\n');
  const str = TUYA_CLIENT_ID + accessToken + t + stringToSign;
  const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET).update(str).digest('hex').toUpperCase();

  try {
    const res = await fetch(`${TUYA_HOST}${path}`, {
      method: 'POST',
      headers: {
        'client_id': TUYA_CLIENT_ID,
        'access_token': accessToken,
        't': t,
        'sign': sign,
        'sign_method': 'HMAC-SHA256',
        'Content-Type': 'application/json'
      },
      body
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function run() {
  try {
    const token = await getAccessToken();
    console.log('Got Access Token:', token);

    console.log('Scanning all DP IDs from 1 to 255...');
    
    // We will test in chunks to avoid rate limiting
    const batchSize = 30;
    for (let i = 1; i <= 255; i += batchSize) {
      const promises = [];
      const codes = [];
      
      for (let j = i; j < i + batchSize && j <= 255; j++) {
        const codeStr = j.toString();
        codes.push(codeStr);
        // We will try sending a boolean first
        promises.push(testCommand(token, codeStr, true));
      }
      
      const results = await Promise.all(promises);
      for (let idx = 0; idx < results.length; idx++) {
        const res = results[idx];
        const code = codes[idx];
        
        if (res.code !== 2008) {
          console.log(`FOUND DP ID [${code}] with boolean TRUE:`, JSON.stringify(res));
        }
      }
      
      // Wait 100ms between batches
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log('Scan complete!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();

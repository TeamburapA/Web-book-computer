require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

const TUYA_HOST = 'https://openapi-sg.iotbing.com'; // Singapore
const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const deviceId = 'a3014c53f327dc9a9alfte';

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

async function testCommand(accessToken, deviceId, code, value) {
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
    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function run() {
  try {
    const token = await getAccessToken();
    console.log('Got Access Token:', token);

    const testDPs = [
      // standard switch DPs as numbers and strings
      '1', '2', '3', '4', '5',
      'switch_1', 'switch_2', 'switch_3', 'switch_4',
      'reset', 'RESET', 'restart', 'RESTART',
      'reset_key', 'reset_mode',
      '101', '102', '103', '104', '105'
    ];

    for (const code of testDPs) {
      // test with a boolean true value first
      const result = await testCommand(token, deviceId, code, true);
      if (result.code !== 2008) { // 2008 is "command or value not support"
        console.log(`DP [${code}] with boolean TRUE:`, JSON.stringify(result));
      }
      
      // test with string "force_reset" for potential enums
      const resultStr = await testCommand(token, deviceId, code, 'force_reset');
      if (resultStr.code !== 2008) {
        console.log(`DP [${code}] with string "force_reset":`, JSON.stringify(resultStr));
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();

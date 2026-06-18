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

async function queryEndpoint(accessToken, path) {
  const t = Date.now().toString();
  const sign = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, t, 'GET', path, '', accessToken);

  const res = await fetch(`${TUYA_HOST}${path}`, {
    headers: {
      'client_id': TUYA_CLIENT_ID,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      'access_token': accessToken
    }
  });
  return await res.json();
}

async function run() {
  try {
    const token = await getAccessToken();
    console.log('Got Access Token:', token);

    console.log('\n--- Device Info ---');
    const infoResult = await queryEndpoint(token, `/v1.0/devices/${deviceId}`);
    console.log(JSON.stringify(infoResult, null, 2));

    console.log('\n--- Status ---');
    const statusResult = await queryEndpoint(token, `/v1.0/devices/${deviceId}/status`);
    console.log(JSON.stringify(statusResult, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();

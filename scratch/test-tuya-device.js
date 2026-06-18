require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

const TUYA_REGION_HOSTS = {
  us: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
  sg: 'https://openapi-sg.iotbing.com',
  ue: 'https://openapi-ueaz.tuyaus.com',
  we: 'https://openapi-weaz.tuyaeu.com'
};

const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

const deviceIds = [
  'a3014c53f327dc9a9a1fte', // with number 1
  'a3014c53f327dc9a9alfte'  // with letter l
];

function generateSignature(clientId, secret, t, method, path, body = '', accessToken = '') {
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const str = clientId + accessToken + t + stringToSign;
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

async function getAccessToken(host) {
  const t = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  const sign = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, t, 'GET', path);

  const res = await fetch(`${host}${path}`, {
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

async function getDeviceDetails(host, accessToken, deviceId) {
  const t = Date.now().toString();
  const path = `/v1.0/devices/${deviceId}`;
  const sign = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, t, 'GET', path, '', accessToken);

  const res = await fetch(`${host}${path}`, {
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
  console.log('Testing device ID configurations with Singapore region...');
  for (const [region, host] of Object.entries(TUYA_REGION_HOSTS)) {
    console.log(`\n--- Region: ${region} (${host}) ---`);
    try {
      const token = await getAccessToken(host);
      console.log(`Got access token for ${region}`);
      
      for (const deviceId of deviceIds) {
        console.log(`Querying device ${deviceId}...`);
        const info = await getDeviceDetails(host, token, deviceId);
        console.log(`Result for ${deviceId}:`, JSON.stringify(info));
      }
    } catch (err) {
      console.log(`Failed for region ${region}:`, err.message);
    }
  }
}

run();

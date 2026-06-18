require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

const TUYA_REGION_HOSTS = {
  us: 'https://openapi.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com'
};

const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;

async function testRegion(region, host) {
  const t = Date.now().toString();
  const method = 'GET';
  const path = '/v1.0/token?grant_type=1';
  const contentHash = crypto.createHash('sha256').update('').digest('hex');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const str = TUYA_CLIENT_ID + t + stringToSign;
  const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET)
    .update(str).digest('hex').toUpperCase();

  try {
    const res = await fetch(`${host}${path}`, {
      headers: {
        'client_id': TUYA_CLIENT_ID,
        't': t,
        'sign': sign,
        'sign_method': 'HMAC-SHA256'
      }
    });
    const data = await res.json();
    console.log(`[Region: ${region}] Response:`, JSON.stringify(data));
  } catch (err) {
    console.log(`[Region: ${region}] Error:`, err.message);
  }
}

async function run() {
  for (const [region, host] of Object.entries(TUYA_REGION_HOSTS)) {
    await testRegion(region, host);
  }
}

run();

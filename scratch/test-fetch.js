const fetch = require('node-fetch');

async function test() {
  const voucherHash = '019ee053a67176b25db43c4a2a16d7a46'; // full hash
  const adminPhone = '0957537488';
  
  console.log('Sending request to TrueMoney vouchers redeem endpoint...');
  try {
    const response = await fetch(`https://gift.truemoney.com/campaign/vouchers/${voucherHash}/redeem`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Origin': 'https://gift.truemoney.com',
        'Referer': `https://gift.truemoney.com/campaign/?v=${voucherHash}`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      },
      body: JSON.stringify({
        mobile: adminPhone,
        voucher_hash: voucherHash
      })
    });
    
    console.log('Response Status:', response.status);
    
    const text = await response.text();
    console.log('Response Text:', text);
    
    try {
      const json = JSON.parse(text);
      console.log('Parsed JSON:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Failed to parse as JSON:', e.message);
    }
  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

test();

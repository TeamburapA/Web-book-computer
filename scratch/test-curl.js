const { spawnSync } = require('child_process');

function test() {
  const voucherHash = '019ee053a67176b25db43c4a2a16d7a46'; // example hash
  const adminPhone = '0957537488';
  
  const url = `https://gift.truemoney.com/campaign/vouchers/${voucherHash}/redeem`;
  const body = JSON.stringify({
    mobile: adminPhone,
    voucher_hash: voucherHash
  });
  
  const args = [
    '-s',
    '-X', 'POST',
    '-H', 'Content-Type: application/json',
    '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-d', body,
    url
  ];
  
  console.log('Spawning curl.exe...');
  const result = spawnSync('curl.exe', args, { encoding: 'utf8' });
  
  console.log('Status Code/Exit Code:', result.status);
  if (result.error) {
    console.error('Execution Error:', result.error);
    return;
  }
  
  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
}

test();

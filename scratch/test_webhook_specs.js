const fetch = require('node-fetch');

const webhookUrl = 'https://discord.com/api/webhooks/1522273199243530450/HvxSvbpjZLl7GVogsoQF7c2cEycpA3BNwkjlzn99x84UWNGYO-weTVBc7LoWnFuJOoCE';

async function sendTest() {
  const machine = {
    name: 'CYBER-GAME-02',
    session_end_time: new Date().toISOString(),
    cpu: 'Intel Core i9-14900K',
    ram: '64GB DDR5',
    ssd: '2TB NVMe Gen4',
    gpu: 'NVIDIA RTX 4090 24GB',
    os: 'Windows 11 Pro',
    price_per_hour: 0.00,
    price_per_day: 350.00,
    price_per_week: 2200.00,
    price_per_month: 8000.00,
    allow_daily: true,
    allow_weekly: true,
    allow_monthly: false
  };

  // Format expiration time
  let expiryStr = new Date(machine.session_end_time).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

  // Specs text
  const specs = [];
  if (machine.cpu) specs.push(`• **CPU:** ${machine.cpu}`);
  if (machine.ram) specs.push(`• **RAM:** ${machine.ram}`);
  if (machine.ssd) specs.push(`• **SSD:** ${machine.ssd}`);
  if (machine.gpu) specs.push(`• **GPU:** ${machine.gpu}`);
  if (machine.os) specs.push(`• **OS:** ${machine.os}`);
  const specsText = specs.length > 0 ? specs.join('\n') : 'ไม่ระบุ';

  // Build pricing list
  const prices = [];
  if (machine.price_per_hour !== undefined && machine.price_per_hour !== null && parseFloat(machine.price_per_hour) > 0) {
    prices.push(`• **รายชั่วโมง:** ${parseFloat(machine.price_per_hour).toLocaleString()} บาท`);
  }
  if (machine.allow_daily && machine.price_per_day && parseFloat(machine.price_per_day) > 0) {
    prices.push(`• **รายวัน:** ${parseFloat(machine.price_per_day).toLocaleString()} บาท`);
  }
  if (machine.allow_weekly) {
    const weeklyPrice = parseFloat(machine.price_per_week) > 0 ? parseFloat(machine.price_per_week) : parseFloat(machine.price_per_day || 0) * 7;
    if (weeklyPrice > 0) {
      prices.push(`• **รายสัปดาห์:** ${weeklyPrice.toLocaleString()} บาท`);
    }
  }
  if (machine.allow_monthly) {
    const monthlyPrice = parseFloat(machine.price_per_month) > 0 ? parseFloat(machine.price_per_month) : parseFloat(machine.price_per_day || 0) * 30;
    if (monthlyPrice > 0) {
      prices.push(`• **รายเดือน:** ${monthlyPrice.toLocaleString()} บาท`);
    }
  }
  const priceText = prices.length > 0 ? prices.join('\n') : 'ไม่ระบุ';

  // Embed 1: Expiry
  const embed1 = {
    title: '🔌 แจ้งเตือน: เครื่องหมดเวลาเช่า',
    description: 'คอมเครื่องนี้หมดเวลาเช่าแล้ว และกำลังเคลียข้อมูล',
    color: 16737894, // Crimson Red / Orange (#FF4757)
    fields: [
      {
        name: '🖥️ ชื่อเครื่อง',
        value: `**${machine.name}**`,
        inline: true
      },
      {
        name: '⏰ เวลาที่หมดอายุ',
        value: `\`${expiryStr}\``,
        inline: true
      },
      {
        name: '⚙️ สเปกเครื่อง',
        value: specsText,
        inline: false
      },
      {
        name: '💰 อัตราค่าบริการ',
        value: priceText,
        inline: false
      },
      {
        name: '🔗 เช่าเครื่องต่อได้ที่นี่',
        value: '[คลิกเพื่อเปิดเว็บไซต์ chickDDC.xyz](https://chickDDC.xyz)',
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'ChickDDC System Notification'
    }
  };

  // Embed 2: Available
  const embed2 = {
    title: '✅ แจ้งเตือน: เคลียร์ข้อมูลเสร็จสิ้น',
    description: 'คอมเครื่องนี้แอดมินเคลียข้อมูลเสร็จแล้ว พร้อมให้บริการเช่า',
    color: 3066993, // Green (#2ECC71)
    fields: [
      {
        name: '🖥️ ชื่อเครื่อง',
        value: `**${machine.name}**`,
        inline: true
      },
      {
        name: '⚙️ สเปกเครื่อง',
        value: specsText,
        inline: false
      },
      {
        name: '💰 อัตราค่าบริการ',
        value: priceText,
        inline: false
      },
      {
        name: '🔗 เช่าเครื่องต่อได้ที่นี่',
        value: '[คลิกเพื่อเปิดเว็บไซต์ chickDDC.xyz](https://chickDDC.xyz)',
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'ChickDDC System Notification'
    }
  };

  try {
    // Send 1
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ChickDDC Bot', embeds: [embed1] })
    });
    // Send 2
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ChickDDC Bot', embeds: [embed2] })
    });
    console.log('Spec test webhooks sent successfully!');
  } catch (err) {
    console.error('Error sending spec webhooks:', err);
  }
}

sendTest();

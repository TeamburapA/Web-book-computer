const fetch = require('node-fetch');

const webhookUrl = 'https://discord.com/api/webhooks/1522273199243530450/HvxSvbpjZLl7GVogsoQF7c2cEycpA3BNwkjlzn99x84UWNGYO-weTVBc7LoWnFuJOoCE';

async function sendTest() {
  const machine = {
    name: 'CYBER-GAME-02',
    price_per_hour: 0.00,
    price_per_day: 350.00,
    price_per_week: 2200.00,
    price_per_month: 8000.00,
    allow_daily: true,
    allow_weekly: true,
    allow_monthly: false
  };

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

  const embed = {
    title: '✅ แจ้งเตือน: เคลียร์ข้อมูลเสร็จสิ้น',
    description: 'คอมเครื่องนี้แอดมินเคลียข้อมูลเสร็จแล้ว พร้อมให้บริการเช่า',
    color: 3066993, // Green (#2ECC71)
    fields: [
      {
        name: '🖥️ ชื่อเครื่อง',
        value: `**${machine.name || 'ไม่ทราบชื่อ'}**`,
        inline: true
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

  const payload = {
    username: 'ChickDDC Bot',
    embeds: [embed]
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      console.log('Test webhook 2 (clean) sent successfully!');
    } else {
      console.error('Webhook failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Error sending webhook:', err);
  }
}

sendTest();

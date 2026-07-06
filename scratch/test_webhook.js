const fetch = require('node-fetch');

const webhookUrl = 'https://discord.com/api/webhooks/1522273199243530450/HvxSvbpjZLl7GVogsoQF7c2cEycpA3BNwkjlzn99x84UWNGYO-weTVBc7LoWnFuJOoCE';

async function sendTest() {
  const machine = {
    name: 'CYBER-GAME-02',
    session_end_time: new Date().toISOString(),
    price_per_hour: 0.00, // ไม่มีเช่ารายชั่วโมง
    price_per_day: 350.00,
    price_per_week: 2200.00, // เปิดใช้งาน
    price_per_month: 8000.00,
    allow_daily: true,
    allow_weekly: true,
    allow_monthly: false // ปิดใช้งานรายเดือน
  };

  // Format expiration time
  let expiryStr = 'N/A';
  if (machine.session_end_time) {
    const date = new Date(machine.session_end_time);
    expiryStr = date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  }

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

  const embed = {
    title: '🔌 แจ้งเตือน: เครื่องหมดเวลาเช่า',
    description: 'คอมเครื่องนี้หมดเวลาเช่าแล้ว และกำลังเคลียข้อมูล',
    color: 16737894, // Crimson Red / Orange (#FF4757)
    fields: [
      {
        name: '🖥️ ชื่อเครื่อง',
        value: `**${machine.name || 'ไม่ทราบชื่อ'}**`,
        inline: true
      },
      {
        name: '⏰ เวลาที่หมดอายุ',
        value: `\`${expiryStr}\``,
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
      console.log('Test webhook 1 (clean) sent successfully!');
    } else {
      console.error('Webhook failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Error sending webhook:', err);
  }
}

sendTest();

require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const storage = require('node-persist');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const tips = require('./content');

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Taipei';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

const app = express();

// ─── 儲存格式 ───────────────────────────────────────────────────────
// schedules[groupId] = {
//   startDay: 1,          // 從第幾天開始（你說的「今天是第X天」）
//   sendHour: 9,          // 發送小時
//   sendMinute: 0,        // 發送分鐘
//   startDate: '2024-01-01', // 開始日期 (YYYY-MM-DD，台灣時間)
//   lastSentDay: 0,       // 上次已發送到第幾天
// }

// 暫存：等待使用者輸入時間的群組
// pendingTime[groupId] = { startDay: X }
const pendingTime = {};

// ─── 初始化 storage ──────────────────────────────────────────────────
async function initStorage() {
  await storage.init({ dir: './data/schedules' });
}

async function getSchedules() {
  return (await storage.getItem('schedules')) || {};
}

async function saveSchedules(schedules) {
  await storage.setItem('schedules', schedules);
}

// ─── 發送每日小常識 ──────────────────────────────────────────────────
async function sendDayContent(groupId, dayNum) {
  const tip = tips[dayNum];
  if (!tip) return;

  // LINE 單次 push 最多 5 則訊息，分批發送
  const allMessages = [];

  // 文字訊息
  allMessages.push({
    type: 'text',
    text: `📅 第 ${dayNum} 天健康小常識\n\n${tip.text}`,
  });

  // 多張圖片
  if (tip.images && tip.images.length > 0) {
    for (const imgUrl of tip.images) {
      allMessages.push({
        type: 'image',
        originalContentUrl: imgUrl,
        previewImageUrl: imgUrl,
      });
    }
  }

  // 分批，每批最多 5 則
  const batches = [];
  for (let i = 0; i < allMessages.length; i += 5) {
    batches.push(allMessages.slice(i, i + 5));
  }

  try {
    for (const batch of batches) {
      await client.pushMessage({ to: groupId, messages: batch });
    }
    console.log(`✅ 已發送第 ${dayNum} 天內容（${allMessages.length} 則）到群組 ${groupId}`);
  } catch (err) {
    console.error(`❌ 發送失敗 群組 ${groupId} 第 ${dayNum} 天:`, err.message);
  }
}

// ─── 每分鐘檢查是否有排程需要發送 ──────────────────────────────────
cron.schedule('* * * * *', async () => {
  const now = dayjs().tz(TZ);
  const schedules = await getSchedules();
  let changed = false;

  for (const [groupId, s] of Object.entries(schedules)) {
    const currentHour = now.hour();
    const currentMinute = now.minute();

    // 時間是否符合
    if (currentHour !== s.sendHour || currentMinute !== s.sendMinute) continue;

    // 計算今天是第幾天
    const startDate = dayjs.tz(s.startDate, TZ).startOf('day');
    const today = now.startOf('day');
    const diffDays = today.diff(startDate, 'day');
    const todayDayNum = s.startDay + diffDays;

    // 超過第 10 天就不發了
    if (todayDayNum > 10) continue;

    // 今天已發過了就跳過
    if (s.lastSentDay >= todayDayNum) continue;

    await sendDayContent(groupId, todayDayNum);
    schedules[groupId].lastSentDay = todayDayNum;
    changed = true;
  }

  if (changed) await saveSchedules(schedules);
});

// ─── 解析「今天是第X天」───────────────────────────────────────────────
function parseStartDay(text) {
  const match = text.match(/今天是第\s*(\d+)\s*天/);
  if (match) return parseInt(match[1]);
  return null;
}

// ─── 解析時間輸入 HH:MM ──────────────────────────────────────────────
function parseTime(text) {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

// ─── 發送 Flex：請輸入時間 ────────────────────────────────────────────
async function askForTime(replyToken, startDay) {
  await client.replyMessage({
    replyToken,
    messages: [
      {
        type: 'flex',
        altText: `請輸入每天發送健康小常識的時間`,
        contents: {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🌿 EasyFit 健康計劃',
                color: '#ffffff',
                size: 'sm',
                weight: 'bold',
              },
            ],
            backgroundColor: '#27AE60',
            paddingAll: '15px',
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
              {
                type: 'text',
                text: `✅ 已收到！從第 ${startDay} 天開始`,
                weight: 'bold',
                size: 'md',
                color: '#27AE60',
              },
              {
                type: 'text',
                text: '請輸入每天要發送健康小常識的時間',
                size: 'sm',
                color: '#555555',
                wrap: true,
              },
              {
                type: 'text',
                text: '格式：HH:MM\n例如：09:00 或 20:30',
                size: 'sm',
                color: '#888888',
                wrap: true,
              },
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '直接在群組輸入時間即可 👆',
                size: 'xs',
                color: '#aaaaaa',
                align: 'center',
              },
            ],
          },
        },
      },
    ],
  });
}

// ─── 發送確認訊息 ─────────────────────────────────────────────────────
async function sendConfirmation(replyToken, startDay, hour, minute, endDay) {
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const remainDays = endDay - startDay + 1;

  await client.replyMessage({
    replyToken,
    messages: [
      {
        type: 'flex',
        altText: `已設定！每天 ${timeStr} 發送健康小常識`,
        contents: {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🎉 設定完成！',
                color: '#ffffff',
                size: 'md',
                weight: 'bold',
              },
            ],
            backgroundColor: '#27AE60',
            paddingAll: '15px',
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '⏰ 發送時間', size: 'sm', color: '#555555', flex: 2 },
                  { type: 'text', text: `每天 ${timeStr}`, size: 'sm', color: '#111111', weight: 'bold', flex: 3 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '📅 從第幾天開始', size: 'sm', color: '#555555', flex: 2 },
                  { type: 'text', text: `第 ${startDay} 天`, size: 'sm', color: '#111111', weight: 'bold', flex: 3 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '📆 剩餘天數', size: 'sm', color: '#555555', flex: 2 },
                  { type: 'text', text: `共 ${remainDays} 天`, size: 'sm', color: '#111111', weight: 'bold', flex: 3 },
                ],
              },
              {
                type: 'separator',
              },
              {
                type: 'text',
                text: `今天開始，每天 ${timeStr} 會自動發送健康小常識到此群組 🌿`,
                size: 'xs',
                color: '#888888',
                wrap: true,
              },
            ],
          },
        },
      },
    ],
  });
}

// ─── Webhook 處理 ─────────────────────────────────────────────────────
app.post('/webhook', line.middleware(config), async (req, res) => {
  res.sendStatus(200);

  const events = req.body.events;
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const groupId = event.source.groupId || event.source.roomId;
    if (!groupId) continue; // 只處理群組訊息

    const text = event.message.text.trim();
    const replyToken = event.replyToken;

    // 1. 偵測「今天是第X天」
    const startDay = parseStartDay(text);
    if (startDay !== null && startDay >= 1 && startDay <= 10) {
      pendingTime[groupId] = { startDay };
      await askForTime(replyToken, startDay);
      continue;
    }

    // 2. 如果這個群組正在等待輸入時間
    if (pendingTime[groupId]) {
      const time = parseTime(text);
      if (!time) {
        // 格式錯誤，再提示一次
        await client.replyMessage({
          replyToken,
          messages: [
            {
              type: 'text',
              text: '⚠️ 時間格式不對，請用 HH:MM 格式輸入\n例如：09:00 或 20:30',
            },
          ],
        });
        continue;
      }

      // 設定排程
      const { startDay } = pendingTime[groupId];
      const todayStr = dayjs().tz(TZ).format('YYYY-MM-DD');
      const endDay = 10;

      const schedules = await getSchedules();
      schedules[groupId] = {
        startDay,
        sendHour: time.hour,
        sendMinute: time.minute,
        startDate: todayStr,
        lastSentDay: startDay - 1, // 還沒發過，從 startDay 開始
      };
      await saveSchedules(schedules);

      delete pendingTime[groupId];

      await sendConfirmation(replyToken, startDay, time.hour, time.minute, endDay);
      continue;
    }

    // 3. 停止指令
    if (text === '停止發送' || text === '停止') {
      const schedules = await getSchedules();
      if (schedules[groupId]) {
        delete schedules[groupId];
        await saveSchedules(schedules);
        await client.replyMessage({
          replyToken,
          messages: [{ type: 'text', text: '✅ 已停止此群組的健康小常識發送。' }],
        });
      }
      continue;
    }

    // 4. 查詢狀態
    if (text === '發送狀態' || text === '狀態') {
      const schedules = await getSchedules();
      const s = schedules[groupId];
      if (!s) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: 'text', text: '此群組目前沒有進行中的健康計劃。\n輸入「今天是第X天」來開始！' }],
        });
      } else {
        const timeStr = `${String(s.sendHour).padStart(2, '0')}:${String(s.sendMinute).padStart(2, '0')}`;
        await client.replyMessage({
          replyToken,
          messages: [{
            type: 'text',
            text: `📊 目前發送狀態\n⏰ 時間：每天 ${timeStr}\n📅 開始天數：第 ${s.startDay} 天\n✅ 已發送到：第 ${s.lastSentDay} 天\n🔜 下一次：第 ${s.lastSentDay + 1} 天`,
          }],
        });
      }
      continue;
    }
  }
});

// ─── 健康檢查 ─────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('EasyFit LINE Bot is running! 🌿'));

// ─── 啟動 ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initStorage().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 EasyFit LINE Bot 啟動中，Port: ${PORT}`);
  });
});

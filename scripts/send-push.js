#!/usr/bin/env node
/**
 * 手動發推播 CLI
 *
 * 範例：
 *   # 發公告給所有人
 *   node scripts/send-push.js announce "新主題上架" "琉璃主題現在開放免費試用"
 *
 *   # 發給特定 user（多人逗號分隔）
 *   node scripts/send-push.js announce "標題" "內容" --user=abc-uuid,def-uuid
 *
 *   # silent push 觸發 widget reload（給所有 stock widget）
 *   node scripts/send-push.js silent --kind=StockWidget
 *
 *   # 列裝置數量
 *   node scripts/send-push.js stats
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../server/config/db');
const DeviceToken = require('../server/models/DeviceToken');
const { sendAnnouncement, sendSilentPush, shutdown } = require('../server/services/apns');

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v ?? true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

async function resolveTokensByUsers(userIds) {
  const list = userIds.split(',').map(s => s.trim()).filter(Boolean);
  const docs = await DeviceToken.find({
    userId: { $in: list },
    enabled: true,
    invalidatedAt: null,
  }).select('deviceToken').lean();
  return docs.map(d => d.deviceToken);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));

  await connectDB();

  try {
    if (cmd === 'announce') {
      const title = args._[0];
      const body = args._[1];
      if (!title || !body) {
        console.error('Usage: send-push.js announce "<title>" "<body>" [--user=uuid1,uuid2]');
        process.exit(1);
      }

      const deviceTokens = args.user ? await resolveTokensByUsers(args.user) : undefined;
      console.log(`Sending announcement: "${title}"`);
      console.log(`  body: "${body}"`);
      console.log(`  target: ${deviceTokens ? deviceTokens.length + ' specific tokens' : 'all enabled devices'}`);

      const result = await sendAnnouncement({ title, body, deviceTokens });
      console.log('Result:', JSON.stringify(result, null, 2));

    } else if (cmd === 'silent') {
      const widgetKind = args.kind || undefined;
      const deviceTokens = args.user ? await resolveTokensByUsers(args.user) : undefined;
      console.log(`Sending silent push (widgetKind=${widgetKind || 'all'})`);
      const result = await sendSilentPush({ widgetKind, deviceTokens });
      console.log('Result:', JSON.stringify(result, null, 2));

    } else if (cmd === 'stats') {
      const total = await DeviceToken.countDocuments({ invalidatedAt: null, enabled: true });
      const invalidated = await DeviceToken.countDocuments({ invalidatedAt: { $ne: null } });
      const recent = await DeviceToken.find({ invalidatedAt: null })
        .sort({ updatedAt: -1 }).limit(5).select('userId appVersion updatedAt').lean();
      console.log(`Active tokens: ${total}`);
      console.log(`Invalidated:   ${invalidated}`);
      console.log('Recent registrations:');
      recent.forEach(r => console.log(`  ${r.userId || '(no userId)'} v${r.appVersion || '?'} @ ${r.updatedAt.toISOString()}`));

    } else {
      console.error('Commands: announce | silent | stats');
      process.exit(1);
    }
  } finally {
    shutdown();
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

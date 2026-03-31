/**
 * 重新整理 R2 上的 icon 分類，讓 R2 路徑與 icon-web 前端顯示一致
 * 用法：node scripts/reorganize-r2-icons.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const ICONS_DIR = path.resolve(__dirname, '../../icon-api/icon-web/dist/categories');
const BUCKET = process.env.R2_BUCKET_NAME;

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// 跟 App.jsx 的 ITEM_CATEGORY_OVERRIDES 完全一致
const OVERRIDES = {
  ai_sparkles: "介面",
  chevron_down: "介面",
  chevron_up: "介面",
  link_copy: "介面",
  loading_spinner: "介面",
  memo_note: "介面",
  menu_list: "介面",
  search: "介面",
  share: "介面",
  add_trip_wand: "行程功能",
  checkmark_circle: "行程功能",
  clock: "行程功能",
  time_afternoon: "行程功能",
  time_all_day: "行程功能",
  time_custom: "行程功能",
  time_evening: "行程功能",
  time_forenoon: "行程功能",
  time_morning: "行程功能",
  time_noon: "行程功能",
  bell: "行程功能",
  bookmark: "行程功能",
  info: "行程功能",
  refresh: "行程功能",
  beach_umbrella_palm: "旅遊",
  location_pin: "旅遊",
  map_pin_count_badge: "旅遊",
  map_with_pin: "旅遊",
  compass: "旅遊",
  map_layers: "旅遊",
  navigation_arrow: "旅遊",
  suitcase: "配件",
  chevron_left: "介面",
  chevron_right: "介面",
  download_to_tray: "介面",
  drag_handle: "介面",
  edit_pencil: "介面",
  filter_funnel: "介面",
  plus: "介面",
  trash_bin: "介面",
  edit: "介面",
  heart: "介面",
  minus: "介面",
  more: "介面",
  settings: "介面",
  sort: "介面",
  star: "介面",
  upload: "介面",
  手機: "3C電力",
  行動電源: "3C電力",
  回程提醒事項: "旅遊",
  指南針: "旅遊",
  當地緊急電話: "旅遊",
  緊急聯絡資訊: "旅遊",
  健保卡: "文件",
  駕照: "文件",
  清單表: "行程功能",
  止痛退燒藥: "健康",
  牙刷: "盥洗",
  牙膏: "盥洗",
  隱眼藥水保養液: "盥洗",
  護唇膏: "盥洗",
  運動服: "衣物",
  洗衣袋: "配件",
  塑膠袋: "配件",
  濕衣物塑膠袋: "配件",
  環保購物袋: "配件",
  筆記本與筆: "配件",
  墨鏡: "配件",
};

async function upload(key, buffer) {
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

async function deleteKey(key) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function listAll(prefix) {
  const keys = [];
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: prefix, ContinuationToken: token,
    }));
    for (const obj of res.Contents || []) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function main() {
  // Step 1: 讀取本地所有 icon，計算新分類
  const categories = fs.readdirSync(ICONS_DIR).filter(f =>
    fs.statSync(path.join(ICONS_DIR, f)).isDirectory()
  );

  const uploads = []; // { newKey, filePath, oldKey }

  for (const origCategory of categories) {
    const dir = path.join(ICONS_DIR, origCategory);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));

    for (const file of files) {
      const name = file.replace(/\.png$/i, '');
      const newCategory = OVERRIDES[name] || origCategory;
      const oldKey = `icons/${origCategory}/${file}`;
      const newKey = `icons/${newCategory}/${file}`;

      uploads.push({
        newKey,
        oldKey: oldKey !== newKey ? oldKey : null,
        filePath: path.join(dir, file),
      });
    }
  }

  // Step 2: 上傳到新路徑
  const moved = [];
  const unchanged = [];

  for (const { newKey, oldKey, filePath } of uploads) {
    const buffer = fs.readFileSync(filePath);
    await upload(newKey, buffer);

    if (oldKey) {
      moved.push({ oldKey, newKey });
      console.log(`  ↗ ${oldKey} → ${newKey}`);
    } else {
      unchanged.push(newKey);
    }
  }

  // Step 3: 刪除舊路徑（只刪有搬移的）
  for (const { oldKey } of moved) {
    await deleteKey(oldKey);
  }

  // Step 4: 清除 R2 上多餘的空分類（已經沒 icon 的舊分類目錄）
  // R2 是 flat key-value，不需要特別刪目錄

  console.log(`\n✅ Done!`);
  console.log(`   ${moved.length} icons moved to new category`);
  console.log(`   ${unchanged.length} icons unchanged`);
  console.log(`   Total: ${uploads.length}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

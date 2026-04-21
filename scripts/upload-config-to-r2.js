/**
 * 上傳 config 文件到 R2（themes.json, version.json）
 * 用法：node scripts/upload-config-to-r2.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function upload(key, buffer, contentType) {
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=3600',
  }));
}

const CONFIG_FILES = ['themes.json', 'banners.json', 'stickers.json', 'artists.json', 'version.json'];

async function deleteKey(key) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function main() {
  // 1. 上傳到 noirly_config/
  console.log('=== 上傳 noirly_config/ ===');
  let uploaded = 0;
  let errors = 0;

  for (const filename of CONFIG_FILES) {
    const key = `noirly_config/${filename}`;
    try {
      const filePath = path.join(__dirname, '..', 'docs/r2_config', filename);
      const buffer = fs.readFileSync(filePath);
      console.log(`📤 上傳 ${key}...`);
      await upload(key, buffer, 'application/json');
      console.log(`✓ ${PUBLIC_URL}/${key}`);
      uploaded++;
    } catch (err) {
      console.error(`✗ ${key}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n上傳完成：${uploaded} 個成功，${errors} 個錯誤`);

  if (errors > 0) {
    console.error('有上傳失敗，中止刪除舊 lumee_config/');
    process.exit(1);
  }

  // 2. 刪除舊 lumee_config/
  console.log('\n=== 刪除舊 lumee_config/ ===');
  let deleted = 0;

  for (const filename of CONFIG_FILES) {
    const key = `lumee_config/${filename}`;
    try {
      console.log(`🗑  刪除 ${key}...`);
      await deleteKey(key);
      console.log(`✓ 已刪除 ${key}`);
      deleted++;
    } catch (err) {
      console.error(`✗ ${key}: ${err.message}`);
    }
  }

  console.log(`\n完成！刪除 ${deleted} 個舊檔案`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

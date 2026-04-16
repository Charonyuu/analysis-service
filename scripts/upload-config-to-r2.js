/**
 * 上傳 config 文件到 R2（themes.json, version.json）
 * 用法：node scripts/upload-config-to-r2.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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

async function main() {
  const files = [
    { path: 'docs/r2_config/themes.json', key: 'lumee_config/themes.json' },
    { path: 'docs/r2_config/banners.json', key: 'lumee_config/banners.json' },
    { path: 'docs/r2_config/stickers.json', key: 'lumee_config/stickers.json' },
    { path: 'docs/r2_config/artists.json', key: 'lumee_config/artists.json' },
    { path: 'docs/r2_config/version.json', key: 'lumee_config/version.json' },
  ];

  let uploaded = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const filePath = path.join(__dirname, '..', file.path);
      const buffer = fs.readFileSync(filePath);
      
      console.log(`📤 上傳 ${file.key}...`);
      await upload(file.key, buffer, 'application/json');
      console.log(`✓ ${PUBLIC_URL}/${file.key}`);
      uploaded++;
    } catch (err) {
      console.error(`✗ ${file.key}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n完成！${uploaded} 個檔案上傳，${errors} 個錯誤`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

/**
 * 上傳 themes.json 到 R2
 * 用法：node scripts/upload-themes-to-r2.js
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
  const themesPath = path.join(__dirname, '../docs/r2_config/themes.json');
  
  try {
    const buffer = fs.readFileSync(themesPath);
    const key = 'config/themes.json';
    
    console.log(`📤 上傳 ${key}...`);
    await upload(key, buffer, 'application/json');
    console.log(`✓ 上傳完成`);
    console.log(`📍 URL: ${PUBLIC_URL}/${key}`);
  } catch (err) {
    console.error('✗ 上傳失敗:', err.message);
    process.exit(1);
  }
}

main();

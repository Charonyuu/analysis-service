/**
 * 上傳 pet sprite assets 到 R2
 * 用法：node scripts/upload-pet-assets-to-r2.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const ASSETS_DIR = path.resolve('/Users/charonyuu/Documents/work-noti/WorkNoti/animal_asset');
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

async function upload(key, buffer) {
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

async function main() {
  const animals = fs.readdirSync(ASSETS_DIR).filter(f =>
    fs.statSync(path.join(ASSETS_DIR, f)).isDirectory()
  );

  console.log(`Found ${animals.length} animals\n`);

  const uploaded = {};

  for (const animal of animals) {
    const animalDir = path.join(ASSETS_DIR, animal);
    const files = fs.readdirSync(animalDir).filter(f => f.endsWith('.png'));
    const safeName = animal.replace(/ /g, '_');

    console.log(`📁 ${animal}`);

    for (const file of files) {
      const filePath = path.join(animalDir, file);
      const buffer = fs.readFileSync(filePath);
      const key = `pets/${safeName}/${file}`;

      try {
        await upload(key, buffer);
        const url = `${PUBLIC_URL}/${key}`;
        console.log(`   ✓ ${file} → ${url}`);
        if (!uploaded[safeName]) uploaded[safeName] = {};
        uploaded[safeName][file.replace('.png', '')] = url;
      } catch (err) {
        console.error(`   ✗ ${file}: ${err.message}`);
      }
    }
  }

  // 輸出 URL map（貼進 Swift 用）
  console.log('\n📋 URL Map:\n');
  console.log(JSON.stringify(uploaded, null, 2));
}

main();

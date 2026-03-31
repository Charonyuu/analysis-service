/**
 * 一次性腳本：把 icon-web/dist/categories/ 裡所有 icon 按分類上傳到 R2
 * 用法：node scripts/upload-icons-to-r2.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const ICONS_DIR = path.resolve(__dirname, '../../icon-api/icon-web/dist/categories');
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
  const categories = fs.readdirSync(ICONS_DIR).filter(f =>
    fs.statSync(path.join(ICONS_DIR, f)).isDirectory()
  );

  console.log(`Found ${categories.length} categories\n`);

  let total = 0;
  let errors = 0;

  for (const category of categories) {
    const categoryDir = path.join(ICONS_DIR, category);
    const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.png'));

    console.log(`📁 ${category} (${files.length} icons)`);

    for (const file of files) {
      const filePath = path.join(categoryDir, file);
      const buffer = fs.readFileSync(filePath);
      const key = `icons/${category}/${file}`;

      try {
        await upload(key, buffer);
        console.log(`   ✓ ${file}`);
        total++;
      } catch (err) {
        console.error(`   ✗ ${file}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log(`\nDone! ${total} uploaded, ${errors} errors.`);
  console.log(`URL: ${PUBLIC_URL}/icons/<category>/<name>.png`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

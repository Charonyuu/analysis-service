# R2 lumee_config 工作流程

## Bucket 結構

```
charonyu-icons/
├── lumee_config/          ← App 讀取的設定檔（本文件的主角）
│   ├── version.json       ← { "version": N }
│   ├── themes.json        ← 所有主題包定義
│   ├── banners.json       ← 探索頁 banner
│   └── stickers.json      ← 所有貼圖定義（含 URL）
│
└── stickers/              ← 貼圖圖片，按主題分資料夾
    ├── nature/            ← 自然元素（愛心、雲朵、月亮…）
    ├── 幽靈/              ← 幽靈貼圖
    ├── 動物們/            ← 全身動物貼圖
    ├── 柴犬/              ← 柴犬主題包
    ├── 貓咪/              ← 貓咪主題包
    └── cuteFaces/         ← 萌萌動物臉（倉鼠、狗、貓…）
```

**Public URL**: `https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/`



---

## 加新主題包的流程
1. 畫好素材，上傳到 R2 stickers/ 底下
2. 編輯 themes.json — 加一筆新的 theme 物件
3. 編輯 stickers.json — 加新貼圖
4. 編輯 banners.json — 加新 banner（可選）
5. 改 version.json → { "version": 2 }
6. 上傳這四個 JSON → 用戶打開 App 自動看到

### Step 1 — 準備素材，上傳圖片到 R2

把圖片放到 `icon-api/stickers/<新主題>/` 然後在 `upload_stickers_to_r2.js` 加一行：

```js
{ dir: 'stickers/<新主題>', prefix: 'stickers/<新主題>/' },
```

跑：
```bash
cd icon-api && node upload_stickers_to_r2.js
```

### Step 2 — 編輯 `docs/r2_config/stickers.json`

加入新貼圖，格式：
```json
{ "id": "<唯一ID>", "name": "顯示名稱", "category": "<主題>", "remoteURL": "https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/stickers/<主題>/<檔名>.png" }
```

### Step 3 — 編輯 `docs/r2_config/themes.json`

加入新主題包物件（含 `bundledStickerIDs`、`coverGradient` 等）。

### Step 4 — 編輯 `docs/r2_config/banners.json`（可選）

加入新 banner 物件，`linkedThemePackID` 指向 themes.json 的 `id`。

### Step 5 — 更新 version.json

```json
{ "version": <目前版本 + 1> }
```

### Step 6 — 上傳 JSON 到 R2

```bash
cd icon-api && node upload_lumee_config.js
```

App 下次打開會自動偵測版本變更並更新。

---

## 上傳腳本

| 腳本 | 用途 |
|------|------|
| `icon-api/upload_lumee_config.js` | 上傳 4 個 lumee_config JSON + copy 圖片到新路徑 |
| `icon-api/upload_stickers_to_r2.js` | 上傳貼圖圖片到 stickers/ |

---

## 確認 URL 可訪問

```
https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/lumee_config/version.json
https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/lumee_config/stickers.json
https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/lumee_config/themes.json
https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/lumee_config/banners.json
```

---

## 目前 stickers 分類對照

| category | R2 路徑 | 說明 |
|----------|---------|------|
| `nature` | `stickers/nature/` | 自然元素 16 個 |
| `ghosts` | `stickers/幽靈/` | 幽靈系列 15 個 |
| `animals` | `stickers/動物們/` | 全身動物 16 個 |
| `pets` | `stickers/柴犬/` + `stickers/貓咪/` | 柴犬 9 個 + 貓咪 8 個 |
| `cuteFaces` | `stickers/cuteFaces/` | 萌臉 8 個 |

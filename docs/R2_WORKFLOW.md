# R2 lumee_config 工作流程

## ⚠️ 每次推 R2 前必做 — version.json

```json
{
  "version": N,                    ← 每次推都 +1
  "stickerCacheVersion": "vN"      ← 有新增/替換貼圖才改，純文字設定不用動
}
```

| 改了什麼 | version | stickerCacheVersion |
|----------|---------|---------------------|
| 主題名稱 / 價格 / features 文字 | +1 | 不動 |
| 新增主題包 / 貼圖包 | +1 | 不動（新圖片會自動下載） |
| Banner 文字 / 連結 | +1 | 不動 |
| 修改現有貼圖圖片（換圖） | +1 | 換新字串 |
| 刪除 / 替換現有貼圖 URL | +1 | 換新字串 |
| Banner 換新圖片 URL | +1 | 不動（banner 用 AsyncImage，不走 sticker cache） |

---


## Bucket 結構

```
charonyu-icons/
├── lumee_config/          ← App 讀取的設定檔（本文件的主角）
│   ├── version.json       ← { "version": N }
│   ├── themes.json        ← 所有主題包定義
│   ├── banners.json       ← 探索頁 banner
│   ├── stickers.json      ← 所有貼圖定義（含 URL）
│   ├── artists.json       ← 插畫家 / 作者資訊（含 social links）
│   └── wallpapers.json    ← 桌布包定義（尚未上線）
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

## 加新主題包的流程（零 code 改動，零審查）

1. 畫好素材 → 上傳圖片到 R2 `stickers/<新主題>/`
2. 編輯 `docs/themes.json` → 加新 theme 物件（含 `colors` 欄位）
3. 編輯 `docs/r2_config/stickers.json` → 加新貼圖
4. 編輯 `docs/r2_config/banners.json` → 加新 banner（可選）
5. 更新 `docs/version.json` → `{ "version": N+1 }`
6. 同步並上傳 → `cp docs/themes.json docs/r2_config/themes.json && cp docs/version.json docs/r2_config/version.json`
7. `cd icon-api && node upload_lumee_config.js`
8. 用戶打開 App → 自動偵測版本變更，看到新主題 + 正確配色 ✨

### Step 1 — 準備素材，上傳圖片到 R2

把圖片放到 `icon-api/stickers/<新主題>/` 然後在 `upload_stickers_to_r2.js` 加一行：

```js
{ dir: 'stickers/<新主題>', prefix: 'stickers/<新主題>/' },
```

跑：
```bash
cd icon-api && node upload_stickers_to_r2.js
```

### Step 2 — 編輯 `docs/themes.json`

加入新主題包物件。**每個 theme 必須帶 `colors` 欄位**，App 會用這組顏色渲染 Widget：

```json
{
  "id": "artist_yuki_pack",
  "name": "Yuki 的夢幻世界",
  "subtitle": "插畫家 Yuki 獨家合作",
  "coinPrice": 50,
  "supportedTypes": ["photo", "weather", "countdown", "daily", "mood", "todo"],
  "coverIcon": "sparkles",
  "coverGradient": ["#E0C3FC", "#8EC5FC"],
  "entitlementKey": "artistYukiUnlocked",
  "petType": "sticker",
  "iconStickers": [
    { "key": "yuki_bunny", "name": "兔兔", "url": "https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/stickers/artist_yuki/bunny.png" },
    { "key": "yuki_bear",  "name": "小熊", "url": "https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/stickers/artist_yuki/bear.png" }
  ],
  "defaultStickerKey": "yuki_bunny",
  "bundledStickerIDs": ["yuki_bunny", "yuki_bear"],
  "sortOrder": 10,
  "isNew": true,
  "artistName": "Yuki (@yuki_art)",
  "artistURL": "https://instagram.com/yuki_art",
  "features": [
    { "icon": "paintbrush.fill", "title": "夢幻水彩風",  "description": "柔和漸層配色" },
    { "icon": "person.fill",     "title": "插畫家合作",  "description": "Yuki 獨家手繪角色" }
  ],
  "colors": {
    "background":      "#F8F0FF",
    "card":            "#F0E6FF",
    "textPrimary":     "#2D1B69",
    "textSecondary":   "#7C5CBF",
    "textTertiary":    "#A78BFA",
    "accent":          "#8B5CF6",
    "buttonForeground":"#FFFFFF",
    "useGlass":        false,
    "borderColors":    ["#E0C3FC", "#8EC5FC"],
    "borderWidth":     1.5,
    "cornerIcon":      "sparkle",
    "cornerIconColors":["#C084FC", "#818CF8"]
  }
}
```

### Step 3 — 編輯 `docs/r2_config/stickers.json`

加入新貼圖，格式：
```json
{ "id": "<唯一ID>", "name": "顯示名稱", "category": "<主題>", "remoteURL": "https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/stickers/<主題>/<檔名>.png" }
```

### Step 4 — 編輯 `docs/r2_config/banners.json`（可選）

加入新 banner 物件，`linkedThemePackID` 指向 themes.json 的 `id`。

### Step 5 — Bump version + 同步 + 上傳

```bash
# 1. 更新 docs/version.json → { "version": N+1 }

# 2. 同步到 r2_config
cp docs/themes.json docs/r2_config/themes.json
cp docs/version.json docs/r2_config/version.json

# 3. 上傳到 R2
cd /path/to/icon-api && node upload_lumee_config.js
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
https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/lumee_config/themes.json
https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/lumee_config/banners.json
https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/lumee_config/stickers.json
https://pub-c54e74352c804aeca33e003f2539764c.r2.dev/lumee_config/artists.json
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

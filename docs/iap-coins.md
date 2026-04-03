# IAP & Coin System — API Documentation

## Base URL
```
https://your-domain.com
```

---

## Public API（iOS App 呼叫）

### POST `/iap/verify`
驗證 iOS StoreKit 購買並發放 coins。此 API 是 **idempotent**（同一筆 transactionId 重複呼叫不會重複發幣）。

**Request**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "transactionId": "100000123456789",
  "productId": "coins_small"
}
```

| 欄位 | 類型 | 說明 |
|------|------|------|
| `userId` | string | iOS app 的 UUID |
| `transactionId` | string | StoreKit `transaction.id` |
| `productId` | string | `coins_small` (60枚) 或 `coins_big` (210枚) |

**Response — 成功**
```json
{
  "success": true,
  "coins": 260
}
```

**Response — 失敗**
```json
{
  "success": false,
  "error": "INVALID_PRODUCT"
}
```

| Error Code | 說明 |
|------------|------|
| `MISSING_FIELDS` | 缺少必要欄位 |
| `INVALID_PRODUCT` | productId 不存在 |
| `INTERNAL_ERROR` | 伺服器錯誤 |

---

### GET `/iap/user/:userId`
取得用戶目前 coin 餘額。

**Response**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "coins": 260
}
```

| Error Code | 說明 |
|------------|------|
| `USER_NOT_FOUND` | 用戶不存在（尚未有任何交易） |

---

### POST `/iap/coupon/redeem`
兌換 coupon code，發放 coins。

**Request**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "code": "WELCOME100"
}
```

**Response — 成功**
```json
{
  "success": true,
  "coins": 360
}
```

**Response — 失敗**
```json
{
  "success": false,
  "error": "ALREADY_USED"
}
```

| Error Code | 說明 |
|------------|------|
| `MISSING_FIELDS` | 缺少 userId 或 code |
| `INVALID_CODE` | 兌換碼不存在 |
| `EXPIRED` | 兌換碼已過期 |
| `LIMIT_REACHED` | 已達使用上限 |
| `ALREADY_USED` | 此用戶已用過 |
| `INTERNAL_ERROR` | 伺服器錯誤 |

---

## Admin API（Dashboard 專用，需 Bearer Token）

所有 admin API 需附帶 Authorization header：
```
Authorization: Bearer <DASHBOARD_SECRET>
```

---

### GET `/api/iap/stats`
取得整體統計數字。

**Response**
```json
{
  "totalUsers": 1024,
  "totalCoinsGranted": 87600,
  "totalTransactions": 420,
  "totalCoupons": 5
}
```

---

### GET `/api/iap/users`
列出所有用戶，依 coins 降冪排列。

**Query Parameters**

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `page` | 0 | 頁碼（從 0 開始） |
| `limit` | 20 | 每頁筆數（最多 100） |

**Response**
```json
{
  "items": [
    {
      "_id": "550e8400-...",
      "coins": 870,
      "createdAt": "2026-04-03T10:00:00.000Z",
      "updatedAt": "2026-04-03T12:30:00.000Z"
    }
  ],
  "total": 1024,
  "page": 0,
  "pageSize": 20
}
```

---

### GET `/api/iap/transactions`
列出購買記錄，依時間降冪排列。

**Query Parameters**

| 參數 | 說明 |
|------|------|
| `userId` | （選填）篩選特定用戶 |
| `page` | 頁碼 |
| `limit` | 每頁筆數 |

**Response**
```json
{
  "items": [
    {
      "_id": "100000123456789",
      "userId": "550e8400-...",
      "productId": "coins_small",
      "coins": 60,
      "createdAt": "2026-04-03T10:00:00.000Z"
    }
  ],
  "total": 420,
  "page": 0,
  "pageSize": 20
}
```

---

### GET `/api/iap/coupons`
列出所有 coupon。

**Response**
```json
{
  "items": [
    {
      "code": "WELCOME100",
      "coins": 100,
      "limit": 1000,
      "usedCount": 42,
      "expireAt": "2026-12-31T23:59:59.000Z",
      "createdAt": "2026-04-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST `/api/iap/coupons`
建立新的 coupon。

**Request**
```json
{
  "code": "SUMMER50",
  "coins": 50,
  "limit": 500,
  "expireAt": "2026-09-01T00:00:00.000Z"
}
```

**Response**
```json
{
  "ok": true,
  "coupon": { ... }
}
```

---

### DELETE `/api/iap/coupons/:code`
刪除 coupon（同時清除使用紀錄）。

```
DELETE /api/iap/coupons/SUMMER50
```

**Response**
```json
{ "ok": true }
```

---

## Product Mapping

| productId | Coins |
|-----------|-------|
| `coins_small` | 60 |
| `coins_big` | 210 |

---

## iOS Integration Flow

```
1. StoreKit.purchase(product)
      ↓
2. 取得 transaction.id
      ↓
3. POST /iap/verify
   { userId, transactionId, productId }
      ↓
4. 收到 { success: true, coins: N }
      ↓
5. 更新 App UI
```

## Coupon Flow

```
1. User 輸入 code
      ↓
2. POST /iap/coupon/redeem
   { userId, code }
      ↓
3. 成功 → { success: true, coins: N }
   失敗 → { success: false, error: "EXPIRED" }
```

---

## Security Notes

- `transactionId` 為 primary key，**同一筆交易絕不會發兩次幣**
- Coins 只由 server 計算，client 不可傳入 coins 數量
- Coupon 使用紀錄用 `(userId, code)` compound unique index 防重複
- Admin API 一律需要 Bearer token 驗證

---

## TODO（未來升級）

- [ ] Apple App Store Server API 驗證（目前為 mock，直接信任 client）
- [ ] JWT auth（取代 DASHBOARD_SECRET）
- [ ] Subscription 訂閱制支援
- [ ] Creator 分潤系統

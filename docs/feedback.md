# Feedback System — API Documentation

## Overview

讓 App / 網站收集用戶回饋，儲存至 MongoDB，並在 Dashboard 管理（標記已讀、刪除）。

---

## Public API

### POST `/api/feedback`
提交一則 feedback，**無需認證**，任何人可呼叫。

**Request**
```json
{
  "site": "my-app",
  "name": "John",
  "email": "john@example.com",
  "message": "This app is great!"
}
```

| 欄位 | 必填 | 上限 | 說明 |
|------|------|------|------|
| `site` | ✅ | 50 字 | 來源識別（App 名稱、網域等） |
| `message` | ✅ | 5000 字 | 回饋內容 |
| `name` | — | 100 字 | 用戶姓名（選填） |
| `email` | — | 200 字 | 用戶 Email（選填） |

**Response — 成功**
```json
{ "ok": true }
```

**Response — 失敗**
```json
{ "ok": false, "error": "site is required" }
{ "ok": false, "error": "message is required" }
```

---

## Admin API（需 Bearer Token）

所有 admin API 需附帶：
```
Authorization: Bearer <DASHBOARD_SECRET>
```

---

### GET `/api/feedback`
列出 feedback，支援分頁與 site 篩選。

**Query Parameters**

| 參數 | 預設值 | 說明 |
|------|--------|------|
| `site` | — | 篩選特定 site |
| `page` | 0 | 頁碼（從 0 開始） |
| `limit` | 20 | 每頁筆數 |

**Response**
```json
{
  "items": [
    {
      "_id": "664f1a2b3c4d5e6f7a8b9c0d",
      "site": "my-app",
      "name": "John",
      "email": "john@example.com",
      "message": "This app is great!",
      "read": false,
      "createdAt": "2026-04-03T10:00:00.000Z"
    }
  ],
  "total": 42,
  "unread": 5,
  "page": 0,
  "pageSize": 20
}
```

---

### PATCH `/api/feedback/:id/read`
將單筆 feedback 標記為已讀。

```
PATCH /api/feedback/664f1a2b3c4d5e6f7a8b9c0d/read
```

**Response**
```json
{ "ok": true }
```

---

### DELETE `/api/feedback/:id`
刪除單筆 feedback。

```
DELETE /api/feedback/664f1a2b3c4d5e6f7a8b9c0d
```

**Response**
```json
{ "ok": true }
```

---

## iOS / Swift 整合範例

```swift
func submitFeedback(message: String, email: String?) async throws {
    let url = URL(string: "https://your-domain.com/api/feedback")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let body: [String: Any] = [
        "site": "my-ios-app",
        "message": message,
        "email": email ?? ""
    ]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (_, response) = try await URLSession.shared.data(for: request)
    // HTTP 201 = success
}
```

---

## Database Schema

```js
{
  site:      String,   // required, indexed
  email:     String,   // default ""
  name:      String,   // default ""
  message:   String,   // required, max 5000
  read:      Boolean,  // default false
  createdAt: Date      // indexed
}
```

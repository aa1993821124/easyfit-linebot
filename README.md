# EasyFit LINE Bot 部署說明

## 📁 檔案說明
- `index.js` — 主程式
- `content.js` — 10天小常識內容（圖片URL在這裡填）
- `.env` — 環境變數（不要上傳到 GitHub！）
- `package.json` — 套件設定

---

## 🖼️ 填入圖片 URL

編輯 `content.js`，把每天的 `imageUrl` 換成你的 Google Drive 圖片連結：

```
圖片分享連結：https://drive.google.com/file/d/【檔案ID】/view
轉換成直接連結：https://drive.google.com/uc?export=view&id=【檔案ID】
```

---

## 🚀 部署到 Render（免費）

### Step 1：上傳到 GitHub
1. 在 GitHub 建立新 repo（例如 `easyfit-linebot`）
2. 把這些檔案上傳（**不要**上傳 `.env` 和 `node_modules`）

### Step 2：在 Render 建立服務
1. 去 https://render.com 登入（用 GitHub 帳號）
2. 點 "New" → "Web Service"
3. 連結你的 GitHub repo
4. 設定：
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Instance Type**: Free

### Step 3：設定環境變數
在 Render 的 "Environment" 頁面加入：
```
LINE_CHANNEL_ACCESS_TOKEN = 你的Token
LINE_CHANNEL_SECRET = 你的Secret
```

### Step 4：設定 LINE Webhook
1. 複製 Render 給你的網址（例如 `https://easyfit-linebot.onrender.com`）
2. 去 LINE Developers → Messaging API
3. Webhook URL 填入：`https://easyfit-linebot.onrender.com/webhook`
4. 開啟 "Use webhook"
5. 關閉 "Auto-reply messages"

---

## 💬 使用方式

把 LINE OA 加入客戶群組後：

| 你說的話 | 機器人動作 |
|---------|---------|
| 今天是第1天 | 詢問發送時間 |
| 09:30 | 確認設定，開始排程 |
| 發送狀態 | 查看目前進度 |
| 停止發送 | 停止此群組的排程 |

---

## ⚠️ 注意事項
- Render 免費版閒置15分鐘會休眠，第一次收到訊息可能慢30秒
- 如果需要準時發送，可升級 Render 付費版（$7/月）或改用 Railway

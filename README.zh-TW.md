# 數位商品交易平台

**語言：** [English](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

一個開源的數位商品交易平台，適用於販售各類可下載商品：設計模板、動態與動畫包、預設集、LUT、外掛、3D 素材、字型、音訊、電子書、課程與軟體授權。

技術棧為 React、Fastify、SQLite 與 TypeScript。內附的 `.motion` 動畫模板是可直接操作的參考範例，而非平台限制——同一套上架、審核、付款、授權與私有下載流程適用於任何數位商品。

![Marketplace](docs/images/market.png)
![Seller Dashboard](docs/images/seller.png)
![Admin Review](docs/images/admin.png)

## 可販售的商品類型

商品上架、授權條款、審核、結帳、購買憑證與下載流程皆與商品類型無關，可用於：

- 動態圖形、動畫預設集與影片模板
- 設計系統、UI Kit 與簡報模板
- 外掛、腳本與開發者工具
- 3D 模型、材質與遊戲素材
- 字型、音效、音樂包與圖庫素材
- 電子書、課程與其他可下載的知識產品

每項商品都以版本化套件發佈，擁有獨立的授權條款、預覽素材、審核紀錄與私有交付檔案。

## 核心功能

### 商品上架與審核

- 支援任意封裝數位商品（包含 `.motion` 與 ZIP）。
- ZIP 中央目錄安全檢查。
- 路徑穿越、絕對路徑、別名、重複項目、符號連結、特殊檔案、可執行檔與腳本偵測。
- 具大小與逾時限制的 Worker 掃描。
- 套件授權解析與衝突偵測。
- 賣家授權證明與 URL 佐證流程。
- 預覽素材審核。
- 基於掃描、授權、證明、預覽、版本與交付狀態的管理員核准關卡。

### 密鑰清除

- 僅掃描文字內容。
- 限制掃描大小與逾時。
- 高風險憑證阻擋。
- 保留 JSON 結構的密鑰替換。
- 與隔離區原始上傳分開產生的脫敏交付 ZIP。
- 密鑰替換為 `[REDACTED_BY_PLATFORM]`。

### Stripe Connect

- Stripe Accounts v2 賣家註冊。
- Express Dashboard 註冊流程。
- Connect 帳號幂等。
- Connect Webhook 簽章驗證。
- 賣家註冊狀態同步。

### 結帳與付款履約

- 伺服器端授權定價。
- Stripe Checkout Sessions 一次性付款。
- Stripe 動態付款方式。
- Stripe Tax `automatic_tax`。
- Checkout 與 Connect Webhook 使用獨立簽章密鑰。
- Raw body Stripe Webhook 簽章驗證。
- 幂等的付款事件收件匣。
- 重複事件保護。
- 付款金額、幣別、metadata 與 PaymentIntent 驗證。
- 原子性的訂單履約與購買憑證建立。

### 購買憑證與私有下載

- 買家專屬的購買憑證中心。
- 每份憑證可下載 10 次。
- 憑證有效期 365 天。
- 五分鐘 HMAC 簽章下載預約。
- 幂等的下載預約鍵。
- 單次使用的下載權杖。
- 原子性的下載次數更新。
- 並行兌換保護。
- 永不向客戶端暴露私有儲存鍵。
- 交付檔案大小與 SHA-256 驗證。
- 下載回應僅回傳脫敏後的 ZIP。

## 介面語言

| 代碼 | 語言 |
| --- | --- |
| `zh-TW` | 繁體中文 |
| `en` | English |
| `ja` | 日本語 |
| `ko` | 한국어 |

新增語言時，請擴充 `apps/web/src/lib/i18n/strings.ts`，並在 `apps/web/src/lib/i18n/i18n.ts` 註冊語言代碼。賣家提供的商品內容與授權條款會以原文顯示，不會自動翻譯。

## 專案狀態

### 已完成

- **M0**：SQLite schema、repository、身分驗證、session、CSRF 防護、退款政策快照與應用層防護。
- **M1**：賣家上傳、ZIP 掃描、密鑰清除、授權解析、證明與預覽審核、管理員核准、脫敏交付檔案產生與公開上架目錄。
- **M2**：Email 驗證基礎、Stripe Connect 註冊、Stripe Checkout、Webhook 履約、付款事件去重、購買憑證、HMAC 下載預約、並行安全的下載兌換與真實脫敏 ZIP 交付。

### 尚未實作

M3 的管理與財務營運功能刻意不包含在此模板中：

- 正式 Email 服務商整合。
- 退款審核流程與 Stripe Refund API 整合。
- 管理員一鍵下架流程。
- 賣家收益與結算看板。
- 其他正式環境營運、報表與會計控制。

這些功能保留給下游專案依自身商業、法律、稅務與會計需求設計與實作。

## 環境需求

- Node.js 24 LTS。
- npm。
- `better-sqlite3` 與 `argon2` 的原生建置支援。
- 用於本機 Webhook 測試的 Stripe CLI。
- 具備 Checkout 與 Connect 權限的 Stripe 測試模式帳號。

## 安裝

```bash
npm ci
```

建立本機環境檔案：

```bash
cp .env.example .env
```

PowerShell：

```powershell
Copy-Item .env.example .env
```

請勿提交 `.env`。

## 資料庫遷移

```bash
npm run db:migrate
```

預設資料庫路徑為 `./var/motion-market.db`。SQLite WAL 附屬檔案會建立在資料庫旁，並已被 Git 忽略。

## 本機開發

同時啟動 API 與前端：

```bash
npm run dev
```

服務位置：

- 前端：<http://localhost:5173>
- API 健康檢查：<http://127.0.0.1:3000/health>

Vite 開發伺服器會將 `/api` 請求代理到本機 Fastify API。

分開啟動：

```bash
npm run dev:api
npm run dev:web
```

預設使用真實 API（`USE_FIXTURES=false`）。Fixtures 僅供本機展示與測試：

```bash
USE_FIXTURES=true npm run dev:web
```

PowerShell：

```powershell
$env:USE_FIXTURES='true'
npm run dev:web
```

## Stripe CLI Webhook 測試

在 `.env` 設定 Stripe 測試密鑰：

```dotenv
STRIPE_SECRET_KEY=sk_test_...
```

啟動 API 後執行：

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

將 CLI 顯示的 `whsec_...` 簽章密鑰填入 `STRIPE_WEBHOOK_SECRET`，然後重新啟動 API。Connect 註冊 Webhook 使用獨立的 `STRIPE_CONNECT_WEBHOOK_SECRET` 與路由：

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe/connect
```

本機開發請僅使用 Stripe 測試卡。Checkout 已啟用 Stripe Tax，但實際稅額取決於 Stripe 帳號的稅務設定、商品稅務配置、客戶所在地與有效稅務登記。稅額為零不代表稅務設定已完成。

更多說明請見 [REAL_STRIPE_TESTING.md](REAL_STRIPE_TESTING.md)。

## 驗證

```bash
npm run typecheck
npm test
npm run build
```

啟動編譯後的 API：

```bash
npm start
```

編譯後的 API 僅提供後端服務。請透過靜態伺服器或反向代理提供 `dist/web`。

## 安全警告

本倉庫是應用程式模板，而非完整的生產部署。上線前請務必：

- 設定正式的 transaction email 服務商。
- 完成商業、稅務與 Webhook 設定後再使用 Stripe Live 模式。
- 全面使用 HTTPS。
- 以獨立產生的密鑰取代開發用 session 與 CSRF 密鑰。
- 將私有儲存置於公開網站根目錄之外。
- 限制資料庫與私有儲存的檔案系統權限。
- 設定備份、監控、速率限制與事件回應流程。
- 就稅務、退款、著作權、授權與交易平台義務諮詢專業人士。
- 不要執行上傳套件中的程式碼，也不要暴露永久私有儲存 URL。
- 不要提交 `.env`、資料庫、上傳檔案、證明文件、ZIP 套件、日誌或建置產物。

## 架構

- `apps/api`：Fastify API、SQLite 遷移、repository、掃描、付款、購買憑證與私有儲存。
- `apps/web`：React 前端與呈現層。
- `packages/shared`：共享領域契約、schema、enum 與時間／金額工具。
- `tests`：M0、M1、M2、repository 與前端契約測試。
- `docs`：架構與 API 說明。
- `fixtures`：僅供非生產展示的 fixtures。

## 授權

本專案以 MIT License 釋出，詳見 [LICENSE](LICENSE)。

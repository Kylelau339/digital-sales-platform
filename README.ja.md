# デジタル商品マーケットプレイス

**言語：** [English](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

あらゆるデジタル商品を販売できるオープンソースのマーケットプレイスです。デザインテンプレート、モーション／アニメーションパック、プリセット、LUT、プラグイン、3D アセット、フォント、オーディオ、電子書籍、コース、ソフトウェアライセンスなどに対応します。

React、Fastify、SQLite、TypeScript で構築されています。同梱の `.motion` アニメーションテンプレートは動作するリファレンスデモであり、制約ではありません。公開、審査、決済、購入権、非公開ダウンロードの同じパイプラインがあらゆるダウンロード可能なデジタル商品に適用できます。

![Marketplace](docs/images/market.png)
![Seller Dashboard](docs/images/seller.png)
![Admin Review](docs/images/admin.png)

## 販売できる商品

出品、ライセンス、モデレーション、チェックアウト、購入権、ダウンロードの各レイヤーは商品の種類に依存しません。次の用途に利用できます。

- モーショングラフィックス、アニメーションプリセット、動画テンプレート
- デザインシステム、UI キット、プレゼンテーションテンプレート
- プラグイン、スクリプト、開発者ツール
- 3D モデル、テクスチャ、ゲームアセット
- フォント、効果音、音楽パック、ストックメディア
- 電子書籍、コース、その他のダウンロード可能な知識商品

各商品はバージョン管理されたパッケージとして公開され、独自のライセンス条件、プレビュー素材、審査記録、非公開の配信ファイルを持ちます。

## 主な機能

### 商品の公開と審査

- 任意のパッケージ化されたデジタル商品（`.motion` および ZIP）のアップロード。
- ZIP セントラルディレクトリの安全性チェック。
- パストラバーサル、絶対パス、エイリアス、重複エントリ、シンボリックリンク、特殊ファイル、実行ファイル、スクリプトの検出。
- サイズとタイムアウトを制限した Worker スキャン。
- パッケージライセンスの解析と競合検出。
- 販売者のライセンス証明と URL 証拠のワークフロー。
- プレビュー素材の審査。
- スキャン、ライセンス、証明、プレビュー、バージョン、配信状態に基づく管理者承認ゲート。

### シークレットの除去

- テキストのみのシークレットスキャン。
- スキャンサイズとタイムアウトの制限。
- 高リスク認証情報のブロック。
- JSON 構造を保持したシークレット置換。
- 隔離された元アップロードとは別に生成されるサニタイズ済み配信 ZIP。
- シークレットは `[REDACTED_BY_PLATFORM]` に置換。

### Stripe Connect

- Stripe Accounts v2 による販売者オンボーディング。
- Express Dashboard オンボーディングフロー。
- Connect アカウントの冪等性。
- Connect Webhook 署名検証。
- 販売者オンボーディング状態の同期。

### チェックアウトと決済履行

- サーバー側のライセンス価格設定。
- Stripe Checkout Sessions による都度払い。
- Stripe の動的決済手段。
- Stripe Tax `automatic_tax`。
- Checkout と Connect で別々の Webhook 署名シークレット。
- Raw body による Stripe Webhook 署名検証。
- 冪等な決済イベント受信箱。
- 重複イベント保護。
- 金額、通貨、metadata、PaymentIntent の検証。
- アトミックな注文履行と購入権の作成。

### 購入権と非公開ダウンロード

- 購入者ごとの購入権ライブラリ。
- 購入権あたり 10 回のダウンロード。
- 購入権の有効期間は 365 日。
- 5 分間有効な HMAC 署名付きダウンロード予約。
- 冪等なダウンロード予約キー。
- 単回使用のダウンロードトークン。
- アトミックなダウンロード回数更新。
- 同時実行される引き換えの保護。
- 非公開ストレージキーをクライアントに公開しない。
- 配信ファイルのサイズと SHA-256 検証。
- ダウンロード応答はサニタイズ済み ZIP のみ。

## インターフェース言語

| コード | 言語 |
| --- | --- |
| `zh-TW` | 繁體中文 |
| `en` | English |
| `ja` | 日本語 |
| `ko` | 한국어 |

言語を追加するには `apps/web/src/lib/i18n/strings.ts` を拡張し、`apps/web/src/lib/i18n/i18n.ts` にロケールコードを登録します。販売者が入力した商品内容とライセンス条件は原文のまま表示され、機械翻訳は行われません。

## プロジェクト状況

### 完了

- **M0**：SQLite スキーマ、リポジトリ、認証、セッション、CSRF 保護、返金ポリシーのスナップショット、アプリケーションガード。
- **M1**：販売者アップロード、ZIP スキャン、シークレット除去、ライセンス解析、証明とプレビューの審査、管理者承認、サニタイズ済み配信ファイル生成、公開カタログ。
- **M2**：メール確認の基盤、Stripe Connect オンボーディング、Stripe Checkout、Webhook 履行、決済イベント重複排除、購入権、HMAC ダウンロード予約、同時実行安全なダウンロード消費、実際のサニタイズ済み ZIP 配信。

### 未実装

M3 の管理・財務運用はこのテンプレートに意図的に含まれていません。

- 本番用メールプロバイダーの統合。
- 返金承認ワークフローと Stripe Refund API の統合。
- 管理者によるワンクリック公開停止。
- 販売者の収益・精算ダッシュボード。
- その他の本番運用、レポート、会計統制。

これらは、各プロジェクトのビジネス、法務、税務、会計要件に応じて設計・実装してください。

## 動作要件

- Node.js 24 LTS。
- npm。
- `better-sqlite3` と `argon2` のネイティブビルドサポート。
- ローカル Webhook テスト用の Stripe CLI。
- Checkout と Connect を利用できる Stripe テストモードアカウント。

## インストール

```bash
npm ci
```

ローカル環境ファイルを作成します。

```bash
cp .env.example .env
```

PowerShell：

```powershell
Copy-Item .env.example .env
```

`.env` はコミットしないでください。

## データベースマイグレーション

```bash
npm run db:migrate
```

既定のデータベースパスは `./var/motion-market.db` です。SQLite WAL のサイドカーファイルはデータベースの隣に作成され、Git では無視されます。

## ローカル開発

API とフロントエンドを同時に起動します。

```bash
npm run dev
```

サービス：

- フロントエンド：<http://localhost:5173>
- API ヘルスチェック：<http://127.0.0.1:3000/health>

Vite 開発サーバーは `/api` リクエストをローカルの Fastify API にプロキシします。

個別に起動する場合：

```bash
npm run dev:api
npm run dev:web
```

既定では実際の API を使用します（`USE_FIXTURES=false`）。Fixtures はローカル表示とテスト専用です。

```bash
USE_FIXTURES=true npm run dev:web
```

PowerShell：

```powershell
$env:USE_FIXTURES='true'
npm run dev:web
```

## Stripe CLI による Webhook テスト

`.env` に Stripe テストシークレットを設定します。

```dotenv
STRIPE_SECRET_KEY=sk_test_...
```

API を起動してから実行します。

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

CLI が表示する `whsec_...` 署名シークレットを `STRIPE_WEBHOOK_SECRET` に設定し、API を再起動します。Connect オンボーディング Webhook は別の `STRIPE_CONNECT_WEBHOOK_SECRET` とルートを使用します。

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe/connect
```

ローカル開発では Stripe のテストカードのみを使用してください。Checkout では Stripe Tax が有効ですが、実際の税額は Stripe アカウントの税設定、商品の税設定、顧客の所在地、有効な税登録に依存します。税額が 0 でも税設定が完了しているとは限りません。

詳細は [REAL_STRIPE_TESTING.md](REAL_STRIPE_TESTING.md) を参照してください。

## 検証

```bash
npm run typecheck
npm test
npm run build
```

ビルド済み API の起動：

```bash
npm start
```

ビルド済み API はバックエンドのみを提供します。`dist/web` は静的サーバーまたはリバースプロキシで配信してください。

## セキュリティ警告

このリポジトリはアプリケーションテンプレートであり、完全な本番デプロイではありません。本番公開前に必ず行ってください。

- 実際のトランザクションメールプロバイダーを設定する。
- ビジネス、税務、Webhook の設定を完了してから Stripe Live モードを使用する。
- すべてを HTTPS にする。
- 開発用の session／CSRF シークレットを独立生成したシークレットに置き換える。
- 非公開ストレージを公開 Web ルートの外に置く。
- データベースと非公開ストレージのファイルシステム権限を制限する。
- バックアップ、監視、レート制限、インシデント対応を設定する。
- 税務、返金、著作権、ライセンス、マーケットプレイス上の義務について専門家に相談する。
- アップロードされたパッケージのコードを実行せず、永続的な非公開ストレージ URL を公開しない。
- `.env`、データベース、アップロード、証明ファイル、ZIP パッケージ、ログ、ビルド成果物をコミットしない。

## アーキテクチャ

- `apps/api`：Fastify API、SQLite マイグレーション、リポジトリ、スキャン、決済、購入権、非公開ストレージ。
- `apps/web`：React フロントエンドとプレゼンテーション層。
- `packages/shared`：共有ドメイン契約、スキーマ、enum、時間／金額ユーティリティ。
- `tests`：M0、M1、M2、リポジトリ、フロントエンド契約テスト。
- `docs`：アーキテクチャと API のメモ。
- `fixtures`：非本番の表示用 fixtures のみ。

## ライセンス

このプロジェクトは MIT License で公開されています。[LICENSE](LICENSE) を参照してください。

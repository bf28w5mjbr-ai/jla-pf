# JLA PF 開発引き継ぎ資料（for GitHub Copilot）

## 0. この資料の目的
本資料は、**GitHub Copilot または新規開発者が、文脈質問なしで JLA PF の開発を継続できる状態**を作るための引き継ぎドキュメントである。

## 1. プロジェクト概要（What / Why）

### プロジェクト名
**JLA PF**（Japan Lifesaving Association Platform）

### 目的
日本ライフセービング協会（JLA）および都道府県協会における
- 会員・所属・資格・大会/講習・決済 を一気通貫で管理する
- **参加資格チェック**と **Stripe Connect による自動分配（PF 10%）** を中核価値とする
- 紙・属人運用を排除し、全国スケール可能な運営基盤を構築する

### MVPのゴール
「オンライン募集〜決済〜台帳が自動で回る」状態を作ること

## 2. 技術スタック（固定）

### フロント / バックエンド
- Next.js 14（App Router）
- TypeScript
- Tailwind CSS
- shadcn/ui（必要に応じて）

### DB / ORM
- PostgreSQL
- Prisma

### 認証
- 自前実装（Cookie内JWT）
- 電話番号ベースの登録フロー（/api/registration/*）
- メール/パスワード登録（/api/auth/register）

### 決済
- Stripe
- Stripe Connect（destination charge）
- `application_fee = 10%` 固定

## 3. 設計思想（重要）

### 絶対に守る前提
1. **PFは金を保持しない**
2. 状態はすべて `status` enum で管理
3. 金額は **JPY / Int**
4. すべての重要操作は **AuditLog** に残す
5. 当日現地運用は対象外（SLA外）

### このプロダクトが「やらないこと」
- 現地受付UI
- リザルト入力
- 紙運用の完全代替
- 広告 / SNS / CMS

## 4. ドメインモデル概要

### コアエンティティ
- **User**（個人）
- **Club**（クラブ）
- **Org**（JLA / 都道府県協会）
- **Membership**（所属）
- **Qualification**（資格）
- **Competition**（大会・講習）
- **Entry**（エントリー）
- **Payment**（決済）
- **AuditLog**（監査）

### 基本関係
```
User
 ├─ Membership ─ Club
 ├─ Qualification ─ Org
 └─ Entry ─ Competition ─ Org
              └─ Payment
```

## 5. ロールと権限（RBAC）

### ロール一覧（Role enum）
- `USER`：一般ユーザー
- `ORG_ADMIN`：大会主催団体の管理者
- `JLA_ADMIN`：JLA管理者
- `PF_ADMIN`：プラットフォーム管理者

### クラブ内権限（MembershipRole）
- `OWNER` / `ADMIN` / `MEMBER`

### 原則
- 作成者責任 + 上位承認
- 価格・手数料は **PF / JLA のみ変更可**
- 県協会は実行主体であり、ルール制定者ではない

## 6. 業務フロー（MVP）

### ユーザー登録
1. `register` → email送信
2. `verify` → `emailVerified = true`
3. `login`

### 所属・資格
1. クラブ所属申請
2. クラブ承認
3. 資格申請
4. 団体承認

### 大会エントリー
1. 大会作成（ORG_ADMIN）
2. 条件チェック（資格・年齢・所属）
3. Entry作成
4. Stripe Checkout
5. Webhook → PAID

## 7. 決済仕様（最重要）

### Stripe方式
- 標準の Stripe Checkout（Connect は現状未使用）
- 決済状態は `Payment` / `EntryCheckoutSession` で管理
- Webhook は現ビルドでは stub（/api/webhooks/stripe は 501 を返却）

### 決済パターン
- 現状は Checkout セッションの作成と DB 保存まで実装
- 収益分配/返金/Connect 決済は未実装

### Webhookで必ず同期すること（将来）
- `checkout.session.completed`
- `checkout.session.expired`

## 8. API設計方針

### ルール
- REST
- **zod** で全入力検証
- すべての mutation は **RBAC 必須**

### 主要API（抜粋）
```typescript
POST /api/auth/register
POST /api/auth/login
POST /api/registration/start
POST /api/registration/verify

GET  /api/clubs
POST /api/clubs
GET  /api/clubs/search
POST /api/clubs/apply

GET  /api/memberships
PATCH /api/memberships/[id]

GET  /api/qualifications
PATCH /api/qualifications/[id]

POST /api/competitions/create
GET  /api/competitions/[id]
PATCH /api/competitions/[id]/update
GET  /api/competitions/[id]/events
PUT  /api/competitions/[id]/events/[eventId]/official-result
GET  /api/competitions/[id]/results
```

## 9. UIの優先順位（最低限）

### 個人
- 所属状況
- 資格状況
- エントリー履歴

### クラブ
- 所属申請承認
- メンバー一覧

### 団体
- 大会作成
- 売上サマリー
- 承認キュー

**※ デザインは後回し。情報が正しいことが最優先**

## 10. 実装優先度（Sprint順）

### Sprint 1（最優先）
- ✅ Prisma schema
- ✅ 認証
- ✅ Org / Club / Membership
- ✅ Qualification
- ✅ Competition
- ✅ Entry → Checkout → Webhook
- ✅ AuditLog

### Sprint 2（将来）
- 決済Webhookの本実装
- 収益分配/返金
- CSV/外部連携

## 11. 判断に迷ったら

以下の問いで判断すること：
1. 「これは全国展開を阻害しないか？」
2. 「紙運用を助長していないか？」
3. 「PFが責任を負いすぎていないか？」
4. 「状態遷移は追跡可能か？」

## 12. このプロジェクトの本質（最後に）

> JLA PF は
> 「システム」ではなく
> 「ライフセービングという競技・安全・組織を回す OS」
> である。

---

## 現在の実装状況（2026年2月5日時点）

### ✅ 完了項目（Sprint 1）

#### インフラ・自動化
- GitHub Actions CI/CD（typecheck, lint, build）
- CodeQL セキュリティスキャン
- Dependabot 自動更新
- Conventional Commits + Semantic Release
- Docker ビルド自動化（ghcr.io）
- Lighthouse パフォーマンス監視
- セキュリティスキャン（TruffleHog, Trivy, Snyk）

#### コアドメイン実装
- ✅ Prisma Schema（User/Organization/Club/Membership/Qualification/Competition/Event/Entry/Payment/OfficialResult ほか）
- ✅ 認証（Cookie + JWT）
- ✅ 監査ログ（AuditLog）
- ✅ 公式結果 API/閲覧 UI（大会/イベント単位）
- ⚠️ Stripe Webhookは stub（/api/webhooks/stripe）

#### セキュリティ改善
- ✅ 汎用エラーメッセージ（ユーザー列挙攻撃対策）
- ✅ 入力バリデーション
- ✅ エラーハンドリング強化
- ✅ 脆弱性修正（js-yaml, qs）

### 🔨 次のステップ（優先順）
1. **決済**
   - [ ] Webhook本実装（session.completed/expired）
   - [ ] 返金・失敗時ハンドリング
2. **UI**
   - [ ] 大会一覧/詳細/エントリーUI（現状はAPI中心）
3. **テスト**
   - [ ] ユニット/E2E
4. **ドキュメント**
   - [x] API仕様書（`docs/API_SPEC.md`）
   - [x] 運用マニュアル（`docs/OPERATIONS_MANUAL.md`）
   - [x] トラブルシューティング（`docs/TROUBLESHOOTING.md`）

### 📁 プロジェクト構造

```
jla-pf/
├── prisma/
│   ├── schema.prisma          # ✅ 完成
│   └── migrations/            # ✅ 適用済み
├── src/
│   ├── app/
│   │   ├── (app)/            # 認証後エリア
│   │   │   └── dashboard/    # ✅ 実装済み
│   │   ├── api/
│   │   │   ├── auth/         # ✅ login実装済み
│   │   │   └── webhooks/     # ✅ stripe実装済み
│   │   └── login/            # ✅ 実装済み
│   ├── components/           # UI コンポーネント
│   ├── lib/                  # ユーティリティ
│   │   ├── auth.ts          # ✅ セッション管理
│   │   └── stripe-types.ts  # ✅ 型安全ヘルパー
│   └── server/              # サーバーロジック
│       ├── db.ts            # Prisma client
│       ├── wallet.ts        # ✅ 財務管理
│       └── finance.ts       # ✅ 収益計算
└── docs/
    ├── AUTOMATION.md        # ✅ 自動化ガイド
   ├── DEPLOYMENT.md        # デプロイ手順
   ├── API_SPEC.md          # ✅ API仕様（実装一覧）
   ├── OPERATIONS_MANUAL.md # ✅ 運用マニュアル
   ├── TROUBLESHOOTING.md   # ✅ トラブルシューティング
    └── HANDOVER.md          # 本ドキュメント
```

### 🔐 環境変数

必須設定：
```bash
DATABASE_URL=postgresql://...
DATABASE_URL_UNPOOLED=postgresql://...
NEXT_PUBLIC_APP_ORIGIN=https://...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PLATFORM_FEE_BPS=1000  # 10%
```

オプション：
```bash
SNYK_TOKEN=...           # セキュリティスキャン
DEPLOY_TOKEN=...         # デプロイ認証
```

### 📊 モニタリング

- GitHub Actions: CI/CD ステータス
- Security Tab: 脆弱性レポート
- AuditLog: すべての重要操作を記録
- Stripe Dashboard: 決済状況

---

## 開発者向けクイックスタート

```bash
# 依存関係インストール
pnpm install

# Prisma生成
pnpm prisma:generate

# DB マイグレーション
pnpm prisma migrate dev

# 開発サーバー起動
pnpm dev

# 型チェック
pnpm typecheck

# Lint
pnpm lint

# ビルド
pnpm build
```

## トラブルシューティング

### Prisma リンクエラー
```bash
pnpm prisma:fixlink
```

### DB接続確認
```bash
pnpm doctor:db
```

### セキュリティ監査
```bash
pnpm audit
```

---

**最終更新**: 2026年2月5日  
**メンテナンス**: GitHub Copilot + 開発チーム

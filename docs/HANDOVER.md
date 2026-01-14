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
- 自前実装
- メール検証リンク（OTPではなく token）
- Cookieベースセッション or JWT（どちらでも可）

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

### ロール一覧
- `USER`：一般選手
- `CLUB_ADMIN`：クラブ管理者
- `ORG_ADMIN`：県協会 / JLA管理者
- `JLA_ADMIN`：JLA本部
- `PLATFORM`：PF運営

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
- `destination charge`
- `application_fee_amount = amount * 0.10`
- `transfer_group = competitionId`

### 決済パターン

#### 大会 / 講習
- `destination = 主催団体（Org）`

#### クラブ登録
- `destination = JLA`
- JLA → 県へ Transfer（比率は将来設定）

### Webhookで必ず同期すること
- `checkout.session.completed`
- `charge.refunded`

## 8. API設計方針

### ルール
- REST
- **zod** で全入力検証
- すべての mutation は **RBAC 必須**

### 主要API（抜粋）
```typescript
POST /api/auth/register
GET  /api/auth/verify
POST /api/auth/login

POST /api/clubs
POST /api/memberships/apply
POST /api/memberships/approve

POST /api/qualifications/request
POST /api/qualifications/approve

POST /api/competitions
POST /api/entries
POST /api/checkout/entry

POST /api/stripe/webhook
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
- チーム
- ヒート
- リザルト
- CSV連携

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

## 現在の実装状況（2026年1月15日時点）

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
- ✅ Prisma Schema（User, Org, Club, Membership, Qualification, Competition, Entry, Payment, AuditLog）
- ✅ 認証（自前実装、Cookie セッション）
- ✅ Stripe Webhook（ENTRY, ORG_ANNUAL, COMPETITION_HOST, CART）
- ✅ 決済フロー（destination charge + 10% application fee）
- ✅ Wallet Ledger（財務管理）
- ✅ AuditLog（監査ログ）

#### セキュリティ改善
- ✅ 汎用エラーメッセージ（ユーザー列挙攻撃対策）
- ✅ 入力バリデーション
- ✅ エラーハンドリング強化
- ✅ 脆弱性修正（js-yaml, qs）

### 🔨 次のステップ（優先順）

1. **API実装**
   - [ ] `/api/competitions` - 大会作成・一覧・詳細
   - [ ] `/api/entries` - エントリー作成・一覧
   - [ ] `/api/checkout/entry` - エントリー決済開始
   - [ ] `/api/memberships` - 所属申請・承認
   - [ ] `/api/qualifications` - 資格申請・承認

2. **UI実装**
   - [ ] 大会一覧・詳細ページ
   - [ ] エントリーフォーム
   - [ ] ダッシュボード拡充（所属・資格状況表示）
   - [ ] 管理画面（承認キュー）

3. **テスト**
   - [ ] ユニットテスト（Jest/Vitest）
   - [ ] E2Eテスト（Playwright）
   - [ ] 決済フローの統合テスト

4. **ドキュメント**
   - [ ] API仕様書（OpenAPI/Swagger）
   - [ ] 運用マニュアル
   - [ ] トラブルシューティングガイド

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

**最終更新**: 2026年1月15日  
**メンテナンス**: GitHub Copilot + 開発チーム

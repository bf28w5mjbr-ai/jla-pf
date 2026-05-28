# 主催団体（Organization）ドメイン

一次情報: `prisma/schema.prisma`（`Organization`, `OrgAdmin`）、[`src/lib/organizerLifecycle.ts`](../src/lib/organizerLifecycle.ts)、[`src/lib/accessControl.ts`](../src/lib/accessControl.ts)、[`docs/PERMISSIONS_CURRENT.md`](./PERMISSIONS_CURRENT.md)。

## 用語

| 対外名称 | コード / DB | UI セグメント |
|----------|-------------|---------------|
| 主催団体 | `Organization` | `ORGANIZER`（サイドバー等では「主催団体」） |
| 主催団体管理者 | `OrgAdmin`（`role=ADMIN`） | — |
| 統括団体 | `Association` | `ASSOCIATION` |

「大会開催者」「大会主催団体」は **主催団体** に統一する（レガシー表記は置換中）。

## 正式化の二層モデル

1. **運用ゲート** — `Organization.status`
   - `PENDING`: 仮登録。基本情報・管理者招待・支払いのみ。
   - `APPROVED`: 大会作成・本番運用可。
   - `SUSPENDED`: 停止（旧 `INACTIVE` はマイグレーションで統合）。

2. **有料機能ゲート** — `hasOrganizerPlatformSubscription()`（[`src/lib/organizerBilling.ts`](../src/lib/organizerBilling.ts)）
   - 参加者の有料エントリー Checkout。
   - `organizerSubscriptionStatus === ACTIVE` または legacy `onboardingFeeStatus === PAID`。

Checkout 完了時は `status: APPROVED` と課金フラグを同時に更新する。

## 権限マトリクス（要約）

| 操作 | USER | OrgAdmin ADMIN | ASSOCIATION_ADMIN | PF_ADMIN |
|------|:----:|:--------------:|:-----------------:|:--------:|
| 主催団体ダッシュボード閲覧 | — | ○ | ✗ | ○ |
| 基本情報編集（PENDING 可） | — | ○ | ✗ | ○ |
| 管理者招待 | — | ○ | ✗ | ○ |
| 大会作成・運用 | — | ○（`APPROVED` のみ） | ✗ | ○ |
| レコーダー割当 | — | ○ | ✗ | ○ |
| レコーダー（大会単位） | — | — | — | 割当された大会のみ |

協会管理者は `requireOrgAdmin` で主催団体 API を拒否する（代行しない）。

## 管理メンバー招待

`OrganizationAdminInvitation` → 本人承諾 → `OrgAdmin` 作成。即時 `POST .../members` は招待作成に委譲する。

## 大会の主催表示名

`Competition.hostOrganizationName*` は作成時スナップショット。`Organization.name` の変更と連動しない（[`src/lib/competitionHostDisplay.ts`](../src/lib/competitionHostDisplay.ts)）。

ドラフト作成は [`src/lib/createDraftCompetition.ts`](../src/lib/createDraftCompetition.ts) に集約する。

## API ルーティング規約

| プレフィックス | 用途 | 認可の目安 |
|----------------|------|------------|
| `/api/organizations/[orgId]/...` | Stripe・オフィシャル・TO など orgId を URL に含めたい設定系 | `requireOrgAdmin(orgId, userId, scope)` |
| `/api/competitions/[id]/...` | 大会 CRUD・エントリー・当日運用・公開素材 | 本番 mutation は `requireHostOrgAdminForCompetition`（[`organizerAccess.ts`](../src/lib/organizerAccess.ts)） |

新規 API は上記いずれかに寄せ、PF 代行が必要な org 操作と、主催者本人のみの大会 mutation を混同しない。

## 当日運用（day-ops）の例外

主催団体が `SUSPENDED` でも、**既に進行中の大会**の当日運用（マーシャル・リザルト等）は、OrgAdmin(ADMIN) または大会ごとの当日パスワードで継続できる（[`src/lib/dayOpsAccess.ts`](../src/lib/dayOpsAccess.ts)）。  
大会の設定変更・エントリー追加・公開スケジュール編集などは `Organization.status === APPROVED` が必須（`requireHostOrgAdminForCompetition` / `getCompetitionManagementAccess`）。

## 関連ドキュメント

- 業務仕様: [`DOMAIN_OPERATIONS_SPEC.md`](./DOMAIN_OPERATIONS_SPEC.md) §5
- 権限: [`PERMISSIONS_CURRENT.md`](./PERMISSIONS_CURRENT.md)
- Stripe: [`STRIPE_ORGANIZER_PRODUCTION_CHECKLIST.md`](./STRIPE_ORGANIZER_PRODUCTION_CHECKLIST.md)

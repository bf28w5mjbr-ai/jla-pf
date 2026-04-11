# JLA PF 権限体系（現行）

## 概要
このドキュメントは、現行実装に合わせた権限モデルの運用基準です。  
一次情報は `prisma/schema.prisma` と `src/lib/accessControl.ts` を参照してください。

## 1. グローバルロール（`User.role`）

`Role` は次の3種類です。

- `USER`: 基本ロール
- `ORG_ADMIN`: 主催団体の運営者ロール（組織スコープは `OrgAdmin` で管理）
- `PF_ADMIN`: プラットフォーム全体管理者

## 2. スコープロール（テーブルで付与）

ユーザーの実際の操作可能範囲は、以下のスコープロールで決まります。

- クラブ: `Membership.role` (`ADMIN` / `MEMBER`)
- 主催団体: `OrgAdmin.role` (`ADMIN` / `MEMBER`)
- 協会: `AssociationAdmin.role` (`ADMIN` / `MEMBER`)

補足:
- `PF_ADMIN` は多くの管理操作を横断実行できます。
- 協会管理者はクラブ/主催団体運営を直接代行しない設計です（`requireClubAdmin` / `requireOrgAdmin` で制限）。
- `requireOrgAdmin()` は `OrgAdmin.role=ADMIN` のみ許可します（`MEMBER` は不可）。

## 3. 権限マトリクス（要約）

| 機能 | USER | CLUB_ADMIN | ORG_ADMIN(スコープ内) | ASSOCIATION_ADMIN | PF_ADMIN |
|------|:----:|:----------:|:----------------------:|:-----------------:|:--------:|
| プロフィール編集（自分） | ○ | ○ | ○ | ○ | ○ |
| クラブ加入申請 | ○ | ○ | ○ | ○ | ○ |
| クラブメンバー承認/ロール変更 | ✗ | ○ | ✗ | ✗ | ○ |
| 大会作成/更新 | ✗ | ✗ | ○ | ✗ | ○ |
| 大会エントリー | ○ | ○ | ○ | ○ | ○ |
| 協会管理画面操作 | ✗ | ✗ | ✗ | ○ | ○ |
| 全体運用設定変更 | ✗ | ✗ | ✗ | ✗ | ○ |

### 当日運用（Day Ops）の役割分担

- 主催管理者（`OrgAdmin.role=ADMIN` / `PF_ADMIN`）
  - レコーダー割当
  - 参加者状態更新（`participant-statuses`、`nfc-call`、`auto-dns`）
  - NFCタグ代理紐付け（`nfc-tags`）
  - 暫定結果の公式確定（`drafts/finalize`）
- レコーダー（大会単位割当）
  - 暫定結果の閲覧/更新（`drafts`）
  - 当日運用リアルタイム配信の閲覧（`realtime/stream`）
- 一般ユーザー
  - Day Ops API へのアクセス不可（暫定結果配信を含む）

## 4. 実装上の判定ポイント

- 共通ガード: `src/lib/accessControl.ts`
  - `requirePfAdmin()`
  - `requireAssociationAdmin()`
  - `requireClubAdmin()`
  - `requireOrgAdmin()`
- ロール・セグメントUI判定: `src/lib/platformTaxonomy.ts`
- PF専用権限判定: `src/lib/governancePolicy.ts`

## 5. 代表API（現行）

### クラブ
- `GET /api/memberships`
- `PATCH /api/memberships/[id]`
- `POST /api/clubs/[clubId]/members/[membershipId]/approve`
- `POST /api/clubs/[clubId]/members/[membershipId]/reject`

### 大会・主催団体
- `POST /api/competitions/create`
- `PATCH /api/competitions/[id]/update`
- `GET /api/organizations/[orgId]/members`
- `PATCH /api/organizations/[orgId]/members/[memberId]`

### 協会・PF管理
- `POST /api/admin/association/clubs/[id]/approve`
- `POST /api/admin/jla/clubs/[id]/approve`
- `GET /api/qualifications`
- `PATCH /api/qualifications/[id]`

## 6. 運用ルール

- 重要操作は `AuditLog` 記録を原則化する。
- 新規管理APIは、ロール判定だけでなく「対象リソースのスコープ検証」を必須とする。
- 権限仕様を更新した場合は、同時に `docs/PERMISSIONS.md` と本書を更新する。

## 7. 参照

- `prisma/schema.prisma`
- `src/lib/accessControl.ts`
- `src/lib/platformTaxonomy.ts`
- `src/lib/governancePolicy.ts`


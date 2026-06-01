# Bluvium 権限体系（現行）

## 概要
このドキュメントは、現行実装に合わせた権限モデルの運用基準です。  
一次情報は `prisma/schema.prisma` と `src/lib/accessControl.ts` を参照してください。

## 1. グローバルロール（`User.role`）

`Role` は次の3種類です。

- `USER`: 基本ロール
- `ORG_ADMIN`: レガシー（コード上は未使用。主催団体スコープは `OrgAdmin` で管理）
- `PF_ADMIN`: プラットフォーム全体管理者

## 2. スコープロール（テーブルで付与）

ユーザーの実際の操作可能範囲は、以下のスコープロールで決まります。

- クラブ: `Membership.role` (`ADMIN` / `MEMBER`)
- 主催団体: `OrgAdmin.role` (`ADMIN` のみ)。追加は `OrganizationAdminInvitation` 経由の招待→承諾
- 協会: `AssociationAdmin.role` (`ADMIN` / `MEMBER`)

補足:
- `PF_ADMIN` は多くの管理操作を横断実行できます。
- 協会管理者はクラブ/主催団体運営を直接代行しない設計です（`requireClubAdmin` / `requireOrgAdmin` で制限）。
- `requireOrgAdmin()` は `OrgAdmin.role=ADMIN` のみ許可します。

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

- チームエントリー更新（`PUT /api/competitions/[id]/team-entries`）: 当該クラブの `Membership` が **承認済み**かつ **`ADMIN` 相当（代表・副代表等）** のユーザーのみ（`isClubAdminRole`）。
- チーム請求の確定・決済: 主催の `OrgAdmin`（管理者）またはクラブ管理者が操作できる範囲は各 `route.ts` のガードに従う。

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
- `POST /api/competitions/create`（`APPROVED` 必須）
- `PATCH /api/organizations/[orgId]/update`（`PENDING` 可）
- `POST /api/organizations/[orgId]/admin-invitations`（招待）
- `POST /api/org-admin-invitations/[token]/accept`（承諾）
- `POST /api/admin/organizations/[orgId]/status`（PF: 停止/復旧）
- `GET /api/organizations/[orgId]/members`
- `PATCH /api/organizations/[orgId]/members/[memberId]`

### 協会・PF管理
- `POST /api/admin/association/clubs/[id]/approve`
- `POST /api/admin/jla/clubs/[id]/approve`
- `GET /api/qualifications`
- `PATCH /api/qualifications/[id]`

## 6. 一般公開サイト（未ログイン）

トップ・`/competitions`・`/clubs` は `PublicSiteShell` で表示。会員向け操作はログイン後。トップ `/` は未ログインのみ公開ランディングを表示し、ログイン済みは `/dashboard` へリダイレクトする（`/competitions`・`/clubs` はログイン済みでも公開のまま）。

| リソース | 公開範囲 | 非公開（会員・主催向け） |
|----------|----------|-------------------------|
| クラブ一覧・`/clubs/view/[id]` | `clubPublicSelect` の基本情報のみ（氏名・電話・番地なし） | メンバー一覧、代表者、事務局連絡先 |
| 大会一覧・詳細 | タブは「大会ページ」「競技結果」のみ。競技結果タブはタイムテーブル→種目別公式結果（**氏名・クラブ名可**）。概要・お知らせ・ギャラリー | 添付 PDF、テクニカルオフィシャル募集、エントリー操作 |
| スタートリスト（直接URL） | `/competitions/[id]/start-list/...`（主催が公開設定時）。公開タブには載せない | — |
| API | `GET /api/public/clubs`, `GET /api/public/clubs/[clubId]` | `GET /api/clubs/search`（要認証） |

## 7. 運用ルール

- 重要操作は `AuditLog` 記録を原則化する。
- 新規管理APIは、ロール判定だけでなく「対象リソースのスコープ検証」を必須とする。
- 権限仕様を更新した場合は、同時に `docs/PERMISSIONS.md` と本書を更新する。

## 8. 参照

- `prisma/schema.prisma`
- `src/lib/accessControl.ts`
- `src/lib/platformTaxonomy.ts`
- `src/lib/governancePolicy.ts`


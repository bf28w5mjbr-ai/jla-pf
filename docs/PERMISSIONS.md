# JLA PF 権限体系ドキュメント

最終更新: 2026-03-24

このドキュメントは、運用向けの権限説明です。  
実装との厳密な一致が必要な場合は、`docs/PERMISSIONS_CURRENT.md` を正としてください。

## 1. 権限モデル（現行）

### グローバルロール（`User.role`）

- `USER`
- `ORG_ADMIN`
- `PF_ADMIN`

### スコープロール

- クラブ: `Membership.role`（`ADMIN` / `MEMBER`）
- 主催団体: `OrgAdmin.role`（`ADMIN` / `MEMBER`）
- 協会: `AssociationAdmin.role`（`ADMIN` / `MEMBER`）

## 2. 基本方針

- すべての管理操作は「ロール判定 + 対象リソースのスコープ検証」を必須にする
- `PF_ADMIN` は多くの管理操作を横断実行できる
- 協会管理者はクラブ/主催団体運営を直接代行しない（`requireClubAdmin` / `requireOrgAdmin` で制限）
- `requireOrgAdmin` は `OrgAdmin.role=ADMIN` のみ許可（`MEMBER` は管理APIを実行不可）
- 重要操作は `AuditLog` 記録を前提とする

## 3. 代表的な操作権限

- `USER`
  - 自分のプロフィール管理
  - クラブ加入申請
  - 大会エントリー
- `CLUB_ADMIN`（クラブスコープ）
  - クラブメンバー承認/却下
  - クラブ内ロール管理
- `ORG_ADMIN`（主催団体スコープ）
  - 大会作成/更新
  - 大会運営機能の利用
- `ASSOCIATION_ADMIN`（協会スコープ）
  - 協会管理画面の操作
- `PF_ADMIN`
  - 全体管理設定
  - 横断的な管理操作

## 4. 実装上の一次情報

- ガード関数: `src/lib/accessControl.ts`
  - `requirePfAdmin()`
  - `requireAssociationAdmin()`
  - `requireClubAdmin()`
  - `requireOrgAdmin()`
- 補助ロジック:
  - `src/lib/platformTaxonomy.ts`
  - `src/lib/governancePolicy.ts`

## 5. 代表 API

- クラブ
  - `GET /api/memberships`
  - `PATCH /api/memberships/[id]`
  - `POST /api/clubs/[clubId]/members/[membershipId]/approve`
  - `POST /api/clubs/[clubId]/members/[membershipId]/reject`
- 主催団体
  - `POST /api/competitions/create`
  - `PATCH /api/competitions/[id]/update`
  - `GET /api/organizations/[orgId]/members`
  - `PATCH /api/organizations/[orgId]/members/[memberId]`
- 協会/PF
  - `POST /api/admin/association/clubs/[id]/approve`
  - `POST /api/admin/jla/clubs/[id]/approve`
  - `GET /api/qualifications`
  - `PATCH /api/qualifications/[id]`

## 6. 更新ルール

- 権限仕様を変更した場合は、次を同時更新する
  - `docs/PERMISSIONS_CURRENT.md`
  - 本書（`docs/PERMISSIONS.md`）
  - 必要に応じて `docs/API_SPEC.md`

## 7. 補足

旧資料で使われていた `JLA_ADMIN` や `OWNER` を前提にした説明は、現行実装では採用していません。  
過去の仕様背景が必要な場合は Git 履歴を参照してください。
# JLA PF 権限体系ドキュメント

> [!WARNING]
> このドキュメントには旧ロール（`JLA_ADMIN` / `OWNER`）など、現行実装と一致しない記述が含まれます。  
> 現在の運用基準は `docs/PERMISSIONS_CURRENT.md` を参照してください。

## 概要

JLA PF（日本ライフセービング協会プラットフォーム）における権限体系の詳細説明。

---

## ロール一覧

### 1. USER（基本ロール）
**デフォルトロール** - すべてのユーザーが最初に登録される

#### できること
- 大会エントリー
- 資格申請
- クラブ加入申請
- プロフィール管理

#### できないこと
- クラブ作成（PF承認が必要）
- 資格承認
- 管理機能全般

---

### 2. クラブ内権限（MembershipRole: OWNER / ADMIN）

#### 作成フロー
1. USERがクラブ作成申請を提出
2. **PF_ADMINが審査（承認/却下）**
3. JLA承認が必要な場合は JLA_ADMIN が `APPLYING → JLA_APPROVED` を実行
4. 承認後、申請者が自動的に `OWNER` に昇格

#### できること
- **メンバー管理**
  - メンバー申請の承認・却下
  - メンバーロール変更（OWNER/ADMIN/MEMBER）
  - メンバー退会処理

- **クラブ情報閲覧**
  - 所属メンバーの情報
  - クラブ内統計

#### できないこと
- 資格承認
- 大会作成
- 他クラブへの干渉

#### 制約事項
- **OWNER退会時：** 他にOWNERが存在する場合のみ退会可能
- **スコープ：** 自分が所属するクラブのみ

#### API エンドポイント
```typescript
GET    /api/memberships?clubId={id}      // メンバー一覧
POST   /api/memberships                  // メンバー申請（USER側）
PATCH  /api/memberships/[id]             // 承認・却下・ロール変更
DELETE /api/memberships/[id]             // メンバー削除
```

#### 実装ファイル
- [`src/app/api/memberships/[id]/route.ts`](src/app/api/memberships/[id]/route.ts)
- [`src/app/admin/memberships/page.tsx`](src/app/admin/memberships/page.tsx)
- [`src/components/admin/MembershipApprovalTable.tsx`](src/components/admin/MembershipApprovalTable.tsx)

---

### 3. ORG_ADMIN（組織管理者）

**大会開催団体の管理者**

#### 権限範囲
- **スコープ：** 自組織のみ（他のORGには干渉不可）
- **目的：** 大会運営と収益管理

#### できること
- **大会管理**
  - 大会作成・編集・削除
  - エントリー期間設定
  - 必須資格設定
  - 参加費設定

- **エントリー管理**
  - エントリー状況確認
  - エントリー者情報閲覧
  - チェックイン処理

- **収益管理**
  - 大会収益確認
  - Walletトランザクション閲覧
  - 収益レポート

#### できないこと
- **資格承認**（JLA_ADMINの権限）
- **USER/CLUB情報管理**（JLA_ADMINの権限）
- **他のORG管理**
- **手数料率変更**（PF_ADMINの権限）
- **ORG自体の削除**（PF_ADMINの権限）

#### 重要な制約
**JLAが大会を開催する場合：**
- JLA_ADMINとは別に、ORG_ADMINとして新規登録が必要
- 理由：ORG管理とJLA管理の権限を分離するため

#### API エンドポイント
```typescript
// 大会管理
POST   /api/competitions/create
GET    /api/competitions/[id]
PATCH  /api/competitions/[id]/update

// エントリー管理
GET    /api/competitions/[id]/results        // 公式結果
PUT    /api/competitions/[id]/events/[eventId]/official-result

// 収益管理
（未実装）
```

#### 実装ファイル
- [`src/app/api/competitions/route.ts`](src/app/api/competitions/route.ts)
- [`src/app/api/competitions/[id]/route.ts`](src/app/api/competitions/[id]/route.ts)

---

### 4. JLA_ADMIN（JLA管理者）

**日本ライフセービング協会の管理者**

#### 権限範囲
- **USER情報への完全アクセス**
- **CLUB情報への完全アクセス**
- **資格承認権限**

#### できること
- **資格管理**
  - 資格申請の承認・却下
  - 資格情報の編集
  - 有効期限管理
  - 却下理由記録

- **USER情報管理**
  - 全USERの情報閲覧
  - プロフィール確認
  - 活動履歴確認

- **CLUB情報管理**
  - 全CLUBの情報閲覧
  - メンバー構成確認
  - クラブ活動状況確認

#### できないこと
- **ORG管理**（ORG_ADMINの権限）
- **大会作成・運営**（ORG_ADMINの権限）
- **決済管理**（PF_ADMINの権限）
- **手数料率変更**（PF_ADMINの権限）

#### 重要な制約
**JLAが大会を開催する場合：**
```
JLA_ADMIN（資格承認用）
    ↓ 別途登録が必要
ORG_ADMIN（大会運営用）
```

JLA_ADMINはORGへ干渉できないため、大会を開催するには別途ORG_ADMINとして登録する必要があります。

#### API エンドポイント
```typescript
// 資格管理
GET    /api/qualifications                   // 資格一覧
GET    /api/qualifications/[id]              // 資格詳細
PATCH  /api/qualifications/[id]              // 承認・却下
DELETE /api/qualifications/[id]              // 資格削除

// クラブJLA承認
POST   /api/admin/jla/clubs/[id]/approve

// USER情報（予定）
GET    /api/admin/users                      // 全USER一覧
GET    /api/admin/users/[id]                 // USER詳細

// CLUB情報（予定）
GET    /api/admin/clubs                      // 全CLUB一覧
GET    /api/admin/clubs/[id]                 // CLUB詳細
```

#### 実装ファイル
- [`src/app/api/qualifications/[id]/route.ts`](src/app/api/qualifications/[id]/route.ts) ✅
- [`src/app/admin/qualifications/page.tsx`](src/app/admin/qualifications/page.tsx) ✅
- [`src/components/admin/QualificationApprovalTable.tsx`](src/components/admin/QualificationApprovalTable.tsx) ✅

---

### 5. PF_ADMIN（プラットフォーム管理者）

**システム全体の最高権限**

#### できること
- **全ロールの権限を包含**
- **システム設定変更**
- **手数料率変更**
- **組織・クラブの強制削除**
- **全データへのアクセス**
- **監査ログ閲覧**

#### 特別な権限
- CLUB作成申請の承認・却下
- システムポリシーの変更
- Stripeアカウント管理
- 緊急時のデータ修正

---

## 権限マトリックス

| 機能 | USER | CLUB<br>OWNER/ADMIN | ORG<br>ADMIN | JLA<br>ADMIN | PF<br>ADMIN |
|------|:----:|:-------------------:|:------------:|:------------:|:-----------:|
| **アカウント** |
| 会員登録 | ○ | ○ | ○ | ○ | ○ |
| プロフィール編集 | ○<br>（自分のみ） | ○<br>（自分のみ） | ○<br>（自分のみ） | ○<br>（自分のみ） | ○<br>（全員） |
| **クラブ** |
| CLUB作成申請 | ○ | - | - | - | - |
| CLUB承認 | ✗ | ✗ | ✗ | ✗ | ○ |
| CLUB加入申請 | ○ | ○ | ○ | ○ | ○ |
| メンバー承認 | ✗ | ○<br>（自CLUBのみ） | ✗ | ✗ | ○ |
| メンバー管理 | ✗ | ○<br>（自CLUBのみ） | ✗ | ✗ | ○ |
| CLUB情報閲覧 | △<br>（公開情報） | ○<br>（自CLUBのみ） | △<br>（公開情報） | ○<br>（全CLUB） | ○ |
| **資格** |
| 資格申請 | ○ | ○ | ○ | ○ | ○ |
| 資格承認 | ✗ | ✗ | ✗ | ○ | ○ |
| 資格情報編集 | ✗ | ✗ | ✗ | ○ | ○ |
| **大会** |
| 大会作成 | ✗ | ✗ | ○<br>（自ORGのみ） | ✗ | ○ |
| 大会運営 | ✗ | ✗ | ○<br>（自ORGのみ） | ✗ | ○ |
| エントリー管理 | ✗ | ✗ | ○<br>（自ORGのみ） | ✗ | ○ |
| 大会エントリー | ○ | ○ | ○ | ○ | ○ |
| **ORG** |
| ORG情報閲覧 | △<br>（公開情報） | △<br>（公開情報） | ○<br>（自ORGのみ） | ✗ | ○ |
| ORG管理 | ✗ | ✗ | ○<br>（自ORGのみ） | ✗ | ○ |
| **決済** |
| 決済受取 | ✗ | ✗ | ○<br>（自ORGのみ） | ✗ | - |
| 収益確認 | ✗ | ✗ | ○<br>（自ORGのみ） | ✗ | ○ |
| 手数料率変更 | ✗ | ✗ | ✗ | ✗ | ○ |
| **システム** |
| 監査ログ閲覧 | ✗ | ✗ | △<br>（自ORGのみ） | ✗ | ○ |
| システム設定 | ✗ | ✗ | ✗ | ✗ | ○ |

**凡例：**
- ○：許可
- ✗：不可
- △：制限付き許可

---

## 設計原則

### 1. 権限の分離
- **JLA_ADMIN ≠ ORG_ADMIN**
  - JLAの管理業務（資格承認）と大会運営は別の権限
  - JLAが大会開催時は別途ORG_ADMINとして登録

### 2. スコープの制限
- **CLUB_OWNER/ADMIN：** 自CLUBのみ
- **ORG_ADMIN：** 自ORGのみ
- **JLA_ADMIN：** USER/CLUBのみ（ORGには干渉不可）

### 3. 承認フロー
- **CLUB作成：** USER申請 → PF_ADMIN承認
- **CLUBメンバー：** USER申請 → CLUB_OWNER/ADMIN承認
- **資格：** USER申請 → JLA_ADMIN承認

### 4. 監査の徹底
すべての重要操作は[`AuditLog`](prisma/schema.prisma)に記録：
```typescript
await prisma.auditLog.create({
  data: {
    actorUserId: sess.userId,
    action: 'QUALIFICATION_APPROVE',
    target: `qualification:${id}`,
    meta: data,
  },
});
```

---

## 実装状況

### ✅ 完了
- USER基本機能
- CLUB_OWNER/ADMINのメンバー管理
- JLA_ADMINの資格承認
- ORG_ADMINの大会作成（一部）
- PF_ADMIN全機能

### 🚧 実装中
- CLUB作成承認フロー
- ORG_ADMIN大会管理UI
- 収益ダッシュボード

### 📋 未実装
- JLA_ADMIN用のUSER/CLUB閲覧UI
- ORG_ADMIN用の詳細な大会運営機能
- レポート機能

---

## セキュリティ考慮事項

### 1. 権限チェック
すべてのAPIで必須：
```typescript
const sess = token ? await verifySession(token) : null;
if (!sess?.userId) {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

// ロールチェック
const user = await prisma.user.findUnique({
  where: { id: sess.userId },
  select: { role: true },
});

if (user?.role !== 'JLA_ADMIN' && user?.role !== 'PF_ADMIN') {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}
```

### 2. スコープ検証
```typescript
// ORG_ADMINの場合、自組織かチェック
const orgAdmin = await prisma.orgAdmin.findFirst({
  where: {
    userId: sess.userId,
    orgId: targetOrgId,
  },
});

if (!orgAdmin) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}
```

### 3. 監査ログ
重要操作は必ず記録：
- 承認・却下
- ロール変更
- データ削除
- 設定変更

---

**最終更新：** 2026年2月5日

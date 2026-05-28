# 当日運用マニュアル（スタートリスト連携）

## 対象
- 主催管理者（`OrgAdmin.role=ADMIN` または `PF_ADMIN`）
- 大会単位で割り当てられたレコーダー（主にリザルト入力）

## 事前準備
1. 主催管理画面の大会詳細で「当日運用」タブを開く。
2. スタートリスト Step1（ラウンド設定）を確定する。
3. 必要に応じて当日運用アクセス暗号（day-ops secret）とレコーダーを設定する。

## データモデル（重要）
- スタートリストの母体は `CompetitionStartListSnapshot`。
- 参加者状態は `CompetitionParticipantStatus` に保存する。
  - 個人種目: `I:{competitionEntryId}`
  - チーム種目（マーシャル）: `T:{teamEntryId}:{teamMemberUserId}`（メンバー未割当時は `T:{teamEntryId}` 互換）
- リザルトは `OfficialResult` / `OfficialResultRow` に保存する。
  - チーム種目のリザルトは **チーム単位**（`teamEntryId`）で記録する。
- つまりチーム種目は以下の粒度で運用する。
  - マーシャル: メンバー単位
  - リザルト: チーム単位

## 当日の基本フロー
1. **マーシャル一覧取得**
   - `heat-marshal` API でヒート・レーン・参加者状態を取得する。
2. **召集更新（マーシャル）**
   - チェック/NFCで `CALLED` を付与し、必要時は `PENDING` に戻す。
   - ヒート締切済みのヒートは更新不可。
3. **リザルト入力**
   - `CALLED`（召集済み）を前提に順位を追加する。
   - ヒート単位確定後はそのヒートの追加入力を禁止する。
4. **失格・招集漏れ対応**
   - `auto-dns` 等で `DNS` / `DSQ` を反映する。
   - 必要時は公式結果（DSQ行）と同期する。

## 主要 API（現行）
- マーシャル一覧・ヒート締切:
  - `GET/PUT /api/competitions/{id}/day-ops/heat-marshal`
- マーシャル単発完了:
  - `POST /api/competitions/{id}/day-ops/heat-marshal/complete`
- 参加者状態更新:
  - `POST /api/competitions/{id}/day-ops/participant-statuses`
  - `POST /api/competitions/{id}/day-ops/participant-statuses/bulk`
  - `POST /api/competitions/{id}/day-ops/participant-statuses/auto-dns`
- リザルト入力・取得:
  - `GET /api/competitions/{id}/day-ops/heat-result-capture`
  - `POST/PATCH /api/competitions/{id}/day-ops/heat-result-capture/append`
  - `POST /api/competitions/{id}/day-ops/heat-result-capture/confirm-heat`
  - `POST /api/competitions/{id}/day-ops/heat-result-capture/run-up`

## 運用ルール
- `CHECKED_IN` は新規付与しないが、既存値は召集済み相当として扱う。
- `DNS` / `WITHDRAWN` / `DSQ` は終了系ステータスとして扱い、通常のマーシャル更新対象外。
- 公式結果が付いたヒートは、マーシャル締切の再オープンを禁止する。
- チームメンバー未割当の行はリザルト入力をブロックする。

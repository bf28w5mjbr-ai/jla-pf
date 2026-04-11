# 当日運用マニュアル（NFC主軸）

## 対象
- 主催管理者（`OrgAdmin.role=ADMIN` または `PF_ADMIN`）
- 大会単位で割り当てられたレコーダー（記録入力のみ）

## 事前準備
1. 主催管理画面の大会詳細で「当日運用」タブを開く。
2. レコーダー権限を大会単位で割り当てる。
3. 競技種目と出場者データが揃っていることを確認する。

## 当日の基本フロー
1. **召集/状態管理（主催管理者のみ）**
   - 種目ごとに参加者ステータスを更新する（`CALLED`, `DNS`, `WITHDRAWN`, `DSQ`, `PENDING`）。
   - `CHECKED_IN` は廃止済みで利用不可。
   - `WITHDRAWN` は `DNS` 扱い、`DSQ` は理由必須。
2. **NFC運用（主催管理者のみ）**
   - NFC召集: `nfc-call` で `CALLED` を更新。
   - 代理紐付け: `nfc-tags` で対象ユーザーへタグを再紐付け（理由必須）。
3. **暫定結果入力（レコーダー/主催管理者）**
   - `レコーダー画面` で行を追加し、対象・順位・結果を入力して暫定保存する。
   - 暫定結果のリアルタイム配信はスタッフのみ閲覧可能。
4. **確定（主催管理者のみ）**
   - 主催管理者が「公式結果へ確定」を実行する。
   - 確定時に公式結果へ転記され、必要に応じてロックされる。
5. **確定後の編集制限**
   - 公式結果がロック済みの場合、暫定結果は更新不可。
   - 再確定時は理由入力が必須。

## 画面導線
- 主催管理者:
  - `organizations/{organizationId}/competitions/{competitionId}` の「当日運用」タブ
- レコーダー:
  - `competitions/{competitionId}/recorder`
- 閲覧者:
  - `competitions/{competitionId}/results`（公式結果のみ）

## API（主要）
- レコーダー割当:
  - `GET/PUT /api/competitions/{id}/day-ops/recorders`
- チェックイン:
  - `GET/POST /api/competitions/{id}/day-ops/checkins`（廃止・常に410）
- 参加状態:
  - `GET/POST /api/competitions/{id}/day-ops/participant-statuses`
- NFC召集:
  - `POST /api/competitions/{id}/day-ops/participant-statuses/nfc-call`
- 招集漏れ一括DQ:
  - `POST /api/competitions/{id}/day-ops/participant-statuses/auto-dns`
- NFCタグ代理紐付け:
  - `POST /api/competitions/{id}/day-ops/nfc-tags`
- 暫定結果:
  - `GET/PUT /api/competitions/{id}/day-ops/drafts`
- 暫定結果リアルタイム:
  - `GET /api/competitions/{id}/day-ops/realtime/stream`
- 確定:
  - `POST /api/competitions/{id}/day-ops/drafts/finalize`

## 監査ログ（確認ポイント）
- `COMPETITION_RECORDER_ASSIGNMENT_UPDATE`
- `COMPETITION_PARTICIPANT_STATUS_UPSERT`
- `COMPETITION_PARTICIPANT_STATUS_NFC_CALL`
- `COMPETITION_PARTICIPANT_STATUS_AUTO_DSQ`
- `COMPETITION_NFC_TAG_REBIND`
- `COMPETITION_RESULT_DRAFT_UPSERT`
- `COMPETITION_RESULT_DRAFT_FINALIZE`

## 注意事項
- `day-ops/checkins` は廃止済み（410）。
- リアルタイム暫定結果（`day-ops/realtime/stream`）はスタッフ認可必須。
- `DSQ` は理由必須、`WITHDRAWN` は `DNS` として記録される。
- 確定後も再確定は可能だが、再確定理由の記録を必須とする。

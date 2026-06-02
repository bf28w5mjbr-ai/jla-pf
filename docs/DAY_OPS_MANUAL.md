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
4. **終了ステータス（DNS / 棄権 / DNF / DSQ）**
   - スタートリストの **終了ステータス管理**（`/competitions/{id}/start-list/{eventId}/dsq`）から、ヒート・レーン（参加者名）を選んで登録する。
   - マーシャル **ヒート締切** 時に、当ラウンドで未召集（`PENDING`）の参加者は自動で **DNS**（理由: マーシャル未完了により欠場）になる（表示専用の `MARSHAL_ABSENT` は廃止）。
   - **棄権**（`WITHDRAWN`）: 本人申告または運営登録。スナップショットのレーンは維持（詰め替えしない）。
   - **DNF**: 途中辞退。リザルト・進出除外の扱いは DSQ と同型。
   - 公式結果行は終了ステータス登録時に自動同期（種目ロック時はスキップ）。

## 終了ステータス一覧

| ステータス | 意味 | スタートリスト表示 |
|-----------|------|-------------------|
| DNS | 欠場（マーシャル未完了含む） | 打ち消し線 + バッジ |
| WITHDRAWN | 棄権 | バッジのみ（打ち消し線なし） |
| DNF | 途中辞退 | バッジのみ |
| DSQ | 競技中失格 | 打ち消し線 + バッジ |

確定後ソート: 進出 → 着順 → DNF → その他ターミナル（DNS/DSQ/棄権）。

## リアルタイム同期（他タブ・他端末）

- 参加者ステータス更新で `CompetitionParticipantStatus.updatedAt` が変わり、`live-fingerprint` / SSE が変化する。
- 同一ブラウザでは `jla-dayops-participant-status-changed` イベントでマーシャル・リザルトを再取得する。
- 大会当日は `.env` で `NEXT_PUBLIC_DAY_OPS_LIVE_STREAM=1` を推奨（`GET /api/competitions/{id}/day-ops/live-events`）。
- ポーリング間隔: `NEXT_PUBLIC_DAY_OPS_LIVE_STREAM` 未設定時は `useDayOpsStartListPolling`（通常 20s / アクティブ時 60s）。

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
- 終了ステータス（レーン単位）:
  - `POST /api/competitions/{id}/day-ops/heat-lane-terminal-status`（`status`: DNS | WITHDRAWN | DNF | DSQ）
  - `POST /api/competitions/{id}/day-ops/participant-terminal-revert`
  - `GET /api/competitions/{id}/day-ops/dsq-management`（終了ステータス管理画面用）
  - 互換: `POST .../heat-lane-dsq`（DSQ 固定）

## 運用ルール
- `CHECKED_IN` は新規付与しないが、既存値は召集済み相当として扱う。
- `DNS` / `WITHDRAWN` / `DNF` / `DSQ` は終了系ステータスとして扱い、通常のマーシャル更新対象外。
- 公式結果が付いたヒートは、マーシャル締切の再オープンを禁止する。
- チームメンバー未割当の行はリザルト入力をブロックする。

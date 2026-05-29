# スタートリスト保存フロー整理

最終更新: 2026-05-29

## 1. 現行の正規フロー

保存系の入口は3つあるが、どれも最終的に「設定更新」「スナップショット更新（任意）」「監査ログ」に収束する。

| 入口 | 主用途 | 設定更新 | スナップショット更新 | ステップ1確定 |
| --- | --- | --- | --- | --- |
| `POST /api/competitions/{id}/round-setup/bulk-save` | ラウンド設定カードの一括保存 | あり（roundCount + roundTabs） | 既定で実施（`captureSnapshot !== false`） | 未確定種目を自動確定可 |
| `PUT /api/competitions/{id}/start-list-settings` | 旧来/運用系の設定保存 | あり（startListSettings） | `captureSnapshot === true` のとき実施 | なし |
| `POST /api/competitions/{id}/start-list-snapshot/capture` | 手動で記録更新のみ | なし | 常に実施 | なし |

## 1.1 マーシャル前の自動スナップショット同期

`src/lib/startListSnapshotOnEntryIncrease.ts` の `syncStartListSnapshotBeforeMarshal` が、**既にスナップショット記録がある大会**で、種目ごとの**ライブ成立参加者 ID 集合**と **HEAT スナップショット上の ID 集合**が一致しないとき、その種目の HEAT だけを部分再計算する（`marshalStartedAt` 未設定のみ）。故意のシャッフル UI は設けない。

| トリガー | 入口例 |
| --- | --- |
| `ENTRY_SAVE` | `POST .../entries`（エントリー成立時・変更前種目も候補に含む） |
| `HOST_INVITE` | `POST .../entries/host-invite` |
| `PAYMENT_ESTABLISHED` | 手動入金・後払い承認 |
| `STRIPE_CHECKOUT` | `finalizeEntryCheckoutSessionsFromStripeSession` |
| `TEAM_ENTRIES_SAVE` | `PUT .../team-entries`（種目別チーム数が変わったとき） |
| `ENTRY_WITHDRAW` | `POST .../entries/{entryId}/withdraw` |
| `ENTRY_CANCEL` | `POST .../entries/{entryId}/cancel` |
| `POST_PAY_REVOKE` | 後払い承認取り消し |

**自動同期しない例**

- スナップショット未作成（初回は従来どおり手動 capture または bulk-save）
- 種目の `marshalStartedAt` 設定済み
- ライブとスナップショットの参加者 ID 集合が既に一致（`ALREADY_IN_SYNC`）

監査ログ `COMPETITION_START_LIST_SNAPSHOT_CAPTURE` には `autoBeforeMarshalSync: true` と `syncTrigger` が付く。

マーシャル前でも同期のたびに該当種目の **HEAT は全員分再シャッフル**される（SEMI/FINAL は維持）。

## 2. 共通化した責務

`src/lib/startListSaveFlowService.ts` に以下を集約:

- `runSnapshotCaptureForSettings(...)`
  - 設定保存後に、ヒート分割が変わった種目だけ部分再計算してスナップショット更新
  - 失敗時は「設定保存は成功」のまま `snapshotCapture.ok=false` を返す
- `resolveRoundSetupConfirmEventIds(...)`
  - 一括保存時にステップ1確定対象（`confirmEventIds`）を解決
  - 明示指定がなければ「未確定かつ未マーシャル」の dirty 種目を対象化

## 3. DayOps側の前提ガード

DayOps操作の多くは `startListHeatPlanConfirmedAt` を前提にしているため、未確定時メッセージを共通定数化:

- `START_LIST_STEP1_REQUIRED_MESSAGE`
- `START_LIST_STEP1_REQUIRED_SHORT_MESSAGE`
- `START_LIST_STEP1_LOCKED_AFTER_MARSHAL_MESSAGE`

定義: `src/lib/startListStep1Messages.ts`

## 4. deprecated/no-op 経路の扱い

以下は互換維持のため残置し、現行では自動生成を行わない:

- `runScheduledStartListSnapshotPass()`（常に no-op）
- `/api/cron/ensure-start-list-snapshots`（認証後も no-op）
- `ensureStartListSnapshotIfEligible()`（常に false）

削除方針（段階）:

1. 外部依存（Cron設定/監視）を完全に停止
2. no-op応答を使う呼び出し元が無いことを確認
3. `@deprecated` 経路を削除し、手動 capture フローのみを正規化

# スタートリスト保存フロー整理

最終更新: 2026-05-29

## 1. 現行の正規フロー

保存系の入口は3つあるが、どれも最終的に「設定更新」「スナップショット更新（任意）」「監査ログ」に収束する。

| 入口 | 主用途 | 設定更新 | スナップショット更新 | ステップ1確定 |
| --- | --- | --- | --- | --- |
| `POST /api/competitions/{id}/round-setup/bulk-save` | ラウンド設定カードの一括保存 | あり（roundCount + roundTabs） | 既定で実施（`captureSnapshot !== false`） | 未確定種目を自動確定可 |
| `PUT /api/competitions/{id}/start-list-settings` | 旧来/運用系の設定保存 | あり（startListSettings） | `captureSnapshot === true` のとき実施 | なし |
| `POST /api/competitions/{id}/start-list-snapshot/capture` | 手動で記録更新のみ | なし | 常に実施 | なし |
| `POST /api/competitions/{id}/start-list-snapshot/sync-if-needed` | 定期・手動の差分同期 | なし | ずれた種目のみ | なし |

## 1.1 マーシャル前の自動スナップショット同期

`src/lib/startListSnapshotOnEntryIncrease.ts` の `syncStartListSnapshotBeforeMarshal` が、**既にスナップショット記録がある大会**で、種目ごとの**ライブ成立参加者 ID 集合**と **HEAT スナップショット上の ID 集合**が一致しないとき、その種目の HEAT だけを部分再計算する（**HEAT ラウンド内のいずれかのヒートがマーシャル締切済みでない**種目のみ）。故意のシャッフル UI は設けない。

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
- 種目の **HEAT ラウンド**にマーシャル締切（`callClosedAt`）済みヒートがある
- ライブとスナップショットの参加者 ID 集合が既に一致（`ALREADY_IN_SYNC`）

監査ログ `COMPETITION_START_LIST_SNAPSHOT_CAPTURE` には `autoBeforeMarshalSync: true` と `syncTrigger` が付く。

マーシャル前でも同期のたびに該当種目の **HEAT は全員分再シャッフル**される（SEMI/FINAL は維持）。

## 1.2 スタートリスト画面の定期同期（全体）

表示中タブが visible のとき、[`useStartListPeriodicSync`](src/hooks/useStartListPeriodicSync.ts) がポーリングする。接続プール枯渇を避けるため **役割で分ける**。

| 画面 | 閲覧者 | sync-if-needed | refresh 間隔（既定） |
| --- | --- | --- | --- |
| スタートリスト一覧 [`StartListEventIndexBars`](src/components/StartListEventIndexBars.tsx) | 全員 | なし | 90 秒 |
| 種目詳細 [`StartListEventUnifiedCard`](src/components/StartListEventUnifiedCard.tsx) | 一般（public） | なし | 90 秒 |
| 種目詳細 | 主催設定・当日運用（ops） | あり | 30 秒 |

- **主催・当日運用**: `POST /api/competitions/{id}/start-list-snapshot/sync-if-needed` のあと `router.refresh()`。全会種目を候補に HEAT 差分同期（`syncTrigger: PERIODIC_POLL`）。API は **スタートリスト設定を変更できる権限**のみ実行（一般閲覧の POST は `skippedReason: MANAGE_START_LIST_REQUIRED` で DB 更新なし）。
- **一般閲覧**: `router.refresh()` のみ（エントリー・表示の鮮度）。HEAT 整合はエントリー保存・決済などの自動同期（§1.1）に任せる。

環境変数（いずれも 15〜120 秒に clamp）:

- `NEXT_PUBLIC_START_LIST_SYNC_INTERVAL_SEC` — 主催・当日運用の sync + refresh
- `NEXT_PUBLIC_START_LIST_PUBLIC_REFRESH_INTERVAL_SEC` — 一覧・一般閲覧の refresh のみ

スタートリスト閲覧権限がない場合は API は 403。

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

## 5. 表示3層（ops / CSV）

スタートリスト ops 画面と CSV は、同じ種目でも **表示の出どころ** を `displaySource` で区別する。

| displaySource | 意味 | ops タブバッジ | CSV |
| --- | --- | --- | --- |
| `liveEntry` | 未凍結の先頭ラウンド（エントリー追随・名前あり） | 最新 | 出力しない |
| `snapshotHeat` | 凍結 HEAT（ENTRY_CLOSE / RECORD_CAPTURE 等） | 記録 | 出力する |
| `snapshotResult` | 凍結 SEMI/FINAL（`generatedBy: RESULT_BASED`） | 結果確定 | 出力する |
| `previewStructure` | 後続タブの試算（ヒート数・最大枠のみ、選手名なし） | 試算 | 出力しない |

**試算タブ** — 2ラウンド目以降でスナップショット未存在のとき、`getLiveHeatsByTab` はヒート数だけ計算し参加者配列は空にする。按分表示は先頭ラウンド確定時の「按分試算 N 名」（UI: `HeatAdvanceQuotaLabel`）。

**記録タブ** — スナップショット凍結後は名前付きで表示。CSV は `snapshotHeat` / `snapshotResult` の行のみ flatten する（`startListEventCsvExport.ts`）。

**HEAT 部分再生成と tail 無効化** — 設定保存で先頭 HEAT を差し替えるとき、`mergeNewHeatHeadOntoPreviousTailForEvent` は `RESULT_BASED` の次ラウンド tail を破棄する（古い進出者と整合しないため）。`BASELINE` 等の tail は残す。破棄時は `runSnapshotCaptureForSettings` の応答に `tailInvalidated` / `tailInvalidatedMessage` が付き、bulk-save 成功後に toast で通知する。

按分式の詳細は `docs/DOMAIN_OPERATIONS_SPEC.md`（L429 付近）と `src/lib/startListAdvanceEligibility.ts`（UI との差）を参照。

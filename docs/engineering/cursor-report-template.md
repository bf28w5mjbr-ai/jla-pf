# Cursor 標準報告テンプレート

最終更新: 2026-10-16  
エージェント短縮版: `.cursor/rules/cursor-reporting.mdc`

## 通常報告（必須ブロック）

チャット末尾に以下を付ける。通常は各行 1 行程度。

```text
Task ID:
Status:
Summary:
Changes:
Tests:
Risks:
Artifacts:
Next Action:
Approval Required:
```

### 記入例（短い）

```text
Task ID: DEV-20
Status: done
Summary: Track A の L4 復元が隔離 PGDATA で成功し検証環境を破棄した。
Changes: なし（実行のみ） / または docs/... を追加
Tests: L4_RESULT=PASS（詳細は Artifacts）
Risks: Track B 未実施。ACL は --no-acl のため未再現。
Artifacts: /tmp/dev20-l4-report-last.txt; USB 20261016T032427Z
Next Action: DEV-19 の本番 precheck 承認待ち
Approval Required: 本番読取 precheck; migrate deploy
```

### Status 値

| 値 | 意味 |
|----|------|
| `in_progress` | 作業中 |
| `blocked` | 環境・依存待ち（承認以外） |
| `needs_approval` | 承認ゲートで停止 |
| `done` | 完了条件を満たした |

### Approval Required

- 不要なら `none`
- 必要な操作を列挙（「全部」「いつもの」は不可）

## 詳細ログの置き場

長文のコマンドログ・TOC・表はチャットに貼らない。

| 種類 | 推奨置き場 |
|------|------------|
| 再実行可能な手順・設計 | `docs/` または `docs/engineering/` |
| 秘密を含まない一時メトリクス | agent store / `/tmp`（消える前提を明記） |
| PR 向け説明 | PR body |
| 可視化 | Cursor canvas（必要時） |

ChatGPT が追加情報を求めたとき、Artifacts パスから詳細を再提示できるようにする。

## Self-Review チェック（実装タスク）

報告前に内部確認:

- [ ] 承認ゲートを越えていない
- [ ] 他 worktree の dirty を壊していない
- [ ] 秘密・個人情報を出力していない
- [ ] 関連テストを実行した（または実行不能理由を Risks に書いた）
- [ ] Next Action が一つに絞れている

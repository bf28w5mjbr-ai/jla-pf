# GitHub Automation Guide

## Workflows

### CI (`.github/workflows/ci.yml`)
- Runs on every push and PR
- Steps: Install deps, Migration gate, Typecheck, Lint, Test, Build
- Branch protectionで必須

### CodeQL (`.github/workflows/codeql-analysis.yml`)
- Security scanning on every push/PR
- Branch protectionで必須

### Labeler (`.github/workflows/labeler.yml`)
- ファイルパスに応じてラベル付与

### Stale Issues/PRs (`.github/workflows/stale.yml`)
- 60日で stale / 7日後に close
- 週1回実行（手動実行可）

### Dependabot Auto-Approve & Merge (`.github/workflows/auto-approve-dependabot.yml`)
- dependabot PR を自動承認
- `dependencies` ラベルで squash merge（dependabot 専用）

### Auto-Merge (`.github/workflows/auto-merge.yml`)
- `automerge` ラベルで自動マージ
- squash merge
- レビュー必須

### Commit Lint (`.github/workflows/commitlint.yml`)
- PRのコミットメッセージを Conventional Commits で検証

### Semantic Release (`.github/workflows/semantic-release.yml`)
- `main` への push でリリース実行（lockfile経由で依存解決）

### Auto Version Tag (`.github/workflows/auto-version.yml`)
- 手動実行時に `package.json` の version に合わせてタグ作成

### Docker Build & Push (`.github/workflows/docker-build.yml`)
- `v*` タグ push または手動実行で ghcr.io へイメージをビルド/プッシュ

### Performance (`.github/workflows/performance.yml`)
- Lighthouse / bundle size を計測

### Security Scan (`.github/workflows/security-scan.yml`)
- TruffleHog / Snyk / npm audit / Trivy を定期実行（アクションは固定バージョンを使用）

### Deploy (`.github/workflows/deploy-canary.yml`)
- `main` push では staging を自動実行
- canary / production は `workflow_dispatch` の `environment` 指定で手動実行
- 実行順は `MIGRATE_COMMAND` -> `DEPLOY_COMMAND` -> `HEALTHCHECK_URL` -> failure時 `ROLLBACK_COMMAND`

## Configuration Files

- `.github/CODEOWNERS` - Code ownership rules
- `.github/dependabot.yml` - Dependency update scheduling
- `.github/labeler.yml` - Auto-labeling rules
- `.github/PULL_REQUEST_TEMPLATE.md` - PR template
- `.github/ISSUE_TEMPLATE/` - Issue templates

## Manual Operations

### Update Branch Protection
```bash
bash scripts/setup-branch-protection.sh
```

### List Branch Protection Rules
```bash
gh api repos/bf28w5mjbr-ai/bluvium/branches/main/protection
```

### Remove Branch Protection
```bash
gh api repos/bf28w5mjbr-ai/bluvium/branches/main/protection -X DELETE
```

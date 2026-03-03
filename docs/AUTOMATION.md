# GitHub Automation Guide

## Workflows

### CI (`.github/workflows/ci.yml`)
- Runs on every push and PR
- Steps: Install deps, Typecheck, Lint, Build
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
- `dependencies` ラベルで squash merge

### Auto-Merge (`.github/workflows/auto-merge.yml`)
- `automerge` / `dependencies` ラベルで自動マージ
- squash merge
- レビュー必須

### Commit Lint (`.github/workflows/commitlint.yml`)
- PRのコミットメッセージを Conventional Commits で検証

### Semantic Release (`.github/workflows/semantic-release.yml`)
- default branch への push でリリース実行

### Auto Version Tag (`.github/workflows/auto-version.yml`)
- `package.json` の version に合わせてタグ作成

### Docker Build & Push (`.github/workflows/docker-build.yml`)
- ghcr.io へイメージをビルド/プッシュ

### Performance (`.github/workflows/performance.yml`)
- Lighthouse / bundle size を計測

### Security Scan (`.github/workflows/security-scan.yml`)
- TruffleHog / Snyk / npm audit / Trivy を定期実行

### Deploy (`.github/workflows/deploy-canary.yml`)
- staging/canary/production を手動または push で実行（現在はプレースホルダー）

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
gh api repos/bf28w5mjbr-ai/jla-pf/branches/fix/login-localize-and-session-helper/protection
```

### Remove Branch Protection
```bash
gh api repos/bf28w5mjbr-ai/jla-pf/branches/fix/login-localize-and-session-helper/protection -X DELETE
```

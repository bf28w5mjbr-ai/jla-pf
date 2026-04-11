# Deployment Configuration

## Environments

This repository uses GitHub Environments for deployment control:

- **staging** - Staging environment (auto-deploy on commit)
- **canary** - Canary/beta environment (manual approval)
- **production** - Production environment (manual approval + tests)

## Deployment Flow

1. **Staging** - `main` への push で自動実行
2. **Canary** - `workflow_dispatch` で `environment=canary` を選択して手動実行
3. **Production** - `workflow_dispatch` で `environment=production` を選択して手動実行
4. 実行順序は `MIGRATE_COMMAND` → `DEPLOY_COMMAND` → `HEALTHCHECK_URL` → 失敗時 `ROLLBACK_COMMAND`

## Environment Variables

Set these in GitHub repository settings under Environments:

### Staging
- `DEPLOY_TOKEN` - Authentication token
- `MIGRATE_COMMAND` - Database migration command string
- `DEPLOY_COMMAND` - Deploy command string
- `HEALTHCHECK_URL` - Post-deploy health check URL
- `ROLLBACK_COMMAND` - Rollback command string

### Canary
- `DEPLOY_TOKEN` - Authentication token
- `MIGRATE_COMMAND` - Database migration command string
- `DEPLOY_COMMAND` - Deploy command string
- `HEALTHCHECK_URL` - Post-deploy health check URL
- `ROLLBACK_COMMAND` - Rollback command string

### Production
- `DEPLOY_TOKEN` - Authentication token
- `MIGRATE_COMMAND` - Database migration command string
- `DEPLOY_COMMAND` - Deploy command string
- `HEALTHCHECK_URL` - Post-deploy health check URL
- `ROLLBACK_COMMAND` - Rollback command string

## Manual Deployment

```bash
gh workflow run deploy-canary.yml -f environment=production
```

## Rollback

If deployment fails:
1. `ROLLBACK_COMMAND` が自動実行される
2. 通知/Issue作成は未設定（必要に応じて別ワークフローで連携）

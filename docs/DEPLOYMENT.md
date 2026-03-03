# Deployment Configuration

## Environments

This repository uses GitHub Environments for deployment control:

- **staging** - Staging environment (auto-deploy on commit)
- **canary** - Canary/beta environment (manual approval)
- **production** - Production environment (manual approval + tests)

## Deployment Flow

1. **Staging** - default branch への push で実行
2. **Canary** - 手動承認
3. **Production** - 手動承認

## Environment Variables

Set these in GitHub repository settings under Environments:

### Staging
- `DEPLOY_TOKEN` - Authentication token

### Canary
- `DEPLOY_TOKEN` - Authentication token

### Production
- `DEPLOY_TOKEN` - Authentication token

## Manual Deployment

```bash
gh workflow run deploy-canary.yml -f environment=production
```

## Rollback

If deployment fails:
1. Rollback処理はワークフロー内のプレースホルダー
2. 通知/Issue作成は未設定

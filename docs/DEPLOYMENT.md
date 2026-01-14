# Deployment Configuration

## Environments

This repository uses GitHub Environments for deployment control:

- **staging** - Staging environment (auto-deploy on commit)
- **canary** - Canary/beta environment (manual approval)
- **production** - Production environment (manual approval + tests)

## Deployment Flow

1. **Staging** - Automatically deployed on every commit to main branch
2. **Canary** - Manual approval required, 10% traffic routing
3. **Production** - Manual approval required, full deployment

## Environment Variables

Set these in GitHub repository settings under Environments:

### Staging
- `DEPLOYMENT_URL` - Staging API endpoint
- `DEPLOYMENT_TOKEN` - Authentication token

### Canary
- `DEPLOYMENT_URL` - Canary API endpoint
- `DEPLOYMENT_TOKEN` - Authentication token
- `CANARY_TRAFFIC_PERCENT` - 10 (for 10% traffic)

### Production
- `DEPLOYMENT_URL` - Production API endpoint
- `DEPLOYMENT_TOKEN` - Authentication token
- `HEALTH_CHECK_URL` - Health check endpoint

## Manual Deployment

```bash
gh workflow run deploy-canary.yml -f environment=production
```

## Rollback

If deployment fails:
1. Previous version is automatically restored
2. Slack notification sent
3. Issue created for investigation

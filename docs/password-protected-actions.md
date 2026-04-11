# 高リスク操作の保護機能

パスワード認証を要求することで、重要な操作を保護します。

## コンポーネント

### 1. PasswordVerificationModal
パスワード確認用のモーダルダイアログ

```tsx
import PasswordVerificationModal from "@/components/PasswordVerificationModal";

<PasswordVerificationModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  onVerified={() => {
    // パスワード確認成功後の処理
    console.log("認証成功");
  }}
  title="本人確認"
  description="この操作を続行するには、パスワードを入力してください"
/>
```

### 2. usePasswordProtectedAction フック
高リスク操作を簡単に保護できるカスタムフック

```tsx
import { usePasswordProtectedAction } from "@/lib/hooks/usePasswordProtectedAction";
import PasswordVerificationModal from "@/components/PasswordVerificationModal";

function MyComponent() {
  const { isModalOpen, executeProtectedAction, handleVerified, handleClose } =
    usePasswordProtectedAction();

  const dangerousAction = () => {
    // 危険な操作
    console.log("重要な処理を実行");
  };

  return (
    <>
      <button onClick={() => executeProtectedAction(dangerousAction)}>
        重要な操作を実行
      </button>

      <PasswordVerificationModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onVerified={handleVerified}
      />
    </>
  );
}
```

## 実装例

### 1. アカウント削除
`/settings` ページに実装済み（`AccountDangerZone`）

- セキュリティ設定完了済みユーザーのみ表示
- 確認ダイアログ → パスワード認証 → 削除実行
- コンポーネント: `AccountDangerZone`

### 2. 決済確認
高額決済向け `PaymentConfirmation` コンポーネントを用意（呼び出し側で利用）

```tsx
import PaymentConfirmation from "@/components/PaymentConfirmation";

<PaymentConfirmation
  amount={50000}
  description="大会エントリー費用"
  onConfirm={async () => {
    // 決済処理
    await processPayment();
  }}
  onCancel={() => {
    // キャンセル処理
    router.back();
  }}
/>
```

### 3. カスタム実装例

```tsx
"use client";

import { usePasswordProtectedAction } from "@/lib/hooks/usePasswordProtectedAction";
import PasswordVerificationModal from "@/components/PasswordVerificationModal";

export default function SensitiveDataExport() {
  const { isModalOpen, executeProtectedAction, handleVerified, handleClose } =
    usePasswordProtectedAction();

  const exportData = async () => {
    // データエクスポート処理
    const response = await fetch("/api/export-data");
    const blob = await response.blob();
    // ダウンロード処理...
  };

  return (
    <>
      <button onClick={() => executeProtectedAction(exportData)}>
        個人データをエクスポート
      </button>

      <PasswordVerificationModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onVerified={handleVerified}
        title="データエクスポートの確認"
        description="個人データをエクスポートするには、パスワードを入力してください"
      />
    </>
  );
}
```

## APIエンドポイント

### パスワード検証
`POST /api/user/verify-password`

既に実装済み（電話番号変更で使用中）

```typescript
// リクエスト
{
  "password": "userpassword123"
}

// レスポンス（成功）
{
  "success": true
}

// レスポンス（失敗）
{
  "error": "パスワードが正しくありません"
}
```

### アカウント削除
`POST /api/user/delete-account`

新規実装

- 認証済みユーザーのみ
- 関連データをトランザクションで削除
- セッションクッキーを削除

## 推奨される使用シーン

1. **必須**: セキュリティに影響する操作
   - アカウント削除
   - 電話番号変更（実装済み）
   - メールアドレス変更
   - パスワード変更

2. **推奨**: 高額な金銭取引
   - 10,000円以上の決済
   - 返金処理
   - サブスクリプション解約

3. **オプション**: 重要なデータ操作
   - 個人データのエクスポート
   - 大会エントリーの取り消し
   - 重要な設定の変更

## 設計のポイント

- パスワード未設定ユーザーには機能を非表示
- モーダルはESCキーやオーバーレイクリックで閉じられる
- エラーメッセージは明確に表示
- ローディング状態を適切に管理
- ダークモード対応

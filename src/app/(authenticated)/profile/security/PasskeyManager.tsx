"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type PasskeyCredential = {
  id: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  lastUsedAt: string | null;
};

type Props = {
  /** 未登録時にパスキー推奨の案内を強調する */
  promoteWhenEmpty?: boolean;
};

export default function PasskeyManager({ promoteWhenEmpty = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/passkeys", { method: "GET" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "取得に失敗しました");
      }

      setCredentials(data.credentials ?? []);
    } catch (err) {
      console.error("Passkey list error:", err);
      toast.error("パスキー情報の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("このパスキーを削除しますか？");
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "削除に失敗しました");
      }

      toast.success("パスキーを削除しました");
      setCredentials((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error("Passkey delete error:", err);
      toast.error("パスキーの削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (id: string, currentLabel: string) => {
    const label = window.prompt("パスキー名を入力してください", currentLabel);
    if (!label) return;

    setLoading(true);
    try {
      const res = await fetch("/api/passkeys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, label }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "更新に失敗しました");
      }

      toast.success("パスキー名を更新しました");
      setCredentials((prev) =>
        prev.map((item) => (item.id === id ? { ...item, label } : item))
      );
    } catch (err) {
      console.error("Passkey rename error:", err);
      toast.error("パスキー名の更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>パスキー管理</CardTitle>
        <CardDescription>
          パスキー（FIDO2 / 顔・指紋など）は、SMS やパスワードよりフィッシングに強く、端末に紐づくログイン手段です。複数端末にはそれぞれ登録してください。再登録すると、ログイン画面でメール入力なしのパスキー利用がしやすくなります。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {promoteWhenEmpty && (
          <div
            className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground"
            role="status"
          >
            まだパスキーがありません。スマホや PC のログインを安全にするため、まずはこの端末から
            <strong className="font-semibold"> パスキーを追加</strong>することを推奨します。
          </div>
        )}
        <Button type="button" onClick={() => (window.location.href = "/register/passkey?returnTo=%2Fprofile%2Fsecurity")}>パスキーを追加</Button>

        {loading && credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            登録済みのパスキーはありません。ログイン画面の「パスキーでログイン」も利用できます。
          </p>
        ) : (
          <ul className="space-y-3">
            {credentials.map((credential) => (
              <li key={credential.id} className="flex flex-col gap-3 rounded border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{credential.label || "パスキー"}</p>
                  <p className="text-xs text-muted-foreground">
                    追加日: {new Date(credential.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    最終使用: {credential.lastUsedAt ? new Date(credential.lastUsedAt).toLocaleString() : "未使用"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleRename(credential.id, credential.label || "パスキー")}
                    disabled={loading}
                  >
                    名前変更
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDelete(credential.id)}
                    disabled={loading}
                  >
                    削除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

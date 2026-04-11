"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AutofillSyncForm } from "@/components/ui/autofill-sync-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AssociationOption = {
  id: string;
  name: string;
  abbreviation: string | null;
};

type AssociationAccessGrantFormProps = {
  associations: AssociationOption[];
  initialAssociationId?: string;
};

export default function AssociationAccessGrantForm({
  associations,
  initialAssociationId,
}: AssociationAccessGrantFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [associationId, setAssociationId] = useState(
    initialAssociationId && associations.some((item) => item.id === initialAssociationId)
      ? initialAssociationId
      : associations[0]?.id ?? ""
  );
  const [userEmail, setUserEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!associationId) {
      toast.error("協会を選択してください");
      return;
    }

    if (!userEmail.trim()) {
      toast.error("メールアドレスを入力してください");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/associations/${associationId}/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "協会アクセス権限の付与に失敗しました");
      }

      toast.success("協会アクセス権限を付与しました");
      setUserEmail("");
      router.refresh();
    } catch (error) {
      console.error("Grant association access error:", error);
      toast.error(
        error instanceof Error ? error.message : "協会アクセス権限の付与に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  if (associations.length === 0) {
    return (
      <Card padding="none" className="border-border/90">
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <UserPlus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="space-y-1">
              <CardTitle className="text-lg">協会アクセス権限の付与</CardTitle>
              <CardDescription>対象の協会がまだありません。先に協会を作成してください。</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card padding="none" className="border-border/90 overflow-hidden">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
            <UserPlus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-lg">協会アクセス権限の付与</CardTitle>
            <CardDescription>
              既に登録済みのユーザーに、メールアドレスで協会管理者権限を付与します。
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <AutofillSyncForm onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="associationId">対象協会</Label>
            <Select value={associationId} onValueChange={setAssociationId}>
              <SelectTrigger id="associationId">
                <SelectValue placeholder="協会を選択" />
              </SelectTrigger>
              <SelectContent>
                {associations.map((association) => (
                  <SelectItem key={association.id} value={association.id}>
                    {association.abbreviation
                      ? `${association.name} (${association.abbreviation})`
                      : association.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="userEmail">付与先メールアドレス</Label>
            <Input
              id="userEmail"
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="user@example.com"
              autoComplete="email"
              maxLength={255}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border/80 pt-5">
            <Button type="submit" disabled={loading}>
              {loading ? "付与中..." : "アクセス権限を付与"}
            </Button>
          </div>
        </AutofillSyncForm>
      </CardContent>
    </Card>
  );
}

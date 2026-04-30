"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Target = "ALL" | "ROLE";
type Role = "USER" | "ORG_ADMIN" | "PF_ADMIN" | "CLUB_ADMIN";

export default function AdminNotificationBroadcastForm() {
  const [target, setTarget] = useState<Target>("ALL");
  const [role, setRole] = useState<Role>("USER");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<null | {
    totalCount: number;
    successCount: number;
    failureCount: number;
    notificationJobId: string;
  }>(null);

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("タイトルと本文を入力してください");
      return;
    }
    const scope =
      target === "ALL"
        ? "全ユーザー"
        : `ロール「${role}」のユーザー`;
    if (
      !confirm(
        `${scope}へ通知を一斉配信します。よろしいですか？\n\nタイトル: ${title.trim()}`
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          role: target === "ROLE" ? role : undefined,
          title: title.trim(),
          body: body.trim(),
          linkUrl: linkUrl.trim() ? linkUrl.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as {
        totalCount: number;
        successCount: number;
        failureCount: number;
        notificationJobId: string;
      };
      setLastResult(data);
      toast.success("一斉配信を実行しました");
    } catch (error) {
      console.error("broadcast submit error", error);
      toast.error("一斉配信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <h1 className="text-xl font-semibold">通知の一斉配信</h1>

      <div className="space-y-1">
        <Label htmlFor="target">配信対象</Label>
        <select
          id="target"
          value={target}
          onChange={(e) => setTarget(e.target.value as Target)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="ALL">全ユーザー</option>
          <option value="ROLE">ロール指定</option>
        </select>
      </div>

      {target === "ROLE" ? (
        <div className="space-y-1">
          <Label htmlFor="role">ロール</Label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="USER">USER</option>
            <option value="ORG_ADMIN">ORG_ADMIN</option>
            <option value="PF_ADMIN">PF_ADMIN</option>
            <option value="CLUB_ADMIN">CLUB_ADMIN（クラブ管理者・承認済み所属）</option>
          </select>
        </div>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor="title">タイトル</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: システムメンテナンスのお知らせ"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="body">本文</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="配信メッセージ"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="linkUrl">リンクURL（任意）</Label>
        <Input
          id="linkUrl"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>

      <Button onClick={submit} disabled={submitting}>
        {submitting ? "配信中..." : "一斉配信する"}
      </Button>

      {lastResult ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          対象 {lastResult.totalCount} 件 / 成功 {lastResult.successCount} 件 / 失敗{" "}
          {lastResult.failureCount} 件 / Job: {lastResult.notificationJobId}
        </div>
      ) : null}
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  content: string;
  publishedAt: string | null;
  createdAt: string;
};

type Props = {
  competitionId: string;
  initialAnnouncements: Announcement[];
  canEdit: boolean;
};

export default function CompetitionAnnouncementsManager({ 
  competitionId, 
  initialAnnouncements, 
  canEdit 
}: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      alert("タイトルと内容を入力してください");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, content: newContent }),
      });

      if (!response.ok) throw new Error("Failed to create announcement");

      const newAnnouncement = await response.json();
      setAnnouncements([newAnnouncement, ...announcements]);
      setNewTitle("");
      setNewContent("");
      setIsEditing(false);
    } catch (error) {
      console.error("Error creating announcement:", error);
      alert("お知らせの追加に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このお知らせを削除しますか？")) return;

    try {
      const response = await fetch(`/api/competitions/${competitionId}/announcements/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete announcement");

      setAnnouncements(announcements.filter(a => a.id !== id));
    } catch (error) {
      console.error("Error deleting announcement:", error);
      alert("お知らせの削除に失敗しました");
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">お知らせ</CardTitle>
            <CardDescription className="text-xs">大会ページに表示されるお知らせです。</CardDescription>
          </div>
          {canEdit && !isEditing && (
            <Button onClick={() => setIsEditing(true)} size="sm" className="h-8 text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" />
              追加
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-3">
        {isEditing && (
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <input
              type="text"
              placeholder="タイトル"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <textarea
              placeholder="内容"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={isSubmitting}>
                {isSubmitting ? "追加中…" : "追加"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setIsEditing(false);
                  setNewTitle("");
                  setNewContent("");
                }}
              >
                キャンセル
              </Button>
            </div>
          </div>
        )}

        {announcements.length > 0 ? (
          <div className="space-y-2">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                className="rounded-md border border-border bg-muted/15 px-2.5 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold">{announcement.title}</h4>
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                      {announcement.content}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(announcement.createdAt).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleDelete(announcement.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-xs text-muted-foreground">お知らせはまだありません</p>
        )}
      </CardContent>
    </Card>
  );
}

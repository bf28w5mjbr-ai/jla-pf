"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>お知らせ</CardTitle>
          {canEdit && !isEditing && (
            <Button onClick={() => setIsEditing(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              追加
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing && (
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
            <input
              type="text"
              placeholder="タイトル"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            />
            <textarea
              placeholder="内容"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border rounded-md"
            />
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={isSubmitting}>
                {isSubmitting ? "追加中..." : "追加"}
              </Button>
              <Button 
                variant="outline" 
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
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold">{announcement.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                      {announcement.content}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(announcement.createdAt).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(announcement.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center py-4">
            お知らせはまだありません
          </p>
        )}
      </CardContent>
    </Card>
  );
}

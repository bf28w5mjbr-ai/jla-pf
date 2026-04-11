"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pin, Trash2, Plus, X, Send } from "lucide-react";
import { isClubAdminRole } from "@/lib/roleScopes";

type AnnouncementAuthor = {
  id: string;
  familyName: string;
  givenName: string;
};

type Announcement = {
  id: string;
  clubId: string;
  authorId: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  author: AnnouncementAuthor;
};

type ClubAnnouncementsProps = {
  clubId: string;
  currentUserId: string;
  currentUserRole: "ADMIN" | "MEMBER" | string;
};

export default function ClubAnnouncements({
  clubId,
  currentUserId,
  currentUserRole,
}: ClubAnnouncementsProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  const canCreateAnnouncement = isClubAdminRole(currentUserRole);

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/clubs/${clubId}/announcements`);
      if (!res.ok) throw new Error("Failed to load announcements");
      const data = await res.json();
      setAnnouncements(data);
    } catch (error) {
      console.error("Load announcements error:", error);
      toast.error("お知らせの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("タイトルと内容を入力してください");
      return;
    }

    try {
      setCreating(true);
      const res = await fetch(`/api/clubs/${clubId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, isPinned }),
      });

      if (!res.ok) throw new Error("Failed to create announcement");

      toast.success("お知らせを投稿しました");
      setTitle("");
      setContent("");
      setIsPinned(false);
      setShowCreateForm(false);
      loadAnnouncements();
    } catch (error) {
      console.error("Create announcement error:", error);
      toast.error("お知らせの投稿に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const handleTogglePin = async (announcementId: string) => {
    try {
      const res = await fetch(`/api/clubs/${clubId}/announcements/${announcementId}`, {
        method: "PUT",
      });

      if (!res.ok) throw new Error("Failed to toggle pin");

      toast.success("ピン留めを更新しました");
      loadAnnouncements();
    } catch (error) {
      console.error("Toggle pin error:", error);
      toast.error("ピン留めの更新に失敗しました");
    }
  };

  const handleDelete = async (announcementId: string) => {
    if (!confirm("このお知らせを削除しますか？")) return;

    try {
      const res = await fetch(`/api/clubs/${clubId}/announcements/${announcementId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete announcement");

      toast.success("お知らせを削除しました");
      loadAnnouncements();
    } catch (error) {
      console.error("Delete announcement error:", error);
      toast.error("お知らせの削除に失敗しました");
    }
  };

  if (loading) {
    return <div>読み込み中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">クラブのお知らせ</h2>
        {canCreateAnnouncement && (
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            variant={showCreateForm ? "outline" : "default"}
            size="sm"
            className="h-9 px-4 shadow-sm"
          >
            {showCreateForm ? (
              <>
                <X className="h-4 w-4" />
                入力を閉じる
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                お知らせを作成
              </>
            )}
          </Button>
        )}
      </div>

      {showCreateForm && (
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">タイトル</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="お知らせのタイトル"
              />
            </div>
            <div>
              <Label htmlFor="content">内容</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="お知らせの内容"
                rows={6}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPinned"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
              />
              <Label htmlFor="isPinned">ピン留めする</Label>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="h-9 px-4 shadow-sm">
              <Send className="h-4 w-4" />
              {creating ? "投稿中..." : "投稿する"}
            </Button>
          </div>
        </Card>
      )}

      {announcements.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          お知らせはまだありません
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => {
            const isAuthor = announcement.authorId === currentUserId;
            const canDelete = isAuthor || isClubAdminRole(currentUserRole);
            const canPin = isClubAdminRole(currentUserRole);

            return (
              <Card
                key={announcement.id}
                className={announcement.isPinned ? "border-orange-500 border-2" : ""}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{announcement.title}</h3>
                      {announcement.isPinned && (
                        <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded">
                          ピン留め
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {canPin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTogglePin(announcement.id)}
                        >
                          <Pin
                            className={`h-4 w-4 ${announcement.isPinned ? "fill-current" : ""}`}
                          />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(announcement.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap mb-3">
                    {announcement.content}
                  </p>
                  <div className="text-sm text-gray-500">
                    投稿者: {announcement.author.familyName} {announcement.author.givenName} •{" "}
                    {new Date(announcement.createdAt).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Pin, Trash2, Plus, X, Send } from "lucide-react";
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
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  const [isPublished, setIsPublished] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingContent, setEditingContent] = useState("");
  const [editingPinned, setEditingPinned] = useState(false);
  const [editingPublished, setEditingPublished] = useState(true);

  const canCreateAnnouncement = isClubAdminRole(currentUserRole);

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/clubs/${clubId}/announcements`);
      if (!res.ok) throw new Error("Failed to load announcements");
      const data = (await res.json()) as Announcement[];
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
        body: JSON.stringify({ title, content, isPinned, isPublished }),
      });

      if (!res.ok) throw new Error("Failed to create announcement");

      toast.success("お知らせを投稿しました");
      setTitle("");
      setContent("");
      setIsPinned(false);
      setIsPublished(true);
      setShowCreateForm(false);
      void loadAnnouncements();
    } catch (error) {
      console.error("Create announcement error:", error);
      toast.error("お知らせの投稿に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const handleTogglePin = async (announcement: Announcement) => {
    try {
      const res = await fetch(`/api/clubs/${clubId}/announcements/${announcement.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !announcement.isPinned }),
      });

      if (!res.ok) throw new Error("Failed to toggle pin");

      toast.success("ピン留めを更新しました");
      void loadAnnouncements();
    } catch (error) {
      console.error("Toggle pin error:", error);
      toast.error("ピン留めの更新に失敗しました");
    }
  };

  const handleTogglePublished = async (announcement: Announcement) => {
    try {
      const res = await fetch(`/api/clubs/${clubId}/announcements/${announcement.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !announcement.publishedAt }),
      });

      if (!res.ok) throw new Error("Failed to toggle published");

      toast.success("公開状態を更新しました");
      void loadAnnouncements();
    } catch (error) {
      console.error("Toggle published error:", error);
      toast.error("公開状態の更新に失敗しました");
    }
  };

  const startEdit = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setEditingTitle(announcement.title);
    setEditingContent(announcement.content);
    setEditingPinned(announcement.isPinned);
    setEditingPublished(Boolean(announcement.publishedAt));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
    setEditingContent("");
    setEditingPinned(false);
    setEditingPublished(true);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    if (!editingTitle.trim() || !editingContent.trim()) {
      toast.error("タイトルと内容を入力してください");
      return;
    }
    try {
      setCreating(true);
      const res = await fetch(`/api/clubs/${clubId}/announcements/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingTitle,
          content: editingContent,
          isPinned: editingPinned,
          isPublished: editingPublished,
        }),
      });
      if (!res.ok) throw new Error("Failed to update announcement");

      toast.success("お知らせを更新しました");
      cancelEdit();
      void loadAnnouncements();
    } catch (error) {
      console.error("Update announcement error:", error);
      toast.error("お知らせの更新に失敗しました");
    } finally {
      setCreating(false);
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
      void loadAnnouncements();
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublished"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
              />
              <Label htmlFor="isPublished">作成時に公開する</Label>
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
            const canManage = isClubAdminRole(currentUserRole);

            return (
              <Card
                key={announcement.id}
                className={announcement.isPinned ? "border-orange-500 border-2" : ""}
              >
                <div className="p-6">
                  {editingId === announcement.id ? (
                    <div className="space-y-3">
                      <Input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        placeholder="タイトル"
                      />
                      <Textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        rows={6}
                        placeholder="内容"
                      />
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingPinned}
                            onChange={(e) => setEditingPinned(e.target.checked)}
                          />
                          ピン留め
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingPublished}
                            onChange={(e) => setEditingPublished(e.target.checked)}
                          />
                          公開する
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveEdit} disabled={creating}>
                          保存
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">{announcement.title}</h3>
                          {announcement.isPinned && (
                            <span className="rounded bg-orange-500 px-2 py-1 text-xs text-white">
                              ピン留め
                            </span>
                          )}
                          <span
                            className={`rounded px-2 py-1 text-xs ${
                              announcement.publishedAt
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {announcement.publishedAt ? "公開中" : "下書き"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTogglePublished(announcement)}
                            >
                              {announcement.publishedAt ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTogglePin(announcement)}
                            >
                              <Pin
                                className={`h-4 w-4 ${announcement.isPinned ? "fill-current" : ""}`}
                              />
                            </Button>
                          )}
                          {canManage && (
                            <Button variant="ghost" size="sm" onClick={() => startEdit(announcement)}>
                              <Pencil className="h-4 w-4" />
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
                      <p className="mb-3 whitespace-pre-wrap text-gray-700">{announcement.content}</p>
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
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Pencil,
  Pin,
  Trash2,
  Plus,
  X,
  Send,
} from "lucide-react";
import { isClubAdminRole } from "@/lib/roleScopes";
import { cn } from "@/lib/utils";
import {
  ClubEditorialEmptyState,
  ClubEditorialFormPanel,
  ClubEditorialLoadingState,
  OrgEditorialPanel,
  OrgSubheading,
} from "@/components/clubEditorialUi";

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

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

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
    return <ClubEditorialLoadingState label="お知らせを読み込み中" />;
  }

  return (
    <OrgEditorialPanel accent="orange" className="!px-4 !py-3 sm:!px-5 sm:!py-4">
      <div className="flex items-center justify-between gap-2">
        <OrgSubheading>Announcements</OrgSubheading>
        {canCreateAnnouncement ? (
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            variant={showCreateForm ? "outline" : "default"}
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
          >
            {showCreateForm ? (
              <>
                <X className="size-3.5" aria-hidden />
                閉じる
              </>
            ) : (
              <>
                <Plus className="size-3.5" aria-hidden />
                作成
              </>
            )}
          </Button>
        ) : null}
      </div>

      {showCreateForm ? (
        <ClubEditorialFormPanel className="mt-2 !px-3 !py-3">
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="title" className="text-xs">
                タイトル
              </Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="content" className="text-xs">
                内容
              </Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
                ピン留め
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                公開
              </label>
            </div>
            <Button onClick={handleCreate} disabled={creating} size="sm" className="h-7 gap-1 px-2 text-xs">
              <Send className="size-3.5" aria-hidden />
              {creating ? "投稿中..." : "投稿"}
            </Button>
          </div>
        </ClubEditorialFormPanel>
      ) : null}

      <div className="mt-2">
        {announcements.length === 0 ? (
          <ClubEditorialEmptyState message="お知らせはまだありません" />
        ) : (
          <ul className="divide-y divide-border/45 overflow-hidden rounded-lg border border-border/55 bg-card/50">
            {announcements.map((announcement) => {
              const isAuthor = announcement.authorId === currentUserId;
              const canDelete = isAuthor || isClubAdminRole(currentUserRole);
              const canManage = isClubAdminRole(currentUserRole);
              const isEditing = editingId === announcement.id;

              if (isEditing) {
                return (
                  <li key={announcement.id} className="space-y-2 px-3 py-2.5">
                    <Input
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      className="text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={editingPinned}
                          onChange={(e) => setEditingPinned(e.target.checked)}
                        />
                        ピン留め
                      </label>
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={editingPublished}
                          onChange={(e) => setEditingPublished(e.target.checked)}
                        />
                        公開
                      </label>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSaveEdit} disabled={creating}>
                        保存
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={cancelEdit}>
                        取消
                      </Button>
                    </div>
                  </li>
                );
              }

              return (
                <li key={announcement.id}>
                  <details
                    className="group"
                    open={announcement.isPinned || undefined}
                  >
                    <summary className="flex cursor-pointer list-none items-start gap-1.5 px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden hover:bg-muted/20">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            {announcement.title}
                          </span>
                          <ChevronDown
                            className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                            aria-hidden
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {announcement.isPinned ? (
                            <Badge
                              variant="outline"
                              className="h-4 gap-0.5 border-orange-300/70 bg-orange-50 px-1 text-[10px] font-normal text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100"
                            >
                              <Pin className="size-2.5 fill-current" aria-hidden />
                              固定
                            </Badge>
                          ) : null}
                          {!announcement.publishedAt ? (
                            <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">
                              下書き
                            </Badge>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground">
                            {formatShortDate(announcement.createdAt)}
                          </span>
                        </div>
                      </div>
                    </summary>
                    <div className="space-y-2 border-t border-border/40 px-3 pb-2.5 pt-2">
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
                        {announcement.content}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] text-muted-foreground">
                          {announcement.author.familyName} {announcement.author.givenName}
                        </p>
                        {(canManage || canDelete) && (
                          <div className="flex items-center gap-0.5">
                            {canManage ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => handleTogglePublished(announcement)}
                                  aria-label={announcement.publishedAt ? "非公開" : "公開"}
                                >
                                  {announcement.publishedAt ? (
                                    <EyeOff className="size-3.5" aria-hidden />
                                  ) : (
                                    <Eye className="size-3.5" aria-hidden />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => handleTogglePin(announcement)}
                                  aria-label="ピン留め"
                                >
                                  <Pin
                                    className={cn(
                                      "size-3.5",
                                      announcement.isPinned && "fill-current text-orange-600"
                                    )}
                                    aria-hidden
                                  />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => startEdit(announcement)}
                                  aria-label="編集"
                                >
                                  <Pencil className="size-3.5" aria-hidden />
                                </Button>
                              </>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(announcement.id)}
                                aria-label="削除"
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OrgEditorialPanel>
  );
}

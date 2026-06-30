"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CompetitionPublicContentSection,
  CompetitionPublicEditButton,
  CompetitionPublicEmptyState,
  CompetitionPublicInlineForm,
  CompetitionPublicListItem,
} from "@/components/competitions/browse/competitionPublicEditUi";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";

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
  layout?: "classic" | "editorial";
};

const inputClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm";
const textareaClassName =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm";

export default function CompetitionAnnouncementsManager({
  competitionId,
  initialAnnouncements,
  canEdit,
  layout = "classic",
}: Props) {
  const isEditorial = layout === "editorial";
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newPublished, setNewPublished] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingContent, setEditingContent] = useState("");
  const [editingPublished, setEditingPublished] = useState(true);
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
        body: JSON.stringify({ title: newTitle, content: newContent, isPublished: newPublished }),
      });

      if (!response.ok) throw new Error("Failed to create announcement");

      const newAnnouncement = await response.json();
      setAnnouncements([newAnnouncement, ...announcements]);
      setNewTitle("");
      setNewContent("");
      setNewPublished(true);
      setIsEditing(false);
    } catch (error) {
      console.error("Error creating announcement:", error);
      alert("お知らせの追加に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setEditingTitle(announcement.title);
    setEditingContent(announcement.content);
    setEditingPublished(Boolean(announcement.publishedAt));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
    setEditingContent("");
    setEditingPublished(true);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editingTitle.trim() || !editingContent.trim()) {
      alert("タイトルと内容を入力してください");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/announcements/${editingId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editingTitle,
            content: editingContent,
            isPublished: editingPublished,
          }),
        }
      );
      if (!response.ok) throw new Error("Failed to update announcement");
      const updated = (await response.json()) as Announcement;
      setAnnouncements((prev) =>
        prev.map((a) =>
          a.id === updated.id
            ? {
                ...a,
                ...updated,
                createdAt: new Date(updated.createdAt).toISOString(),
                publishedAt: updated.publishedAt ? new Date(updated.publishedAt).toISOString() : null,
              }
            : a
        )
      );
      cancelEdit();
    } catch (error) {
      console.error("Error updating announcement:", error);
      alert("お知らせの更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePublished = async (announcement: Announcement) => {
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/announcements/${announcement.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublished: !announcement.publishedAt }),
        }
      );
      if (!response.ok) throw new Error("Failed to update publish state");
      const updated = (await response.json()) as Announcement;
      setAnnouncements((prev) =>
        prev.map((a) =>
          a.id === updated.id
            ? {
                ...a,
                ...updated,
                createdAt: new Date(updated.createdAt).toISOString(),
                publishedAt: updated.publishedAt ? new Date(updated.publishedAt).toISOString() : null,
              }
            : a
        )
      );
    } catch (error) {
      console.error("Error updating publish state:", error);
      alert("公開状態の更新に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このお知らせを削除しますか？")) return;

    try {
      const response = await fetch(`/api/competitions/${competitionId}/announcements/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete announcement");

      setAnnouncements(announcements.filter((a) => a.id !== id));
    } catch (error) {
      console.error("Error deleting announcement:", error);
      alert("お知らせの削除に失敗しました");
    }
  };

  const headerActions =
    canEdit && !isEditing ? (
      <CompetitionPublicEditButton onClick={() => setIsEditing(true)}>
        <Plus className="h-3.5 w-3.5" />
        追加
      </CompetitionPublicEditButton>
    ) : null;

  const body = (
    <div className="space-y-3">
      {isEditing ? (
        <CompetitionPublicInlineForm>
          <input
            type="text"
            placeholder="タイトル"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className={inputClassName}
          />
          <textarea
            placeholder="内容"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            className={textareaClassName}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={newPublished}
              onChange={(e) => setNewPublished(e.target.checked)}
            />
            作成時に公開する
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={isSubmitting}>
              {isSubmitting ? "追加中…" : "追加"}
            </Button>
            <CompetitionPublicEditButton
              onClick={() => {
                setIsEditing(false);
                setNewTitle("");
                setNewContent("");
              }}
            >
              キャンセル
            </CompetitionPublicEditButton>
          </div>
        </CompetitionPublicInlineForm>
      ) : null}

      {announcements.length > 0 ? (
        <div className={cn(isEditorial ? "divide-y divide-border/45" : "space-y-2")}>
          {announcements.map((announcement) => (
            <CompetitionPublicListItem key={announcement.id} layout={layout}>
              {editingId === announcement.id ? (
                <CompetitionPublicInlineForm>
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    className={inputClassName}
                  />
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    rows={3}
                    className={textareaClassName}
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={editingPublished}
                      onChange={(e) => setEditingPublished(e.target.checked)}
                    />
                    公開する
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 text-xs" onClick={saveEdit} disabled={isSubmitting}>
                      保存
                    </Button>
                    <CompetitionPublicEditButton onClick={cancelEdit}>キャンセル</CompetitionPublicEditButton>
                  </div>
                </CompetitionPublicInlineForm>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditorial && !canEdit ? (
                      <p className="text-[11px] font-medium tabular-nums uppercase tracking-[0.14em] text-muted-foreground/80">
                        {new Date(announcement.createdAt).toLocaleDateString("ja-JP")}
                      </p>
                    ) : null}
                    <h4
                      className={cn(
                        "font-semibold tracking-tight text-foreground",
                        isEditorial ? "mt-1 text-[0.9375rem]" : "text-sm"
                      )}
                    >
                      {announcement.title}
                    </h4>
                    <p
                      className={cn(
                        "mt-1.5 whitespace-pre-wrap",
                        isEditorial
                          ? "text-sm leading-[1.75] text-foreground/85"
                          : "text-xs text-muted-foreground"
                      )}
                    >
                      {announcement.content}
                    </p>
                    {canEdit ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px]",
                            announcement.publishedAt
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {announcement.publishedAt ? "公開中" : "下書き"}
                        </span>
                      </div>
                    ) : null}
                    {!isEditorial || canEdit ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(announcement.createdAt).toLocaleDateString("ja-JP")}
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => togglePublished(announcement)}
                      >
                        {announcement.publishedAt ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(announcement)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(announcement.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </CompetitionPublicListItem>
          ))}
        </div>
      ) : (
        <CompetitionPublicEmptyState>お知らせはまだありません</CompetitionPublicEmptyState>
      )}
    </div>
  );

  return (
    <CompetitionPublicContentSection
      layout={layout}
      subheading="News"
      title="お知らせ"
      titleExtra={headerActions}
      description="大会ページに表示されるお知らせです。"
      accent="orange"
      contentClassName="space-y-3"
    >
      {body}
    </CompetitionPublicContentSection>
  );
}

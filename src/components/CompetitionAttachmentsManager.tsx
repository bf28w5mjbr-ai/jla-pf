"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CompetitionPublicContentSection,
  CompetitionPublicEditButton,
  CompetitionPublicEmptyState,
} from "@/components/competitions/browse/competitionPublicEditUi";
import { Upload, Trash2, FileText } from "lucide-react";

type Attachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
};

type Props = {
  competitionId: string;
  initialAttachments: Attachment[];
  canEdit: boolean;
  layout?: "classic" | "editorial";
};

export default function CompetitionAttachmentsManager({
  competitionId,
  initialAttachments,
  canEdit,
  layout = "classic",
}: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [isUploading, setIsUploading] = useState(false);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("ファイルサイズは10MB以下にしてください");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/competitions/${competitionId}/attachments`, {
        method: "POST",
        body: formData,
      });

      const parsed: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const msg =
          parsed &&
          typeof parsed === "object" &&
          "error" in parsed &&
          typeof (parsed as { error: unknown }).error === "string"
            ? (parsed as { error: string }).error
            : "ファイルのアップロードに失敗しました";
        alert(msg);
        return;
      }

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("id" in parsed) ||
        typeof (parsed as { id: unknown }).id !== "string"
      ) {
        alert("サーバーの応答が不正です");
        return;
      }

      setAttachments([parsed as Attachment, ...attachments]);
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("ファイルのアップロードに失敗しました");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この添付ファイルを削除しますか？")) return;

    try {
      const response = await fetch(`/api/competitions/${competitionId}/attachments/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete attachment");

      setAttachments(attachments.filter((a) => a.id !== id));
    } catch (error) {
      console.error("Error deleting attachment:", error);
      alert("添付ファイルの削除に失敗しました");
    }
  };

  const headerActions = canEdit ? (
    <label>
      <CompetitionPublicEditButton disabled={isUploading} asChild>
        <span className="cursor-pointer">
          <Upload className="h-3.5 w-3.5" />
          {isUploading ? "送信中…" : "アップロード"}
        </span>
      </CompetitionPublicEditButton>
      <input
        type="file"
        onChange={handleFileUpload}
        className="hidden"
        accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.gif,.webp,.avif,application/pdf,image/*"
      />
    </label>
  ) : null;

  return (
    <CompetitionPublicContentSection
      layout={layout}
      subheading="Files"
      title="添付ファイル"
      titleExtra={headerActions}
      description="PDF・画像（JPEG/PNG/GIF/WebP/AVIF）・Office（.docx/.xlsx/.pptx）のみ、10MB以下（大会ページからダウンロード可）"
      accent="muted"
    >
      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/55 bg-muted/10 px-3 py-2.5"
            >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/55 bg-muted/20 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full truncate rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted/40"
                    >
                      {attachment.fileName}
                    </a>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatFileSize(attachment.fileSize)} ·{" "}
                      {new Date(attachment.createdAt).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                </div>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleDelete(attachment.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
            </div>
          ))}
        </div>
      ) : (
        <CompetitionPublicEmptyState>添付はまだありません</CompetitionPublicEmptyState>
      )}
    </CompetitionPublicContentSection>
  );
}

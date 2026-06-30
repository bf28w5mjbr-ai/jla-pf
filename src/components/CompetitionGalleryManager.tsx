"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  CompetitionPublicContentSection,
  CompetitionPublicEditButton,
  CompetitionPublicEmptyState,
} from "@/components/competitions/browse/competitionPublicEditUi";
import { cn } from "@/lib/utils";
import { ImagePlus, Images, Trash2 } from "lucide-react";

export type GalleryPhoto = {
  id: string;
  imageUrl: string;
  fileName: string | null;
  createdAt: string;
};

type Props = {
  competitionId: string;
  initialPhotos: GalleryPhoto[];
  canEdit: boolean;
  layout?: "classic" | "editorial";
};

function isAbsoluteImageUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

export default function CompetitionGalleryManager({
  competitionId,
  initialPhotos,
  canEdit,
  layout = "classic",
}: Props) {
  const isEditorial = layout === "editorial";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>(initialPhotos);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert("ファイルサイズは8MB以下にしてください");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/competitions/${competitionId}/gallery`, {
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
            : "アップロードに失敗しました";
        alert(msg);
        return;
      }

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("id" in parsed) ||
        typeof (parsed as { id: unknown }).id !== "string" ||
        !("imageUrl" in parsed) ||
        typeof (parsed as { imageUrl: unknown }).imageUrl !== "string"
      ) {
        alert("サーバーの応答が不正です");
        return;
      }

      const row = parsed as {
        id: string;
        imageUrl: string;
        fileName: string | null;
        createdAt: string;
      };

      setPhotos((prev) => [
        ...prev,
        {
          id: row.id,
          imageUrl: row.imageUrl,
          fileName: row.fileName,
          createdAt: row.createdAt,
        },
      ]);
    } catch (err) {
      console.error(err);
      alert("アップロードに失敗しました");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (photoId: string) => {
    if (!confirm("この写真を削除しますか？")) return;

    try {
      const response = await fetch(`/api/competitions/${competitionId}/gallery/${photoId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("delete failed");
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch {
      alert("削除に失敗しました");
    }
  };

  const headerActions = canEdit ? (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
        className="sr-only"
        onChange={(ev) => void handleFileChange(ev)}
        disabled={isUploading}
      />
      <CompetitionPublicEditButton
        type="button"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus className="h-3.5 w-3.5" />
        {isUploading ? "アップロード中…" : "写真を追加"}
      </CompetitionPublicEditButton>
    </>
  ) : null;

  const title = (
    <span className="flex items-center gap-2">
      <Images className="size-4 text-primary/80" aria-hidden />
      フォトギャラリー
    </span>
  );

  return (
    <CompetitionPublicContentSection
      layout={layout}
      subheading="Gallery"
      title={title}
      titleExtra={headerActions}
      description="アップロードした写真は大会の公開ページにギャラリーとして表示されます（JPEG・PNG・GIF・WebP・AVIF、各8MBまで・最大60枚）。"
      accent="muted"
      contentClassName="space-y-4"
    >
      {photos.length === 0 ? (
        <CompetitionPublicEmptyState>
          {canEdit
            ? "まだ写真がありません。上のボタンから追加できます。"
            : "公開されている写真はありません。"}
        </CompetitionPublicEmptyState>
      ) : (
        <ul
          className={cn(
            "grid gap-2.5 sm:gap-3",
            isEditorial
              ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
              : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          )}
        >
          {photos.map((p) => (
            <li
              key={p.id}
              className={cn(
                "group relative overflow-hidden bg-muted/20",
                isEditorial
                  ? "aspect-[4/3] rounded-xl ring-1 ring-border/50"
                  : "aspect-square rounded-lg border border-border/60"
              )}
            >
              <Image
                src={p.imageUrl}
                alt={p.fileName || "ギャラリー写真"}
                fill
                className={cn("object-cover", isEditorial && "transition-transform duration-300 group-hover:scale-[1.03]")}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                unoptimized={!isAbsoluteImageUrl(p.imageUrl)}
              />
              {canEdit ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute right-1.5 top-1.5 h-8 w-8 shadow-md opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                  onClick={() => void handleDelete(p.id)}
                  aria-label="写真を削除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </CompetitionPublicContentSection>
  );
}

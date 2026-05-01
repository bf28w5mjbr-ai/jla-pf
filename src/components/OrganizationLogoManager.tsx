"use client";

import { useState, useRef, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OrganizationLogoImage } from "@/components/OrganizationLogoImage";
import { downscaleRasterLogoFileIfLarge, fetchWithConnectionRetry } from "@/lib/browserUploadHelpers";
import {
  tryDirectOrganizationLogoUpload,
  tryJsonBase64OrganizationLogoUpload,
} from "@/lib/organizationLogoDirectUpload";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrganizationLogoManagerProps {
  organizationId: string;
  currentLogoUrl?: string | null;
  organizationName: string;
  canEdit?: boolean;
  /** 一覧・ダッシュなど省スペース向け（プレビュー枠と周辺余白を小さくする） */
  variant?: "default" | "compact";
  /** ルートコンテナのクラス（例: ヒーローでは常に縦積みにする） */
  className?: string;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function formatLogoUploadError(error: unknown): string {
  if (error instanceof TypeError) {
    return "通信がタイムアウトまたは切断されました。回線を確認のうえ、しばらくしてから再度お試しください。";
  }
  if (
    error instanceof DOMException &&
    (error.name === "NotReadableError" ||
      /could not be read|permission problems/i.test(error.message))
  ) {
    return "ファイルを読み取れませんでした。ほかのアプリで開いている場合は閉じるか、クラウド同期の完了後にもう一度お試しください。";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "ロゴのアップロードに失敗しました";
}

export default function OrganizationLogoManager({
  organizationId,
  currentLogoUrl,
  organizationName,
  canEdit = false,
  variant = "default",
  className,
}: OrganizationLogoManagerProps) {
  const router = useRouter();
  const inputId = useId();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentLogoUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(currentLogoUrl || null);
  }, [currentLogoUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;

    if (picked.size > MAX_UPLOAD_BYTES) {
      toast.error("ファイルサイズは8MB以下にしてください");
      return;
    }

    if (!picked.type.startsWith("image/") && !picked.name.toLowerCase().endsWith(".svg")) {
      toast.error("画像ファイルを選択してください");
      return;
    }

    /*
     * input を finally で空にすると、未完了の FileReader が参照する File が無効化され
     * 「The requested file could not be read…」になることがある。
     * 先にバイト列をコピーした File で以降の処理を行う。
     */
    let file: File;
    try {
      file = new File([await picked.arrayBuffer()], picked.name, {
        type: picked.type || "application/octet-stream",
        lastModified: picked.lastModified,
      });
    } catch (err) {
      console.error("Logo file snapshot:", err);
      toast.error(formatLogoUploadError(err));
      e.target.value = "";
      return;
    }

    try {
      const previewDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new DOMException("プレビューを読み込めませんでした", "NotReadableError"));
          }
        };
        reader.onerror = () => reject(reader.error ?? new Error("プレビューを読み込めませんでした"));
        reader.readAsDataURL(file);
      });
      setPreview(previewDataUrl);
    } catch (err) {
      console.error("Logo preview:", err);
      toast.error(formatLogoUploadError(err));
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const uploadFile = await downscaleRasterLogoFileIfLarge(file);

      const direct = await tryDirectOrganizationLogoUpload(organizationId, uploadFile);
      if (direct.kind === "reject") {
        throw new Error(direct.message);
      }

      let logoUrl: string | null = null;
      if (direct.kind === "success") {
        logoUrl = direct.logoUrl;
      } else {
        const jsonTry = await tryJsonBase64OrganizationLogoUpload(organizationId, uploadFile);
        if (jsonTry.kind === "reject") {
          throw new Error(jsonTry.message);
        }
        if (jsonTry.kind === "success") {
          logoUrl = jsonTry.logoUrl;
        } else {
          const formData = new FormData();
          formData.append("file", uploadFile);

          const response = await fetchWithConnectionRetry(
            `/api/organizations/${organizationId}/logo/upload`,
            {
              method: "POST",
              body: formData,
            },
            { attempts: 4, baseDelayMs: 600 },
          );

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(
              typeof data.error === "string" ? data.error : "アップロードに失敗しました",
            );
          }

          const data = await response.json().catch(() => ({}));
          logoUrl = typeof data.logoUrl === "string" ? data.logoUrl : null;
          if (!logoUrl) {
            throw new Error("アップロードに失敗しました");
          }
        }
      }

      setPreview(logoUrl);

      toast.success("団体ロゴを更新しました");
      router.refresh();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(formatLogoUploadError(error));
      setPreview(currentLogoUrl || null);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const clearLogo = async () => {
    if (!confirm("ロゴを削除しますか？")) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/logo/delete`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "削除に失敗しました");
      }
      setPreview(null);
      toast.success("ロゴを削除しました");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  const isCompact = variant === "compact";
  const frameClass = isCompact ? "h-16 w-16" : "h-24 w-24";
  const thumbRadius = isCompact ? "rounded-lg" : "rounded-xl";

  if (!canEdit) {
    return (
      <OrganizationLogoImage
        key={currentLogoUrl ?? "no-logo"}
        logoUrl={currentLogoUrl}
        organizationName={organizationName}
        frameClassName={frameClass}
        className={cn(thumbRadius, "shadow-sm")}
      />
    );
  }

  const showDelete = Boolean(preview || currentLogoUrl);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-start",
        isCompact ? "max-w-none gap-2 sm:gap-3" : "max-w-md gap-3",
        className,
      )}
    >
      <div className="relative shrink-0">
        <label
          htmlFor={inputId}
          className={cn(
            "group relative block cursor-pointer outline-none transition",
            thumbRadius,
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <OrganizationLogoImage
            key={preview ?? "empty"}
            logoUrl={preview}
            organizationName={organizationName}
            frameClassName={frameClass}
            className={cn(thumbRadius, "shadow-sm")}
          />
          <span
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 font-medium text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 group-focus-within:bg-black/45 group-focus-within:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100",
              thumbRadius,
              isCompact ? "px-1 text-[10px] leading-tight" : "text-xs",
            )}
            aria-hidden
          >
            画像を変更
          </span>
        </label>
        {showDelete ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            title="ロゴを削除"
            aria-label="ロゴを削除"
            disabled={deleting || uploading}
            className={cn(
              "absolute z-10 border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-destructive/15 hover:text-destructive",
              isCompact
                ? "bottom-0 right-0 h-6 w-6 rounded-md [&_svg]:size-3"
                : "bottom-1 right-1 h-7 w-7 rounded-md [&_svg]:size-3.5",
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void clearLogo();
            }}
          >
            {deleting ? (
              <Loader2 className={cn("animate-spin", isCompact ? "size-3" : "size-3.5")} aria-hidden />
            ) : (
              <Trash2 aria-hidden />
            )}
          </Button>
        ) : null}
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml,.svg"
          onChange={handleFileChange}
          disabled={uploading}
          className="sr-only"
        />
        {uploading && (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 font-medium backdrop-blur-[1px]",
              thumbRadius,
              isCompact ? "text-[10px] leading-tight" : "text-xs",
            )}
          >
            アップロード中…
          </div>
        )}
      </div>

      {!isCompact ? (
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">
            プレビューはロゴの色に合わせて背景が変わります。透過画像は枠を抑えた表示になります。
          </p>
        </div>
      ) : null}
    </div>
  );
}

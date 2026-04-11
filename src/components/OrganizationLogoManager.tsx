"use client";

import { useState, useRef, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidOrganizationLogoUrl } from "@/lib/organizationLogo";
import { OrganizationLogoImage } from "@/components/OrganizationLogoImage";
import { cn } from "@/lib/utils";

interface OrganizationLogoManagerProps {
  organizationId: string;
  currentLogoUrl?: string | null;
  organizationName: string;
  canEdit?: boolean;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export default function OrganizationLogoManager({
  organizationId,
  currentLogoUrl,
  organizationName,
  canEdit = false,
}: OrganizationLogoManagerProps) {
  const router = useRouter();
  const inputId = useId();
  const [uploading, setUploading] = useState(false);
  const [urlSaving, setUrlSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentLogoUrl || null);
  const [urlDraft, setUrlDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(currentLogoUrl || null);
  }, [currentLogoUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("ファイルサイズは8MB以下にしてください");
      return;
    }

    if (!file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".svg")) {
      toast.error("画像ファイルを選択してください");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/organizations/${organizationId}/logo/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "アップロードに失敗しました");
      }

      const data = await response.json();
      setPreview(data.logoUrl);
      setUrlDraft("");

      toast.success("団体ロゴを更新しました");
      router.refresh();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "ロゴのアップロードに失敗しました");
      setPreview(currentLogoUrl || null);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const clearLogo = async () => {
    if (!confirm("ロゴを削除しますか？")) return;
    setUrlSaving(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/logo/delete`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "削除に失敗しました");
      }
      setPreview(null);
      setUrlDraft("");
      toast.success("ロゴを削除しました");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
    } finally {
      setUrlSaving(false);
    }
  };

  const applyLogoUrl = async () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) {
      toast.error("URLを入力してください");
      return;
    }
    if (!isValidOrganizationLogoUrl(trimmed)) {
      toast.error("https:// で始まる画像URLを入力してください");
      return;
    }

    setUrlSaving(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/logo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "URLの反映に失敗しました");
      }
      setPreview(data.logoUrl ?? trimmed);
      toast.success("ロゴURLを反映しました");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "URLの反映に失敗しました");
    } finally {
      setUrlSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <OrganizationLogoImage
        key={currentLogoUrl ?? "no-logo"}
        logoUrl={currentLogoUrl}
        organizationName={organizationName}
        frameClassName="h-32 w-32"
        className="rounded-xl shadow-sm"
      />
    );
  }

  return (
    <div className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-start">
      <div className="relative shrink-0">
        <label
          htmlFor={inputId}
          className={cn(
            "group relative block cursor-pointer rounded-xl outline-none transition",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <OrganizationLogoImage
            key={preview ?? "empty"}
            logoUrl={preview}
            organizationName={organizationName}
            frameClassName="h-32 w-32"
            className="rounded-xl shadow-sm"
          />
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 text-xs font-medium text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100"
            aria-hidden
          >
            画像を変更
          </span>
        </label>
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
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/70 text-xs font-medium backdrop-blur-[1px]">
            アップロード中…
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs text-muted-foreground">
          プレビューはロゴの色に合わせて背景が変わります。透過画像は枠を抑えた表示になります。
        </p>

        <details className="group rounded-lg border border-border/60 bg-muted/10 open:border-border open:bg-muted/20">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDown
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-open:rotate-180"
            />
            その他（URLで指定・削除）
          </summary>
          <div className="space-y-3 border-t border-border/50 px-3 py-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              自サイトや CDN の <span className="font-medium text-foreground/80">HTTPS</span>{" "}
              画像URLを登録できます（アップロードと同じフィールドです）。
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <Input
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                className="h-9 min-w-0 flex-1 text-sm"
                disabled={urlSaving || uploading}
                autoComplete="off"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9 shrink-0 px-3 text-xs sm:w-auto"
                disabled={urlSaving || uploading}
                onClick={() => void applyLogoUrl()}
              >
                {urlSaving ? "反映中…" : "反映"}
              </Button>
            </div>
            {(preview || currentLogoUrl) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-center text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                disabled={urlSaving || uploading}
                onClick={() => void clearLogo()}
              >
                ロゴを削除
              </Button>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}

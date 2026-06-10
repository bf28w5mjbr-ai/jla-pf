"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  appendProfilePhotoSubjectToFormData,
  detectProfilePhotoSubjectInBrowser,
} from "@/lib/browserProfilePhotoSubject";
import { downscaleProfilePhotoFileIfLarge } from "@/lib/browserUploadHelpers";
import {
  isProfilePhotoWithinSizeLimit,
  profilePhotoFileTooLargeMessage,
} from "@/lib/profilePhotoUpload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DashboardProfilePhotoProps {
  currentPhotoUrl?: string | null;
  userName: string;
  className?: string;
  buttonClassName?: string;
  buttonSize?: "default" | "sm" | "lg" | "icon";
}

export default function DashboardProfilePhoto({
  currentPhotoUrl,
  userName: _userName,
  className,
  buttonClassName,
  buttonSize = "sm",
}: DashboardProfilePhotoProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [, setPreview] = useState<string | null>(currentPhotoUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(currentPhotoUrl || null);
  }, [currentPhotoUrl]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    if (!rawFile.type.startsWith("image/")) {
      toast.error("画像ファイルを選択してください");
      return;
    }

    setUploading(true);
    let file = rawFile;
    try {
      file = await downscaleProfilePhotoFileIfLarge(rawFile);
    } catch {
      file = rawFile;
    }

    if (!isProfilePhotoWithinSizeLimit(file.size)) {
      toast.error(profilePhotoFileTooLargeMessage());
      setUploading(false);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const subject = await detectProfilePhotoSubjectInBrowser(file);
        appendProfilePhotoSubjectToFormData(formData, subject);
      } catch {
        // 構図検出失敗時はサーバー側フォールバック
      }

      const response = await fetch("/api/upload/profile-photo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("アップロードに失敗しました");
      }

      const data = await response.json();
      setPreview(data.url);

      toast.success("プロフィール写真を更新しました");
      router.refresh();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("プロフィール写真のアップロードに失敗しました");
      setPreview(currentPhotoUrl || null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className={cn("relative shrink-0", className)}>
      <Button
        type="button"
        variant={buttonSize === "lg" ? "outline" : "ghost"}
        size={buttonSize}
        onClick={handleClick}
        disabled={uploading}
        aria-label="プロフィール写真を変更"
        title="プロフィール写真を変更"
        className={cn(
          "gap-1.5 text-muted-foreground hover:text-foreground",
          buttonClassName
        )}
      >
        <ImagePlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {uploading ? "送信中…" : "写真"}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}

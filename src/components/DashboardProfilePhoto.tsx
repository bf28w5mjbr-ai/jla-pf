"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface DashboardProfilePhotoProps {
  currentPhotoUrl?: string | null;
  userName: string;
}

export default function DashboardProfilePhoto({ currentPhotoUrl, userName }: DashboardProfilePhotoProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentPhotoUrl || null);
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ファイルサイズチェック（5MB以下）
    if (file.size > 5 * 1024 * 1024) {
      toast.error("ファイルサイズは5MB以下にしてください");
      return;
    }

    // 画像形式チェック
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選択してください");
      return;
    }

    // プレビュー表示
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // アップロード処理
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

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
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        disabled={uploading}
        style={{
          backgroundImage: preview ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : undefined,
          backgroundSize: preview ? '20px 20px' : undefined,
          backgroundPosition: preview ? '0 0, 0 10px, 10px -10px, -10px 0px' : undefined,
        }}
        className="w-24 h-24 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 text-3xl font-medium border border-gray-200 dark:border-gray-700 overflow-hidden hover:opacity-80 transition-opacity cursor-pointer relative"
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={preview} 
            alt={userName}
            className="w-full h-full object-cover"
          />
          </>
        ) : (
          <span>{userName.charAt(0)}</span>
        )}
        {isHovered && !uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-sm font-medium">変更</span>
          </div>
        )}
      </button>
      {uploading && (
        <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
          <div className="text-white text-xs">アップロード中...</div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading}
        className="hidden"
      />
    </div>
  );
}

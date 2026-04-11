"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ProfilePhotoUploadProps {
  currentPhotoUrl?: string | null;
  userName: string;
}

export default function ProfilePhotoUpload({ currentPhotoUrl, userName }: ProfilePhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentPhotoUrl || null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ファイルサイズチェック（5MB以下）
    if (file.size > 5 * 1024 * 1024) {
      alert("ファイルサイズは5MB以下にしてください");
      return;
    }

    // 画像形式チェック
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください");
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
      
      // ページをリロードして変更を反映
      window.location.reload();
    } catch (error) {
      console.error("Upload error:", error);
      alert("プロフィール写真のアップロードに失敗しました");
      setPreview(currentPhotoUrl || null);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("プロフィール写真を削除しますか？")) return;

    setUploading(true);
    try {
      const response = await fetch("/api/upload/profile-photo", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("削除に失敗しました");
      }

      setPreview(null);
      window.location.reload();
    } catch (error) {
      console.error("Delete error:", error);
      alert("プロフィール写真の削除に失敗しました");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="w-32 h-32 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 text-4xl font-medium border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
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
        </div>
        {uploading && (
          <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
            <div className="text-white text-sm">アップロード中...</div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button asChild size="sm" disabled={uploading}>
          <label htmlFor="profile-photo-upload-input" className="cursor-pointer">
            {preview ? "変更" : "アップロード"}
          </label>
        </Button>
        <input
          id="profile-photo-upload-input"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
        
        {preview && (
          <button
            onClick={handleDelete}
            disabled={uploading}
            className="px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            削除
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        5MB以下のJPG、PNG、GIF画像
      </p>
    </div>
  );
}

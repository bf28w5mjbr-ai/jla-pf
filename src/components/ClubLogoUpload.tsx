"use client";

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface ClubLogoUploadProps {
  clubId: string;
  currentLogoUrl: string | null;
  clubName: string;
}

export default function ClubLogoUpload({ clubId, currentLogoUrl, clubName }: ClubLogoUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ファイルサイズチェック (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('ファイルサイズは5MB以下にしてください');
      return;
    }

    // プレビュー表示
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // アップロード
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clubId', clubId);

      const res = await fetch('/api/upload/club-logo', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'アップロードに失敗しました');
      }

      await res.json();
      
      // 成功時は画面をリフレッシュ
      router.refresh();
      setPreview(null);
    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : 'アップロードに失敗しました');
      setPreview(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClick = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  const displayUrl = preview || currentLogoUrl;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <div
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          backgroundImage: displayUrl ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : undefined,
          backgroundSize: displayUrl ? '20px 20px' : undefined,
          backgroundPosition: displayUrl ? '0 0, 0 10px, 10px -10px, -10px 0px' : undefined,
        }}
        className="relative w-32 h-32 rounded-lg border-2 border-gray-300 dark:border-gray-600 overflow-hidden cursor-pointer hover:border-orange-500 dark:hover:border-orange-400 transition-colors"
      >
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={`${clubName}のロゴ`}
            fill
            className="object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {(isHovered || uploading) && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-sm font-medium">
              {uploading ? 'アップロード中...' : '変更'}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        クリックしてロゴをアップロード (最大5MB)
      </p>
    </div>
  );
}

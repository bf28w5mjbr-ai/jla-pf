"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
};

export default function CompetitionAttachmentsManager({ 
  competitionId, 
  initialAttachments, 
  canEdit 
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

    // 10MBまで
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

      if (!response.ok) throw new Error("Failed to upload file");

      const newAttachment = await response.json();
      setAttachments([newAttachment, ...attachments]);
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("ファイルのアップロードに失敗しました");
    } finally {
      setIsUploading(false);
      e.target.value = ""; // Reset input
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この添付ファイルを削除しますか？")) return;

    try {
      const response = await fetch(`/api/competitions/${competitionId}/attachments/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete attachment");

      setAttachments(attachments.filter(a => a.id !== id));
    } catch (error) {
      console.error("Error deleting attachment:", error);
      alert("添付ファイルの削除に失敗しました");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>添付ファイル</CardTitle>
          {canEdit && (
            <label>
              <Button size="sm" disabled={isUploading} asChild>
                <span className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-1" />
                  {isUploading ? "アップロード中..." : "アップロード"}
                </span>
              </Button>
              <input
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
              />
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div 
                key={attachment.id} 
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline truncate block"
                    >
                      {attachment.fileName}
                    </a>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(attachment.fileSize)} • {new Date(attachment.createdAt).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(attachment.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center py-4">
            添付ファイルはまだありません
          </p>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Edit, Save, X, Trash2, Plus } from "lucide-react";

interface Logo {
  name: string;
  logoUrl: string;
}

interface CompetitionRelationsEditorProps {
  competitionId: string;
  sponsors?: string | null;
  cooperators?: string | null;
  cooperatorsLogos?: Logo[] | null;
  supporters?: string | null;
  grants?: string | null;
  grantsLogos?: Logo[] | null;
  canEdit: boolean;
}

export default function CompetitionRelationsEditor({
  competitionId,
  sponsors,
  cooperators,
  cooperatorsLogos,
  supporters,
  grants,
  grantsLogos,
  canEdit,
}: CompetitionRelationsEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingCooperator, setUploadingCooperator] = useState(false);
  const [uploadingGrant, setUploadingGrant] = useState(false);
  
  const cooperatorFileRef = useRef<HTMLInputElement>(null);
  const grantFileRef = useRef<HTMLInputElement>(null);

  const [cooperatorName, setCooperatorName] = useState("");
  const [grantName, setGrantName] = useState("");

  const [formData, setFormData] = useState({
    sponsors: sponsors || "",
    cooperators: cooperators || "",
    supporters: supporters || "",
    grants: grants || "",
  });

  const handleSave = async () => {
    try {
      setLoading(true);

      const response = await fetch(`/api/competitions/${competitionId}/relations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "更新に失敗しました");
      }

      toast.success("関係組織情報を更新しました");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error("Update error:", error);
      toast.error(error instanceof Error ? error.message : "更新に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      sponsors: sponsors || "",
      cooperators: cooperators || "",
      supporters: supporters || "",
      grants: grants || "",
    });
    setIsEditing(false);
  };

  const handleLogoUpload = async (type: "cooperator" | "grant", file: File, name: string) => {
    // 名前が空の場合、ファイル名（拡張子なし）を使用
    const displayName = name.trim() || file.name.replace(/\.[^/.]+$/, "");

    if (file.size > 5 * 1024 * 1024) {
      toast.error("ファイルサイズは5MB以下にしてください");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選択してください");
      return;
    }

    try {
      if (type === "cooperator") {
        setUploadingCooperator(true);
      } else {
        setUploadingGrant(true);
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      formData.append("name", displayName);

      const response = await fetch(`/api/competitions/${competitionId}/relations/logo`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "アップロードに失敗しました");
      }

      toast.success("ロゴをアップロードしました");
      
      if (type === "cooperator") {
        setCooperatorName("");
      } else {
        setGrantName("");
      }
      
      router.refresh();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "アップロードに失敗しました");
    } finally {
      if (type === "cooperator") {
        setUploadingCooperator(false);
      } else {
        setUploadingGrant(false);
      }
    }
  };

  const handleLogoDelete = async (type: "cooperator" | "grant", logoUrl: string) => {
    if (!confirm("ロゴを削除しますか？")) {
      return;
    }

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/relations/logo?type=${type}&logoUrl=${encodeURIComponent(logoUrl)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "削除に失敗しました");
      }

      toast.success("ロゴを削除しました");
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
    }
  };

  const hasAnyData = sponsors || cooperators || supporters || grants || 
    (cooperatorsLogos && cooperatorsLogos.length > 0) || 
    (grantsLogos && grantsLogos.length > 0);

  if (!isEditing && !hasAnyData && !canEdit) {
    return null;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">関係組織</CardTitle>
            <CardDescription className="text-xs">後援・協賛・協力・助成（公開ページに表示）</CardDescription>
          </div>
          {canEdit && !isEditing && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIsEditing(true)}>
              <Edit className="mr-1.5 h-3.5 w-3.5" />
              編集
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 py-3">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="sponsors" className="text-xs">
                後援
              </Label>
              <Textarea
                id="sponsors"
                value={formData.sponsors}
                onChange={(e) => setFormData({ ...formData, sponsors: e.target.value })}
                placeholder="複数ある場合は改行で区切ってください"
                rows={2}
                className="mt-1 min-h-[4rem] text-sm"
              />
            </div>

            <div>
              <Label htmlFor="cooperators" className="text-xs">
                協賛
              </Label>
              <Textarea
                id="cooperators"
                value={formData.cooperators}
                onChange={(e) => setFormData({ ...formData, cooperators: e.target.value })}
                placeholder="複数ある場合は改行で区切ってください"
                rows={2}
                className="mt-1 min-h-[4rem] text-sm"
              />

              {/* 協賛ロゴアップロード */}
              <div className="mt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">協賛ロゴ</p>
                
                {cooperatorsLogos && cooperatorsLogos.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {cooperatorsLogos.map((logo, index) => (
                      <div key={index} className="group">
                        <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
                          <img
                            src={logo.logoUrl}
                            alt={logo.name}
                            className="max-h-full max-w-full object-contain p-1"
                            loading="lazy"
                          />
                        </div>
                        <p className="text-xs mt-1 w-32 truncate text-center">{logo.name}</p>
                        <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full h-6 text-xs"
                            onClick={() => handleLogoDelete("cooperator", logo.logoUrl)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            削除
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {canEdit && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="協賛団体名"
                      value={cooperatorName}
                      onChange={(e) => setCooperatorName(e.target.value)}
                      className="flex-1"
                    />
                    <input
                      ref={cooperatorFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleLogoUpload("cooperator", file, cooperatorName);
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => cooperatorFileRef.current?.click()}
                      disabled={uploadingCooperator}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {uploadingCooperator ? "アップロード中..." : "ロゴ追加"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="supporters" className="text-xs">
                協力
              </Label>
              <Textarea
                id="supporters"
                value={formData.supporters}
                onChange={(e) => setFormData({ ...formData, supporters: e.target.value })}
                placeholder="複数ある場合は改行で区切ってください"
                rows={2}
                className="mt-1 min-h-[4rem] text-sm"
              />
            </div>

            <div>
              <Label htmlFor="grants" className="text-xs">
                助成
              </Label>
              <Textarea
                id="grants"
                value={formData.grants}
                onChange={(e) => setFormData({ ...formData, grants: e.target.value })}
                placeholder="複数ある場合は改行で区切ってください"
                rows={2}
                className="mt-1 min-h-[4rem] text-sm"
              />

              {/* 助成ロゴアップロード */}
              <div className="mt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">助成ロゴ</p>
                
                {grantsLogos && grantsLogos.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {grantsLogos.map((logo, index) => (
                      <div key={index} className="group">
                        <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
                          <img
                            src={logo.logoUrl}
                            alt={logo.name}
                            className="max-h-full max-w-full object-contain p-1"
                            loading="lazy"
                          />
                        </div>
                        <p className="text-xs mt-1 w-32 truncate text-center">{logo.name}</p>
                        <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full h-6 text-xs"
                            onClick={() => handleLogoDelete("grant", logo.logoUrl)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            削除
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {canEdit && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="助成団体名"
                      value={grantName}
                      onChange={(e) => setGrantName(e.target.value)}
                      className="flex-1"
                    />
                    <input
                      ref={grantFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleLogoUpload("grant", file, grantName);
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => grantFileRef.current?.click()}
                      disabled={uploadingGrant}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {uploadingGrant ? "アップロード中..." : "ロゴ追加"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={loading}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {loading ? "保存中…" : "保存"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCancel} disabled={loading}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                キャンセル
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sponsors && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  後援
                </h3>
                <div className="whitespace-pre-wrap text-sm text-foreground">{sponsors}</div>
              </div>
            )}

            {(cooperators || (cooperatorsLogos && cooperatorsLogos.length > 0)) && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  協賛
                </h3>
                {cooperators && (
                  <div className="mb-2 whitespace-pre-wrap text-sm text-foreground">{cooperators}</div>
                )}
                {cooperatorsLogos && cooperatorsLogos.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {cooperatorsLogos.map((logo, index) => (
                      <div key={index}>
                        <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
                          <img
                            src={logo.logoUrl}
                            alt={logo.name}
                            className="max-h-full max-w-full object-contain p-1"
                            loading="lazy"
                          />
                        </div>
                        <p className="text-xs mt-1 w-32 truncate text-center">{logo.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {supporters && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  協力
                </h3>
                <div className="whitespace-pre-wrap text-sm text-foreground">{supporters}</div>
              </div>
            )}

            {(grants || (grantsLogos && grantsLogos.length > 0)) && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  助成
                </h3>
                {grants && <div className="mb-2 whitespace-pre-wrap text-sm text-foreground">{grants}</div>}
                {grantsLogos && grantsLogos.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {grantsLogos.map((logo, index) => (
                      <div key={index}>
                        <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded border border-border bg-muted/30">
                          <img
                            src={logo.logoUrl}
                            alt={logo.name}
                            className="max-h-full max-w-full object-contain p-1"
                            loading="lazy"
                          />
                        </div>
                        <p className="text-xs mt-1 w-32 truncate text-center">{logo.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!hasAnyData && canEdit && (
              <p className="py-3 text-center text-xs text-muted-foreground">関係組織情報が未登録です</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

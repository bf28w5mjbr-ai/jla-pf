"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Edit, Save, X, Trash2, Plus, ImageIcon } from "lucide-react";
import { normalizeRelationLogos, type RelationLogo } from "@/lib/relationLogos";

function isAbsoluteHttpUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

function RelationLogoCard({
  logo,
  canDelete,
  onDelete,
}: {
  logo: RelationLogo;
  canDelete: boolean;
  onDelete?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex w-[8.75rem] flex-col gap-1">
      <div className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/25">
        {!broken ? (
          <Image
            src={logo.logoUrl}
            alt={logo.name}
            fill
            className="object-contain p-1.5"
            sizes="140px"
            unoptimized={isAbsoluteHttpUrl(logo.logoUrl)}
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 py-2 text-center">
            <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
            <span className="text-[10px] leading-tight text-muted-foreground">画像を表示できません</span>
          </div>
        )}
        {canDelete && onDelete ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute right-1 top-1 h-7 w-7 shadow-sm"
            onClick={onDelete}
            aria-label={`${logo.name}のロゴを削除`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      <p className="line-clamp-2 min-h-[2rem] text-center text-[11px] leading-snug text-foreground" title={logo.name}>
        {logo.name}
      </p>
    </div>
  );
}

interface CompetitionRelationsEditorProps {
  competitionId: string;
  sponsors?: string | null;
  cooperators?: string | null;
  cooperatorsLogos?: RelationLogo[] | null;
  supporters?: string | null;
  grants?: string | null;
  grantsLogos?: RelationLogo[] | null;
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
  const normalizedCooperatorLogos = useMemo(
    () => normalizeRelationLogos(cooperatorsLogos),
    [cooperatorsLogos],
  );
  const normalizedGrantLogos = useMemo(() => normalizeRelationLogos(grantsLogos), [grantsLogos]);

  const cooperatorsLogosKey = useMemo(
    () => JSON.stringify(cooperatorsLogos ?? null),
    [cooperatorsLogos],
  );
  const grantsLogosKey = useMemo(() => JSON.stringify(grantsLogos ?? null), [grantsLogos]);

  const [cooperatorLogosOverride, setCooperatorLogosOverride] = useState<RelationLogo[] | null>(null);
  const [grantLogosOverride, setGrantLogosOverride] = useState<RelationLogo[] | null>(null);

  useEffect(() => {
    setCooperatorLogosOverride(null);
  }, [cooperatorsLogosKey]);

  useEffect(() => {
    setGrantLogosOverride(null);
  }, [grantsLogosKey]);

  const cooperatorLogos = cooperatorLogosOverride ?? normalizedCooperatorLogos;
  const grantLogos = grantLogosOverride ?? normalizedGrantLogos;
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

      const data = (await response.json()) as {
        logos?: unknown;
        logoUrl?: string;
        name?: string;
      };
      if (type === "cooperator") {
        if (Array.isArray(data.logos)) {
          setCooperatorLogosOverride(normalizeRelationLogos(data.logos));
        } else if (typeof data.logoUrl === "string") {
          const url = data.logoUrl;
          const nm =
            typeof data.name === "string" && data.name.trim() ? data.name.trim() : displayName;
          setCooperatorLogosOverride((prev) => [
            ...(prev ?? normalizedCooperatorLogos),
            { name: nm, logoUrl: url },
          ]);
        }
        setCooperatorName("");
      } else {
        if (Array.isArray(data.logos)) {
          setGrantLogosOverride(normalizeRelationLogos(data.logos));
        } else if (typeof data.logoUrl === "string") {
          const url = data.logoUrl;
          const nm =
            typeof data.name === "string" && data.name.trim() ? data.name.trim() : displayName;
          setGrantLogosOverride((prev) => [
            ...(prev ?? normalizedGrantLogos),
            { name: nm, logoUrl: url },
          ]);
        }
        setGrantName("");
      }

      toast.success("ロゴをアップロードしました");
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

      if (type === "cooperator") {
        setCooperatorLogosOverride((prev) =>
          (prev ?? normalizedCooperatorLogos).filter((l) => l.logoUrl !== logoUrl)
        );
      } else {
        setGrantLogosOverride((prev) =>
          (prev ?? normalizedGrantLogos).filter((l) => l.logoUrl !== logoUrl)
        );
      }

      toast.success("ロゴを削除しました");
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
    }
  };

  const hasAnyData =
    sponsors ||
    cooperators ||
    supporters ||
    grants ||
    cooperatorLogos.length > 0 ||
    grantLogos.length > 0;

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

              <div className="mt-3 space-y-3 rounded-lg border border-border/80 bg-muted/15 p-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">協賛ロゴ画像</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    ロゴの下に出る「表示名」を入力してから「画像を選ぶ」を押してください。空欄のときはファイル名（拡張子なし）を使います。PNG / JPEG / WebP など、5MB まで。
                  </p>
                </div>
                {cooperatorLogos.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {cooperatorLogos.map((logo) => (
                      <RelationLogoCard
                        key={logo.logoUrl}
                        logo={logo}
                        canDelete={canEdit}
                        onDelete={() => void handleLogoDelete("cooperator", logo.logoUrl)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">まだロゴ画像がありません。</p>
                )}
                {canEdit ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor="cooperator-logo-name" className="text-xs">
                        追加するロゴの表示名
                      </Label>
                      <Input
                        id="cooperator-logo-name"
                        placeholder="例: ○○株式会社"
                        value={cooperatorName}
                        onChange={(e) => setCooperatorName(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <input
                      ref={cooperatorFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleLogoUpload("cooperator", file, cooperatorName);
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 shrink-0 gap-1.5 sm:self-end"
                      onClick={() => cooperatorFileRef.current?.click()}
                      disabled={uploadingCooperator}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      {uploadingCooperator ? "アップロード中…" : "画像を選ぶ"}
                    </Button>
                  </div>
                ) : null}
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

              <div className="mt-3 space-y-3 rounded-lg border border-border/80 bg-muted/15 p-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">助成ロゴ画像</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    表示名を入力してから「画像を選ぶ」を押してください。空欄のときはファイル名（拡張子なし）を使います。PNG / JPEG / WebP など、5MB まで。
                  </p>
                </div>
                {grantLogos.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {grantLogos.map((logo) => (
                      <RelationLogoCard
                        key={logo.logoUrl}
                        logo={logo}
                        canDelete={canEdit}
                        onDelete={() => void handleLogoDelete("grant", logo.logoUrl)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">まだロゴ画像がありません。</p>
                )}
                {canEdit ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor="grant-logo-name" className="text-xs">
                        追加するロゴの表示名
                      </Label>
                      <Input
                        id="grant-logo-name"
                        placeholder="例: ○○財団"
                        value={grantName}
                        onChange={(e) => setGrantName(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <input
                      ref={grantFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleLogoUpload("grant", file, grantName);
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 shrink-0 gap-1.5 sm:self-end"
                      onClick={() => grantFileRef.current?.click()}
                      disabled={uploadingGrant}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      {uploadingGrant ? "アップロード中…" : "画像を選ぶ"}
                    </Button>
                  </div>
                ) : null}
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

            {(cooperators || cooperatorLogos.length > 0) && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  協賛
                </h3>
                {cooperators && (
                  <div className="mb-2 whitespace-pre-wrap text-sm text-foreground">{cooperators}</div>
                )}
                {cooperatorLogos.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {cooperatorLogos.map((logo) => (
                      <RelationLogoCard key={logo.logoUrl} logo={logo} canDelete={false} />
                    ))}
                  </div>
                ) : null}
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

            {(grants || grantLogos.length > 0) && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  助成
                </h3>
                {grants && <div className="mb-2 whitespace-pre-wrap text-sm text-foreground">{grants}</div>}
                {grantLogos.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {grantLogos.map((logo) => (
                      <RelationLogoCard key={logo.logoUrl} logo={logo} canDelete={false} />
                    ))}
                  </div>
                ) : null}
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

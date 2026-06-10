"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  CompetitionEditorialPanel,
  CompetitionSubheading,
} from "@/components/competitions/browse/competitionEditorialUi";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Edit, Save, X, Trash2, Plus, ImageIcon } from "lucide-react";
import { downscaleRasterLogoFileIfLarge, fetchWithConnectionRetry } from "@/lib/browserUploadHelpers";
import {
  tryDirectCompetitionRelationLogoUpload,
  tryJsonCompetitionRelationLogoUpload,
  type CompetitionRelationLogoUploadResponse,
} from "@/lib/competitionRelationLogoDirectUpload";
import {
  COMPETITION_RELATION_ROLES,
  ROLE_LABELS,
  createEmptyRelatedOrganization,
  groupRelatedOrganizationsByRole,
  relatedOrganizationToLogoView,
  relatedOrganizationsWithDisplaySrc,
  type CompetitionRelatedOrganization,
  type CompetitionRelatedOrganizationView,
  type CompetitionRelationRole,
} from "@/lib/competitionRelatedOrganizations";

function RelationLogoCard({
  logo,
  canDelete,
  onDelete,
}: {
  logo: { name: string; displaySrc: string };
  canDelete: boolean;
  onDelete?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex w-[8.75rem] flex-col gap-1">
      <div className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/25">
        {!broken ? (
          <Image
            src={logo.displaySrc}
            alt={logo.name}
            fill
            className="object-contain p-1.5"
            sizes="140px"
            loading="lazy"
            unoptimized
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
  relatedOrganizations?: unknown;
  canEdit: boolean;
  layout?: "classic" | "editorial";
}

function buildOrganizationsFingerprint(orgs: CompetitionRelatedOrganization[]): string {
  return JSON.stringify(orgs);
}

export default function CompetitionRelationsEditor({
  competitionId,
  relatedOrganizations,
  canEdit,
  layout = "classic",
}: CompetitionRelationsEditorProps) {
  const isEditorial = layout === "editorial";
  const router = useRouter();
  const normalized = useMemo(
    () => relatedOrganizationsWithDisplaySrc(relatedOrganizations ?? null),
    [relatedOrganizations],
  );
  const fingerprint = useMemo(
    () => buildOrganizationsFingerprint(normalized),
    [normalized],
  );

  const [rowsOverride, setRowsOverride] = useState<CompetitionRelatedOrganizationView[] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setRowsOverride(null);
  }, [fingerprint]);

  const rows = rowsOverride ?? normalized;

  const handleSave = async () => {
    const toSave = rows
      .map((row, index) => ({ ...row, sortOrder: index }))
      .filter((row) => row.name.trim().length > 0);

    try {
      setLoading(true);
      const response = await fetch(`/api/competitions/${competitionId}/relations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatedOrganizations: toSave }),
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
    setRowsOverride(null);
    setIsEditing(false);
  };

  const updateRow = (id: string, patch: Partial<CompetitionRelatedOrganization>) => {
    setRowsOverride((prev) =>
      (prev ?? normalized).map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (id: string) => {
    setRowsOverride((prev) => (prev ?? normalized).filter((row) => row.id !== id));
  };

  const addRow = () => {
    const next = createEmptyRelatedOrganization("sponsor", rows.length);
    setRowsOverride([...(rowsOverride ?? normalized), next]);
  };

  const persistRowsBeforeLogo = async (currentRows: CompetitionRelatedOrganizationView[]) => {
    const toSave = currentRows
      .map((row, index) => ({ ...row, sortOrder: index }))
      .filter((row) => row.name.trim().length > 0);

    const response = await fetch(`/api/competitions/${competitionId}/relations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relatedOrganizations: toSave }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "保存に失敗しました");
    }
  };

  const applyLogoUploadResponse = (
    data: CompetitionRelationLogoUploadResponse,
    organizationId: string,
    fallbackName: string,
    fallbackLogoUrl?: string,
  ) => {
    if (Array.isArray(data.relatedOrganizations)) {
      setRowsOverride(relatedOrganizationsWithDisplaySrc(data.relatedOrganizations));
      return;
    }
    const logoUrl = typeof data.logoUrl === "string" ? data.logoUrl : fallbackLogoUrl;
    const name =
      typeof data.name === "string" && data.name.trim() ? data.name.trim() : fallbackName;
    if (!logoUrl) return;
    setRowsOverride((prev) =>
      (prev ?? normalized).map((row) =>
        row.id === organizationId
          ? {
              ...row,
              name,
              logoUrl,
              displaySrc: logoUrl,
            }
          : row,
      ),
    );
  };

  const handleLogoUpload = async (row: CompetitionRelatedOrganizationView, file: File) => {
    const displayName = row.name.trim() || file.name.replace(/\.[^/.]+$/u, "");

    if (file.size > 12 * 1024 * 1024) {
      toast.error("ファイルサイズは12MB以下にしてください");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選択してください");
      return;
    }
    if (!displayName) {
      toast.error("名前を入力してから画像をアップロードしてください");
      return;
    }

    try {
      setUploadingId(row.id);

      if (!row.name.trim()) {
        updateRow(row.id, { name: displayName });
      }

      await persistRowsBeforeLogo(
        (rowsOverride ?? normalized).map((r) =>
          r.id === row.id ? { ...r, name: displayName } : r,
        ),
      );

      const snapshot = new File([await file.arrayBuffer()], file.name, {
        type: file.type || "application/octet-stream",
        lastModified: file.lastModified,
      });
      const uploadFile = await downscaleRasterLogoFileIfLarge(snapshot);

      const direct = await tryDirectCompetitionRelationLogoUpload(
        competitionId,
        row.id,
        row.role,
        uploadFile,
        displayName,
      );
      if (direct.kind === "reject") {
        throw new Error(direct.message);
      }

      let data: CompetitionRelationLogoUploadResponse | null = null;
      if (direct.kind === "success") {
        data = direct.data;
      } else {
        const jsonTry = await tryJsonCompetitionRelationLogoUpload(
          competitionId,
          row.id,
          row.role,
          uploadFile,
          displayName,
        );
        if (jsonTry.kind === "reject") {
          throw new Error(jsonTry.message);
        }
        if (jsonTry.kind === "success") {
          data = jsonTry.data;
        } else {
          const formData = new FormData();
          formData.append("file", uploadFile);
          formData.append("organizationId", row.id);
          formData.append("role", row.role);
          formData.append("name", displayName);

          const response = await fetchWithConnectionRetry(
            `/api/competitions/${competitionId}/relations/logo`,
            { method: "POST", body: formData },
            { attempts: 4, baseDelayMs: 600 },
          );

          if (!response.ok) {
            const e = await response.json().catch(() => ({}));
            throw new Error(typeof e.error === "string" ? e.error : "アップロードに失敗しました");
          }
          data = (await response.json()) as CompetitionRelationLogoUploadResponse;
        }
      }

      if (!data) {
        throw new Error("アップロードに失敗しました");
      }

      applyLogoUploadResponse(data, row.id, displayName, data.logoUrl);
      toast.success("ロゴをアップロードしました");
      router.refresh();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "アップロードに失敗しました");
    } finally {
      setUploadingId(null);
    }
  };

  const handleLogoDelete = async (row: CompetitionRelatedOrganizationView) => {
    if (!row.logoUrl) return;
    if (!confirm("ロゴを削除しますか？")) return;

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/relations/logo?organizationId=${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "削除に失敗しました");
      }

      const data = (await response.json()) as { relatedOrganizations?: unknown };
      if (Array.isArray(data.relatedOrganizations)) {
        setRowsOverride(relatedOrganizationsWithDisplaySrc(data.relatedOrganizations));
      } else {
        setRowsOverride((prev) =>
          (prev ?? normalized).map((r) =>
            r.id === row.id ? { ...r, logoUrl: null, displaySrc: null } : r,
          ),
        );
      }

      toast.success("ロゴを削除しました");
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
    }
  };

  const hasAnyData = rows.some((row) => row.name.trim().length > 0 || row.logoUrl);

  if (!isEditing && !hasAnyData && !canEdit) {
    return null;
  }

  const grouped = groupRelatedOrganizationsByRole(rows.filter((r) => r.name.trim().length > 0 || r.logoUrl));

  const headerActions =
    canEdit && !isEditing ? (
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIsEditing(true)}>
        <Edit className="mr-1.5 h-3.5 w-3.5" />
        編集
      </Button>
    ) : null;

  const body = (
    <div className="px-0 py-0">
        {isEditing ? (
          <div className="space-y-3">
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">まだ関係組織が登録されていません。</p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => {
                  const logoView = relatedOrganizationToLogoView(row);
                  return (
                    <div
                      key={row.id}
                      className="grid gap-2 rounded-lg border border-border/80 bg-muted/10 p-3 sm:grid-cols-[7rem_1fr_auto_auto] sm:items-end"
                    >
                      <div className="space-y-1">
                        <Label className="text-xs">属性</Label>
                        <Select
                          value={row.role}
                          onValueChange={(value) =>
                            updateRow(row.id, { role: value as CompetitionRelationRole })
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMPETITION_RELATION_ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">名前</Label>
                        <Input
                          value={row.name}
                          onChange={(e) => updateRow(row.id, { name: e.target.value })}
                          placeholder="例: ○○株式会社"
                          className="text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">画像（任意）</Label>
                        <div className="flex items-center gap-2">
                          {logoView ? (
                            <div className="relative h-12 w-12 overflow-hidden rounded border border-border bg-muted/25">
                              <Image
                                src={logoView.displaySrc}
                                alt={logoView.name}
                                fill
                                className="object-contain p-1"
                                sizes="48px"
                                unoptimized
                              />
                            </div>
                          ) : null}
                          <input
                            ref={(el) => {
                              fileRefs.current[row.id] = el;
                            }}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/bmp,image/svg+xml,image/tiff,image/heic,image/heif,.heic,.heif"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                void handleLogoUpload(row, file);
                                e.target.value = "";
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-9 shrink-0 gap-1"
                            onClick={() => fileRefs.current[row.id]?.click()}
                            disabled={uploadingId === row.id}
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                            {uploadingId === row.id ? "アップロード中…" : logoView ? "変更" : "画像を選ぶ"}
                          </Button>
                          {logoView ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 text-destructive"
                              onClick={() => void handleLogoDelete(row)}
                              aria-label="ロゴを削除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 self-end text-destructive sm:self-end"
                        onClick={() => removeRow(row.id)}
                        aria-label="行を削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addRow}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              行を追加
            </Button>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" className="h-8 text-xs" onClick={() => void handleSave()} disabled={loading}>
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
            {COMPETITION_RELATION_ROLES.map((role) => {
              const roleRows = grouped[role];
              if (roleRows.length === 0) return null;

              const textOnly = roleRows.filter((r) => !r.logoUrl && r.name.trim());
              const withLogo = roleRows.filter((r) => r.logoUrl);

              return (
                <div key={role}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {ROLE_LABELS[role]}
                  </h3>
                  {textOnly.length > 0 ? (
                    <div className="whitespace-pre-wrap text-sm text-foreground">
                      {textOnly.map((r) => r.name).join("\n")}
                    </div>
                  ) : null}
                  {withLogo.length > 0 ? (
                    <div className={`flex flex-wrap gap-3 ${textOnly.length > 0 ? "mt-2" : ""}`}>
                      {withLogo.map((row) => {
                        const logo = relatedOrganizationToLogoView(row);
                        if (!logo) return null;
                        return (
                          <RelationLogoCard
                            key={row.id}
                            logo={{ name: logo.name, displaySrc: logo.displaySrc }}
                            canDelete={false}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!hasAnyData && canEdit && (
              <p className="py-3 text-center text-xs text-muted-foreground">関係組織情報が未登録です</p>
            )}
          </div>
        )}
    </div>
  );

  if (isEditorial) {
    return (
      <CompetitionEditorialPanel accent="muted">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CompetitionSubheading>Partners</CompetitionSubheading>
            <h3 className="mt-1 text-base font-semibold text-foreground">関係組織</h3>
          </div>
          {headerActions}
        </div>
        <div className="mt-4">{body}</div>
      </CompetitionEditorialPanel>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-0.5 border-b border-border bg-muted/15 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">関係組織</CardTitle>
            <CardDescription className="text-xs">後援・協賛・協力・助成（公開ページに表示）</CardDescription>
          </div>
          {headerActions}
        </div>
      </CardHeader>
      <CardContent className="px-4 py-3">{body}</CardContent>
    </Card>
  );
}

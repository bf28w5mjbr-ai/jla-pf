"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronDown, Trash2, Plus, X, Save } from "lucide-react";
import { isClubAdminRole } from "@/lib/roleScopes";
import {
  ClubEditorialEmptyState,
  ClubEditorialFormPanel,
  ClubEditorialLoadingState,
  OrgEditorialPanel,
  OrgSubheading,
  clubSelectClassName,
} from "@/components/clubEditorialUi";

type ActivityAuthor = {
  id: string;
  familyName: string;
  givenName: string;
};

type ActivityRecord = {
  id: string;
  clubId: string;
  authorId: string;
  activityType: string;
  title: string;
  description: string | null;
  activityDate: string;
  location: string | null;
  participants: number | null;
  achievements: string | null;
  createdAt: string;
  author: ActivityAuthor;
};

type ClubActivitiesProps = {
  clubId: string;
  currentUserId: string;
  currentUserRole: "ADMIN" | "MEMBER" | string;
};

const activityTypes = [
  { value: "競技", label: "競技大会" },
  { value: "練習", label: "練習・トレーニング" },
  { value: "監視", label: "海岸監視活動" },
  { value: "講習", label: "講習・研修" },
  { value: "イベント", label: "イベント" },
  { value: "その他", label: "その他" },
];

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function activityMetaLine(record: ActivityRecord): string {
  return [
    formatShortDate(record.activityDate),
    record.location?.trim() || null,
    record.participants ? `${record.participants}名` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function ClubActivities({
  clubId,
  currentUserId,
  currentUserRole,
}: ClubActivitiesProps) {
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [activityType, setActivityType] = useState("競技");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState("");
  const [achievements, setAchievements] = useState("");

  const canCreateRecord = isClubAdminRole(currentUserRole);

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/clubs/${clubId}/activities`);
      if (!res.ok) throw new Error("Failed to load activity records");
      const data = await res.json();
      setRecords(data);
    } catch (error) {
      console.error("Load activity records error:", error);
      toast.error("活動記録の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const resetForm = () => {
    setActivityType("競技");
    setTitle("");
    setDescription("");
    setActivityDate("");
    setLocation("");
    setParticipants("");
    setAchievements("");
  };

  const handleCreate = async () => {
    if (!activityType || !title.trim() || !activityDate) {
      toast.error("活動種別、タイトル、活動日は必須です");
      return;
    }

    try {
      setCreating(true);
      const res = await fetch(`/api/clubs/${clubId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType,
          title,
          description,
          activityDate,
          location,
          participants,
          achievements,
        }),
      });

      if (!res.ok) throw new Error("Failed to create activity record");

      toast.success("活動記録を登録しました");
      resetForm();
      setShowCreateForm(false);
      loadRecords();
    } catch (error) {
      console.error("Create activity record error:", error);
      toast.error("活動記録の登録に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (activityId: string) => {
    if (!confirm("この活動記録を削除しますか？")) return;

    try {
      const res = await fetch(`/api/clubs/${clubId}/activities/${activityId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete activity record");

      toast.success("活動記録を削除しました");
      loadRecords();
    } catch (error) {
      console.error("Delete activity record error:", error);
      toast.error("活動記録の削除に失敗しました");
    }
  };

  if (loading) {
    return <ClubEditorialLoadingState label="活動記録を読み込み中" />;
  }

  return (
    <OrgEditorialPanel accent="emerald" className="!px-4 !py-3 sm:!px-5 sm:!py-4">
      <div className="flex items-center justify-between gap-2">
        <OrgSubheading>Activities</OrgSubheading>
        {canCreateRecord ? (
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            variant={showCreateForm ? "outline" : "default"}
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
          >
            {showCreateForm ? (
              <>
                <X className="size-3.5" aria-hidden />
                閉じる
              </>
            ) : (
              <>
                <Plus className="size-3.5" aria-hidden />
                追加
              </>
            )}
          </Button>
        ) : null}
      </div>

      {showCreateForm ? (
        <ClubEditorialFormPanel className="mt-2 !px-3 !py-3">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="activityType" className="text-xs">
                  種別 *
                </Label>
                <select
                  id="activityType"
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className={`${clubSelectClassName} h-8 text-sm`}
                >
                  {activityTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="activityDate" className="text-xs">
                  活動日 *
                </Label>
                <Input
                  id="activityDate"
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="title" className="text-xs">
                タイトル *
              </Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="location" className="text-xs">
                  場所
                </Label>
                <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="participants" className="text-xs">
                  人数
                </Label>
                <Input
                  id="participants"
                  numericInput="integer"
                  min="1"
                  value={participants}
                  onChange={(e) => setParticipants(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs">
                詳細
              </Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="achievements" className="text-xs">
                成果
              </Label>
              <Textarea id="achievements" value={achievements} onChange={(e) => setAchievements(e.target.value)} rows={2} className="text-sm" />
            </div>
            <Button onClick={handleCreate} disabled={creating} size="sm" className="h-7 gap-1 px-2 text-xs">
              <Save className="size-3.5" aria-hidden />
              {creating ? "登録中..." : "登録"}
            </Button>
          </div>
        </ClubEditorialFormPanel>
      ) : null}

      <div className="mt-2">
        {records.length === 0 ? (
          <ClubEditorialEmptyState message="活動記録はまだありません" />
        ) : (
          <ul className="divide-y divide-border/45 overflow-hidden rounded-lg border border-border/55 bg-card/50">
            {records.map((record) => {
              const isAuthor = record.authorId === currentUserId;
              const canDelete = isAuthor || isClubAdminRole(currentUserRole);
              const hasDetails = record.description || record.achievements;

              return (
                <li key={record.id}>
                  {hasDetails ? (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-start gap-1.5 px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden hover:bg-muted/20">
                        {renderActivitySummary(record, canDelete, () => void handleDelete(record.id), true)}
                      </summary>
                      <div className="space-y-1.5 border-t border-border/40 px-3 pb-2.5 pt-2 text-xs leading-relaxed">
                        {record.description ? (
                          <p className="whitespace-pre-wrap text-foreground/90">{record.description}</p>
                        ) : null}
                        {record.achievements ? (
                          <p className="whitespace-pre-wrap text-muted-foreground">
                            <span className="font-medium text-foreground/80">成果: </span>
                            {record.achievements}
                          </p>
                        ) : null}
                        <p className="text-[10px] text-muted-foreground">
                          {record.author.familyName} {record.author.givenName}
                        </p>
                      </div>
                    </details>
                  ) : (
                    <div className="flex items-start gap-1.5 px-3 py-2 hover:bg-muted/20">
                      {renderActivitySummary(record, canDelete, () => void handleDelete(record.id), false)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OrgEditorialPanel>
  );
}

function renderActivitySummary(
  record: ActivityRecord,
  canDelete: boolean,
  onDelete: () => void,
  showChevron: boolean
) {
  const meta = activityMetaLine(record);
  return (
    <>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] font-normal">
            {record.activityType}
          </Badge>
          <span className="truncate text-sm font-medium text-foreground">{record.title}</span>
          {showChevron ? (
            <ChevronDown
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden
            />
          ) : null}
        </div>
        {meta ? <p className="truncate text-[10px] text-muted-foreground">{meta}</p> : null}
      </div>
      {canDelete ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.preventDefault();
            onDelete();
          }}
          aria-label="削除"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      ) : null}
    </>
  );
}

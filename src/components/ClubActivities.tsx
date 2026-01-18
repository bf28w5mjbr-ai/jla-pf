"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Calendar, MapPin, Users, Trophy } from "lucide-react";

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
  currentUserRole: "OWNER" | "ADMIN" | "MEMBER";
};

const activityTypes = [
  { value: "競技", label: "競技大会" },
  { value: "練習", label: "練習・トレーニング" },
  { value: "監視", label: "海岸監視活動" },
  { value: "講習", label: "講習・研修" },
  { value: "イベント", label: "イベント" },
  { value: "その他", label: "その他" },
];

export default function ClubActivities({
  clubId,
  currentUserId,
  currentUserRole,
}: ClubActivitiesProps) {
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // フォームステート
  const [activityType, setActivityType] = useState("競技");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState("");
  const [achievements, setAchievements] = useState("");

  const canCreateRecord = currentUserRole === "OWNER" || currentUserRole === "ADMIN";

  useEffect(() => {
    loadRecords();
  }, [clubId]);

  const loadRecords = async () => {
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
  };

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
    return <div>読み込み中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">活動記録</h2>
        {canCreateRecord && (
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? "キャンセル" : "活動記録を追加"}
          </Button>
        )}
      </div>

      {showCreateForm && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="activityType">活動種別 *</Label>
                <select
                  id="activityType"
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  {activityTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="activityDate">活動日 *</Label>
                <Input
                  id="activityDate"
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="title">タイトル *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="活動のタイトル"
              />
            </div>

            <div>
              <Label htmlFor="location">場所</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="活動場所"
              />
            </div>

            <div>
              <Label htmlFor="participants">参加人数</Label>
              <Input
                id="participants"
                type="number"
                min="1"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                placeholder="参加人数"
              />
            </div>

            <div>
              <Label htmlFor="description">詳細</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="活動の詳細"
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="achievements">成果・実績</Label>
              <Textarea
                id="achievements"
                value={achievements}
                onChange={(e) => setAchievements(e.target.value)}
                placeholder="大会結果、救助実績など"
                rows={3}
              />
            </div>

            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "登録中..." : "登録"}
            </Button>
          </div>
        </Card>
      )}

      {records.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          活動記録はまだありません
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((record) => {
            const isAuthor = record.authorId === currentUserId;
            const canDelete =
              isAuthor || currentUserRole === "OWNER" || currentUserRole === "ADMIN";

            return (
              <Card key={record.id}>
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          {record.activityType}
                        </span>
                        <h3 className="text-lg font-semibold">{record.title}</h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(record.activityDate).toLocaleDateString("ja-JP")}
                        </div>
                        {record.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {record.location}
                          </div>
                        )}
                        {record.participants && (
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {record.participants}名参加
                          </div>
                        )}
                      </div>
                    </div>

                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(record.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>

                  {record.description && (
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-3">
                      {record.description}
                    </p>
                  )}

                  {record.achievements && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-3">
                      <div className="flex items-start gap-2">
                        <Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                        <div className="flex-1">
                          <div className="text-xs font-medium text-yellow-800 dark:text-yellow-300 mb-1">
                            成果・実績
                          </div>
                          <p className="text-sm text-yellow-700 dark:text-yellow-400 whitespace-pre-wrap">
                            {record.achievements}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    記録者: {record.author.familyName} {record.author.givenName} •{" "}
                    登録日:{" "}
                    {new Date(record.createdAt).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

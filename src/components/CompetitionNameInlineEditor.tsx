"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Props = {
  competitionId: string;
  canEdit: boolean;
  initialData: {
    name: string;
    category: string | null;
    startDate: string;
    endDate: string;
    venue: string;
  };
};

export default function CompetitionNameInlineEditor({ competitionId, canEdit, initialData }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialData.name);
  const [lastSavedName, setLastSavedName] = useState(initialData.name.trim());
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [statusTone, setStatusTone] = useState<"muted" | "success" | "error">("muted");

  useEffect(() => {
    setName(initialData.name);
    setLastSavedName(initialData.name.trim());
    setStatusText("");
    setStatusTone("muted");
  }, [initialData.name]);

  useEffect(() => {
    if (statusTone !== "success") return;
    const timer = window.setTimeout(() => {
      setStatusText("");
      setStatusTone("muted");
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [statusTone]);

  const saveIfChanged = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("大会名を入力してください");
      setName(initialData.name);
      setStatusText("大会名を入力してください");
      setStatusTone("error");
      return;
    }
    if (saving) return;
    if (trimmed === lastSavedName) return;
    try {
      setSaving(true);
      setStatusText("保存中…");
      setStatusTone("muted");
      const res = await fetch(`/api/competitions/${competitionId}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          category: initialData.category,
          startDate: initialData.startDate,
          endDate: initialData.endDate,
          venue: initialData.venue,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "大会名の更新に失敗しました");
      }
      setLastSavedName(trimmed);
      setStatusText("保存しました");
      setStatusTone("success");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "大会名の更新に失敗しました");
      setName(initialData.name);
      setStatusText("保存に失敗しました");
      setStatusTone("error");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {initialData.name}
      </h1>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void saveIfChanged()}
        disabled={saving}
        className="h-11 max-w-3xl text-xl font-semibold tracking-tight sm:text-2xl"
        aria-label="大会名"
      />
      <p
        className={`text-[11px] ${
          statusTone === "success"
            ? "text-emerald-700 dark:text-emerald-300"
            : statusTone === "error"
              ? "text-destructive"
              : "text-muted-foreground"
        }`}
      >
        {statusText || "フォーカスを外すと自動で更新します。"}
      </p>
    </div>
  );
}


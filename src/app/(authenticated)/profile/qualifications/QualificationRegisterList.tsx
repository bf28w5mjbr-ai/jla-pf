"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface RegisterableQualification {
  id: string;
  kind: string;
  name: string | null;
  description: string | null;
  requiresExpiry: boolean;
  validityMonths: number | null;
}

interface QualificationRegisterListProps {
  items: RegisterableQualification[];
}

export default function QualificationRegisterList({ items }: QualificationRegisterListProps) {
  const router = useRouter();
  const [registeringId, setRegisteringId] = useState<string | null>(null);

  const handleRegister = async (item: RegisterableQualification) => {
    if (registeringId) return;

    setRegisteringId(item.id);
    try {
      const res = await fetch("/api/qualifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "資格登録に失敗しました");
      }

      toast.success("資格登録を申請しました");
      router.refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "資格登録に失敗しました";
      toast.error(msg);
    } finally {
      setRegisteringId(null);
    }
  };

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
        >
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {item.name ?? item.kind}
            </p>
            {item.description && (
              <p className="mt-1 text-xs text-gray-500">{item.description}</p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              {item.requiresExpiry && item.validityMonths
                ? `有効期間: ${item.validityMonths}か月`
                : "有効期限なし"}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => handleRegister(item)}
            disabled={registeringId === item.id}
          >
            {registeringId === item.id ? "登録中..." : "登録"}
          </Button>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  isValidJlaMemberNumber,
  normalizeJlaMemberNumber,
} from "@/lib/jlaMemberNumber";

interface RegisterableQualification {
  id: string;
  kind: string;
  name: string | null;
  description: string | null;
  requiresExpiry: boolean;
  validityMonths: number | null;
}

interface QualificationRegisterButtonProps {
  item: RegisterableQualification;
  /** 保有資格ページなどで登録済みの JLA メンバーIDをダイアログに初期表示 */
  defaultJlaMemberNumber?: string | null;
}

export default function QualificationRegisterButton({
  item,
  defaultJlaMemberNumber,
}: QualificationRegisterButtonProps) {
  const router = useRouter();
  const [isRegistering, setIsRegistering] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [jlaMemberNumber, setJlaMemberNumber] = useState(
    () => normalizeJlaMemberNumber(defaultJlaMemberNumber ?? "")
  );

  useEffect(() => {
    setJlaMemberNumber(normalizeJlaMemberNumber(defaultJlaMemberNumber ?? ""));
  }, [defaultJlaMemberNumber]);

  const submitRegistration = async () => {
    if (isRegistering) return;

    const certNumber = normalizeJlaMemberNumber(jlaMemberNumber);

    if (!isValidJlaMemberNumber(certNumber)) {
      toast.error(
        "JLAメンバーIDは500から始まる半角9桁の数字で入力してください"
      );
      return;
    }

    setIsRegistering(true);
    try {
      const res = await fetch("/api/qualifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: item.kind,
          certNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "資格登録に失敗しました");
      }

      toast.success("資格登録を申請しました");
      setDialogOpen(false);
      setJlaMemberNumber(normalizeJlaMemberNumber(defaultJlaMemberNumber ?? ""));
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "資格登録に失敗しました"
      );
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open && !isRegistering) {
          setJlaMemberNumber(normalizeJlaMemberNumber(defaultJlaMemberNumber ?? ""));
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={isRegistering}>
          登録申請
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>資格の登録申請</DialogTitle>
          <DialogDescription>
            「{item.name ?? item.kind}」の申請にあたり、日本ライフセービング協会が発行した
            JLAメンバーIDを入力してください。審査時に照合されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="jlaMemberNumber">JLAメンバーID</Label>
          <Input
            id="jlaMemberNumber"
            value={jlaMemberNumber}
            onChange={(event) =>
              setJlaMemberNumber(normalizeJlaMemberNumber(event.target.value))
            }
            numericInput="integer"
            maxLength={9}
            placeholder="500123456"
            inputMode="numeric"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            500から始まる半角9桁の数字で入力してください。
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
            キャンセル
          </Button>
          <Button type="button" onClick={submitRegistration} disabled={isRegistering}>
            {isRegistering ? "申請中..." : "申請する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

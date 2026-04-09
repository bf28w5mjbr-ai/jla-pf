"use client";

import { useState } from "react";
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
  isPlayerRegistrationKind,
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
}

export default function QualificationRegisterButton({
  item,
}: QualificationRegisterButtonProps) {
  const router = useRouter();
  const [isRegistering, setIsRegistering] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [jlaMemberNumber, setJlaMemberNumber] = useState("");

  const requiresJlaMemberNumber =
    isPlayerRegistrationKind(item.kind) || isPlayerRegistrationKind(item.name);

  const submitRegistration = async () => {
    if (isRegistering) return;

    const certNumber = normalizeJlaMemberNumber(jlaMemberNumber);

    if (requiresJlaMemberNumber && !isValidJlaMemberNumber(certNumber)) {
      toast.error("JLA番号は5000から始まる9桁で入力してください");
      return;
    }

    setIsRegistering(true);
    try {
      const res = await fetch("/api/qualifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: item.kind,
          certNumber: requiresJlaMemberNumber ? certNumber : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "資格登録に失敗しました");
      }

      toast.success("資格登録を申請しました");
      setDialogOpen(false);
      setJlaMemberNumber("");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "資格登録に失敗しました"
      );
    } finally {
      setIsRegistering(false);
    }
  };

  if (!requiresJlaMemberNumber) {
    return (
      <Button size="sm" onClick={submitRegistration} disabled={isRegistering}>
        {isRegistering ? "登録中..." : "登録申請"}
      </Button>
    );
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open && !isRegistering) {
          setJlaMemberNumber("");
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
          <DialogTitle>選手登録を申請</DialogTitle>
          <DialogDescription>
            選手登録の申請時に JLA番号を入力してください。番号は協会の審査時に確認されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="jlaMemberNumber">JLA番号</Label>
          <Input
            id="jlaMemberNumber"
            value={jlaMemberNumber}
            onChange={(event) =>
              setJlaMemberNumber(normalizeJlaMemberNumber(event.target.value))
            }
            numericInput="integer"
            maxLength={9}
            placeholder="500012345"
          />
          <p className="text-xs text-muted-foreground">
            5000から始まる9桁で入力してください。
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

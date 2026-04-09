"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  initialNfcTagId: string | null;
};

export default function NfcTagManager({ initialNfcTagId }: Props) {
  const [nfcTagId, setNfcTagId] = useState(initialNfcTagId ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const supportsWebNfc =
    typeof window !== "undefined" &&
    "NDEFReader" in window;

  const handleScan = async () => {
    try {
      const NDEFReaderCtor = (window as Window & { NDEFReader?: new () => { scan: () => Promise<void>; addEventListener: (type: string, listener: (event: { serialNumber?: string }) => void) => void } }).NDEFReader;
      if (!NDEFReaderCtor) {
        throw new Error("このブラウザはNFC読取に対応していません");
      }
      setIsScanning(true);
      const reader = new NDEFReaderCtor();
      await reader.scan();
      toast.info("NFCタグを端末にかざしてください");
      reader.addEventListener("reading", (event) => {
        const serial = (event.serialNumber || "").trim();
        if (!serial) {
          toast.error("タグIDを読み取れませんでした");
          return;
        }
        setNfcTagId(serial);
        toast.success(`NFCタグを読み取りました: ${serial}`);
        setIsScanning(false);
      });
    } catch (error) {
      setIsScanning(false);
      toast.error(error instanceof Error ? error.message : "NFC読取に失敗しました");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/nfc-tag", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nfcTagId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "NFCタグの保存に失敗しました");
      }
      setNfcTagId(data.nfcTagId ?? nfcTagId);
      toast.success("NFCタグを紐付けました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const res = await fetch("/api/user/nfc-tag", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "NFCタグの解除に失敗しました");
      }
      setNfcTagId("");
      toast.success("NFCタグの紐付けを解除しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "解除に失敗しました");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Input
        value={nfcTagId}
        onChange={(e) => setNfcTagId(e.target.value)}
        placeholder="NFCタグIDを入力"
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={isSaving || nfcTagId.trim().length === 0}>
          {isSaving ? "保存中..." : "NFCタグを保存"}
        </Button>
        <Button variant="outline" onClick={handleScan} disabled={isScanning || !supportsWebNfc}>
          {isScanning ? "読取待機中..." : "端末でNFC読取"}
        </Button>
        <Button variant="outline" onClick={handleRemove} disabled={isRemoving || nfcTagId.trim().length === 0}>
          {isRemoving ? "解除中..." : "紐付け解除"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        NFC非対応端末（iOS/Safariなど）では、タグに印字された番号を直接入力して保存できます。重複IDは登録できません。
      </p>
    </div>
  );
}

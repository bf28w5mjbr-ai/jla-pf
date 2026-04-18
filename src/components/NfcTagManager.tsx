"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isNfcScanSupportedSync, scanFirstNfcTag } from "@/lib/nfc/nfcScanSession";

type Props = {
  initialNfcTagId: string | null;
};

export default function NfcTagManager({ initialNfcTagId }: Props) {
  const [nfcTagId, setNfcTagId] = useState(initialNfcTagId ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scanAbortRef = useRef<AbortController | null>(null);

  const supportsNfcScan = isNfcScanSupportedSync();

  const handleScan = async () => {
    scanAbortRef.current?.abort();
    const ac = new AbortController();
    scanAbortRef.current = ac;
    setIsScanning(true);
    try {
      toast.info("NFCタグを端末にかざしてください");
      const canonical = await scanFirstNfcTag({
        signal: ac.signal,
        alertMessage: "NFCタグを端末にかざしてください",
        iosSessionType: "tag",
      });
      setNfcTagId(canonical);
      toast.success(`NFCタグを読み取りました: ${canonical}`);
    } catch (error) {
      if (error instanceof Error && error.message === "NFC読取を中止しました") {
        return;
      }
      toast.error(error instanceof Error ? error.message : "NFC読取に失敗しました");
    } finally {
      setIsScanning(false);
      scanAbortRef.current = null;
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
        <Button variant="outline" onClick={handleScan} disabled={isScanning || !supportsNfcScan}>
          {isScanning ? "読取待機中..." : "端末でNFC読取"}
        </Button>
        <Button variant="outline" onClick={handleRemove} disabled={isRemoving || nfcTagId.trim().length === 0}>
          {isRemoving ? "解除中..." : "紐付け解除"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        ブラウザが NFC 非対応の場合は、タグに印字された番号を直接入力して保存できます。Bluvium のモバイルアプリ（iOS/Android）では端末の NFC で読み取れます。重複 ID
        は登録できません。
      </p>
    </div>
  );
}

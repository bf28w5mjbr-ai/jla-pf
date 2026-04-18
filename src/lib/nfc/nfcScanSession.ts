"use client";

import { Capacitor } from "@capacitor/core";
import { normalizeNfcTagId } from "@/lib/nfc/normalizeNfcTagId";
import { nfcTagIdFromByteArray } from "@/lib/nfc/nfcTagIdFromBytes";
import { isWebNfcSupported, startMarshalNfcScanSession } from "@/lib/marshalWebNfc";

export type NfcScanSessionOptions = {
  signal: AbortSignal;
  /** iOS のシート文言 */
  alertMessage?: string;
  /**
   * iOS: UID を確実に読む場合は `tag`（TAG Reader Session）。NDEF のみなら `ndef`。
   * マルチ読取・未フォーマットタグでは `tag` を推奨。
   */
  iosSessionType?: "ndef" | "tag";
  /** 初回読取後にセッションを閉じる。紐付け画面は true、マーシャル等の連続読取は false */
  invalidateAfterFirstRead?: boolean;
};

function loadCapacitorNfc() {
  return import("@capgo/capacitor-nfc").then((m) => m.CapacitorNfc);
}

/** スキャン UI を出してよいか（Web NFC または Capacitor ネイティブ） */
export function isNfcScanSupportedSync(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  return isWebNfcSupported();
}

export async function isNfcScanSupported(): Promise<boolean> {
  if (!isNfcScanSupportedSync()) return false;
  if (!Capacitor.isNativePlatform()) return isWebNfcSupported();
  try {
    const CapacitorNfc = await loadCapacitorNfc();
    const { supported } = await CapacitorNfc.isSupported();
    return supported;
  } catch {
    return false;
  }
}

/**
 * タグを読み取るたび `onTagId` に正規化済み ID を渡す。`signal` で中止。
 */
export async function startNfcScanSession(
  options: NfcScanSessionOptions,
  onTagId: (canonicalTagId: string) => void
): Promise<void> {
  const { signal, alertMessage, iosSessionType = "tag", invalidateAfterFirstRead = false } = options;

  if (Capacitor.isNativePlatform()) {
    const CapacitorNfc = await loadCapacitorNfc();
    const { supported } = await CapacitorNfc.isSupported();
    if (!supported) {
      throw new Error("この端末はNFCに対応していません");
    }

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const cleanup = async () => {
      if (listenerHandle) {
        await listenerHandle.remove();
        listenerHandle = null;
      }
      try {
        await CapacitorNfc.stopScanning();
      } catch {
        /* noop */
      }
    };

    listenerHandle = await CapacitorNfc.addListener("nfcEvent", (event) => {
      const id = event.tag?.id;
      if (id && id.length > 0) {
        onTagId(nfcTagIdFromByteArray(id));
        return;
      }
      const typeStr = event.tag?.type;
      if (typeof typeStr === "string" && typeStr.length > 0) {
        onTagId(normalizeNfcTagId(typeStr));
      }
    });

    try {
      await CapacitorNfc.startScanning({
        invalidateAfterFirstRead,
        alertMessage: alertMessage ?? "NFCタグを端末にかざしてください",
        iosSessionType,
      });
    } catch (e) {
      await cleanup();
      throw e instanceof Error ? e : new Error("NFC読取を開始できませんでした");
    }

    // Web NFC の `scan()` と同様、セッション開始後すぐに戻り、読取はコールバック継続。停止は `signal` で。
    const onAbort = () => void cleanup();
    if (signal.aborted) {
      void cleanup();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    return;
  }

  if (!isWebNfcSupported()) {
    throw new Error("このブラウザはNFC読取に対応していません");
  }

  await startMarshalNfcScanSession(signal, (serial) => {
    onTagId(normalizeNfcTagId(serial));
  });
}

/**
 * 最初の1回のタグ読取で resolve（紐付け画面向け）。
 * `signal`（親の AbortController）で再スキャン・離脱時に読取を中止できる。
 */
export async function scanFirstNfcTag(
  options: Omit<NfcScanSessionOptions, "signal" | "invalidateAfterFirstRead"> & { signal?: AbortSignal }
): Promise<string> {
  const { signal: parent, ...rest } = options;
  const sessionAc = new AbortController();

  if (parent) {
    if (parent.aborted) {
      return Promise.reject(new Error("NFC読取を中止しました"));
    }
    parent.addEventListener("abort", () => sessionAc.abort(), { once: true });
  }

  return new Promise((resolve, reject) => {
    let got = false;
    void startNfcScanSession(
      {
        ...rest,
        signal: sessionAc.signal,
        invalidateAfterFirstRead: true,
        iosSessionType: rest.iosSessionType ?? "tag",
      },
      (id) => {
        if (got) return;
        got = true;
        resolve(id);
        sessionAc.abort();
      }
    ).catch(reject);

    sessionAc.signal.addEventListener(
      "abort",
      () => {
        if (!got) reject(new Error("NFC読取を中止しました"));
      },
      { once: true }
    );
  });
}

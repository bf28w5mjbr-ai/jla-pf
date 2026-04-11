/**
 * マーシャル用 Web NFC（Chrome Android 等）。AbortSignal で scan を停止。
 */

type NdefReadingEvent = Event & { serialNumber?: string };

type NDEFReaderInstance = {
  scan: (opts?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener: (type: "reading", listener: (ev: NdefReadingEvent) => void) => void;
};

type NDEFReaderCtor = new () => NDEFReaderInstance;

function getNDEFReaderCtor(): NDEFReaderCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as Window & { NDEFReader?: NDEFReaderCtor };
  return w.NDEFReader ?? null;
}

export function isWebNfcSupported(): boolean {
  return getNDEFReaderCtor() !== null;
}

/**
 * reading イベントでシリアルを渡す。scan が成功すると待機継続（signal で中止まで）。
 */
export function startMarshalNfcScanSession(
  signal: AbortSignal,
  onReading: (serial: string) => void
): Promise<void> {
  const Ctor = getNDEFReaderCtor();
  if (!Ctor) {
    return Promise.reject(new Error("このブラウザはNFC読取に対応していません"));
  }
  const reader = new Ctor();
  reader.addEventListener("reading", (event) => {
    const serial = (event.serialNumber || "").trim();
    if (serial) onReading(serial);
  });
  return reader.scan({ signal });
}

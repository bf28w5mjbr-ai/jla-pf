/** 当日運用系 API の fetch 失敗（HTTP + オプションの machine-readable code） */
export class DayOpsFetchError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = "DayOpsFetchError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export const NFC_TAG_UNBOUND = "NFC_TAG_UNBOUND" as const;

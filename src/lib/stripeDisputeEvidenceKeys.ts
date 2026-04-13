/** Stripe Dispute の file 型 evidence キー（クライアント共有可能） */
export const DISPUTE_FILE_EVIDENCE_KEYS = [
  "uncategorized_file",
  "customer_communication",
  "receipt",
  "service_documentation",
] as const;

export type DisputeFileEvidenceKey = (typeof DISPUTE_FILE_EVIDENCE_KEYS)[number];

export function parseDisputeFileEvidenceKey(raw: string | null | undefined): DisputeFileEvidenceKey {
  const v = raw?.trim();
  if (v && (DISPUTE_FILE_EVIDENCE_KEYS as readonly string[]).includes(v)) {
    return v as DisputeFileEvidenceKey;
  }
  return "uncategorized_file";
}

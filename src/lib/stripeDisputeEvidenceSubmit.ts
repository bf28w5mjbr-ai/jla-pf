import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import type { DisputeFileEvidenceKey } from "@/lib/stripeDisputeEvidenceKeys";

const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

export type { DisputeFileEvidenceKey } from "@/lib/stripeDisputeEvidenceKeys";
export { parseDisputeFileEvidenceKey } from "@/lib/stripeDisputeEvidenceKeys";

export function assertDisputeEvidenceMime(mime: string): void {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!ALLOWED_MIME.has(m)) {
    throw new Error("unsupported_mime");
  }
}

export function assertDisputeEvidenceSize(byteLength: number): void {
  if (!Number.isFinite(byteLength) || byteLength <= 0) throw new Error("empty_file");
  if (byteLength > MAX_BYTES) throw new Error("file_too_large");
}

/**
 * dispute_evidence として Stripe にファイルを上げ、指定 evidence キーに紐づける。
 * @param submit true のとき銀行へ提出（Stripe の submit フラグ）。初回は false でステージング推奨。
 */
export async function attachDisputeEvidenceFile(params: {
  disputeId: string;
  fileBuffer: Buffer;
  mimeType: string;
  filename: string;
  evidenceKey: DisputeFileEvidenceKey;
  submit: boolean;
}): Promise<{ stripeFileId: string; disputeStatus: string }> {
  assertDisputeEvidenceMime(params.mimeType);
  assertDisputeEvidenceSize(params.fileBuffer.length);

  const uploaded = await stripe.files.create({
    purpose: "dispute_evidence",
    file: {
      data: params.fileBuffer,
      name: params.filename.slice(0, 200) || "evidence.bin",
      type: params.mimeType,
    },
  });

  if (!uploaded.id) {
    throw new Error("stripe_file_create_failed");
  }

  const evidence: Stripe.DisputeUpdateParams.Evidence = {
    [params.evidenceKey]: uploaded.id,
  };

  const updated = await stripe.disputes.update(params.disputeId, {
    evidence,
    submit: params.submit,
  });

  return { stripeFileId: uploaded.id, disputeStatus: updated.status };
}

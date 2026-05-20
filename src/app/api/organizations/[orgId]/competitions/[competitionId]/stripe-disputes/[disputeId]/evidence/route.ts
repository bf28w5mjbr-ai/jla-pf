export const runtime = "nodejs";

import { jsonInternalError500, logApiError } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";
import { findCompetitionScopeForStripeDispute } from "@/lib/competitionStripeDisputeAccess";
import { parseDisputeFileEvidenceKey } from "@/lib/stripeDisputeEvidenceKeys";
import { attachDisputeEvidenceFile } from "@/lib/stripeDisputeEvidenceSubmit";

export async function POST(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ orgId: string; competitionId: string; disputeId: string }> }
) {
  try {
    const { orgId: organizationId, competitionId, disputeId } = await params;
    const token = req.cookies.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId, "operational");
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const scope = await findCompetitionScopeForStripeDispute({
      organizationId,
      competitionId,
      disputeId,
    });
    if (!scope) {
      return NextResponse.json({ error: "紛争が見つかりません" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
    }

    const evidenceKey = parseDisputeFileEvidenceKey(
      typeof form.get("evidenceKey") === "string" ? (form.get("evidenceKey") as string) : null
    );
    const submit = form.get("submit") === "true" || form.get("submit") === "on";

    const mime = file.type || "application/octet-stream";
    const buf = Buffer.from(await file.arrayBuffer());

    try {
      const result = await attachDisputeEvidenceFile({
        disputeId,
        fileBuffer: buf,
        mimeType: mime,
        filename: file.name || "evidence",
        evidenceKey,
        submit,
      });
      return NextResponse.json({
        ok: true,
        stripeFileId: result.stripeFileId,
        disputeStatus: result.disputeStatus,
        scope,
      });
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "unsupported_mime") {
          return NextResponse.json(
            { error: "対応しているのは PDF / PNG / JPEG のみです" },
            { status: 400 }
          );
        }
        if (e.message === "file_too_large") {
          return NextResponse.json(
            { error: "ファイルは 8MB 以下にしてください" },
            { status: 400 }
          );
        }
        if (e.message === "empty_file") {
          return NextResponse.json({ error: "空のファイルは送信できません" }, { status: 400 });
        }
      }
      if (e instanceof Stripe.errors.StripeError) {
        logApiError("POST stripe-disputes evidence", e);
        return NextResponse.json(
          { error: e.message || "Stripe での更新に失敗しました" },
          { status: 502 }
        );
      }
      throw e;
    }
  } catch (error) {
    return jsonInternalError500(
      "POST api/organizations/.../stripe-disputes/.../evidence/route.ts",
      error
    );
  }
}

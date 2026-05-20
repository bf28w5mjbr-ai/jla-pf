import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { requireOrgAdmin } from "@/lib/accessControl";

export async function POST(
  _req: NextRequest,
  context: {
    params: Promise<{ orgId: string; competitionId: string }>;
  }
) {
  try {
    const { orgId: organizationId } = await context.params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "未認証です" }, { status: 401 });
    }

    try {
      await requireOrgAdmin(organizationId, session.userId, "operational");
    } catch {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    return NextResponse.json(
      {
        error:
          "直接割当は廃止されました。当日運用（スタートリスト等）の操作は、主催が設定した当日運用アクセス暗号をスタートリスト画面で入力して解除するか、主催アカウントで行ってください。当日出席確認は集計・記録のみです。",
      },
      { status: 410 }
    );
  } catch (e) {
    return jsonInternalError500("POST api/organizations/[orgId]/competitions/[competitionId]/official-assignments/route.ts", e);
  }
}

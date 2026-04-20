import { jsonInternalError500 } from "@/lib/apiInternalError";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { getTrustedClientIp, isLoginIpBlocklisted } from "@/lib/clientIp";
import {
  sendCompetitionHostInquiryEmail,
  resolvePlatformCompetitionInquiryEmail,
} from "@/lib/email/sendCompetitionHostInquiry";
import {
  COMPETITION_HOST_INQUIRY_IP_MAX,
  COMPETITION_HOST_INQUIRY_IP_WINDOW_MS,
  COMPETITION_HOST_INQUIRY_USER_MAX,
  COMPETITION_HOST_INQUIRY_USER_WINDOW_MS,
  throttleKeyCompetitionHostInquiryIp,
  throttleKeyCompetitionHostInquiryUser,
  tryConsumeRateSlot,
} from "@/lib/loginThrottle";
import { hasOrgAdminAccess } from "@/lib/roleScopes";
import { prisma } from "@/server/db";

const MESSAGE_MAX_LEN = 3500;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseMessage(body: unknown): { ok: true; message: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "リクエスト本文が不正です" };
  }
  const raw = (body as Record<string, unknown>).message;
  if (typeof raw !== "string") {
    return { ok: false, error: "メッセージを入力してください" };
  }
  const message = raw.trim();
  if (!message) {
    return { ok: false, error: "メッセージを入力してください" };
  }
  if (message.length > MESSAGE_MAX_LEN) {
    return { ok: false, error: `メッセージは${MESSAGE_MAX_LEN}文字以内で入力してください` };
  }
  return { ok: true, message };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: competitionId } = await context.params;
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    const session = token ? await verifySession(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const ip = getTrustedClientIp(req);
    if (isLoginIpBlocklisted(ip)) {
      return NextResponse.json({ error: "現在このネットワークからは送信できません" }, { status: 403 });
    }

    const parsed = parseMessage(await req.json().catch(() => null));
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const [userSlot, ipSlot] = await Promise.all([
      tryConsumeRateSlot(
        throttleKeyCompetitionHostInquiryUser(session.userId),
        COMPETITION_HOST_INQUIRY_USER_MAX,
        COMPETITION_HOST_INQUIRY_USER_WINDOW_MS
      ),
      tryConsumeRateSlot(
        throttleKeyCompetitionHostInquiryIp(ip),
        COMPETITION_HOST_INQUIRY_IP_MAX,
        COMPETITION_HOST_INQUIRY_IP_WINDOW_MS
      ),
    ]);
    if (!userSlot.allowed) {
      return NextResponse.json(
        { error: "送信回数が上限に達しました。しばらく時間をおいてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(userSlot.retryAfterSec) } }
      );
    }
    if (!ipSlot.allowed) {
      return NextResponse.json(
        { error: "送信回数が上限に達しました。しばらく時間をおいてから再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(ipSlot.retryAfterSec) } }
      );
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        name: true,
        status: true,
        organizationId: true,
        organization: {
          select: {
            admins: {
              where: { userId: session.userId },
              select: { role: true },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    if (competition.status === "DRAFT" && !hasOrgAdminAccess(competition.organization.admins)) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    if (competition.status === "CANCELLED") {
      return NextResponse.json({ error: "この大会は中止のため問い合わせを送信できません" }, { status: 400 });
    }

    const platformTo = resolvePlatformCompetitionInquiryEmail();
    if (!platformTo) {
      return NextResponse.json(
        {
          error:
            "問い合わせメールの送信先が未設定です。管理者にご連絡ください。（PLATFORM_COMPETITION_INQUIRY_EMAIL）",
        },
        { status: 503 }
      );
    }
    if (!process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "メール送信機能が未設定です。管理者にご連絡ください。" },
        { status: 503 }
      );
    }

    const [sender, memberships, orgAdmins] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          familyName: true,
          givenName: true,
        },
      }),
      prisma.membership.findMany({
        where: { userId: session.userId, status: "APPROVED" },
        include: { club: { select: { name: true } } },
        orderBy: { club: { name: "asc" } },
      }),
      prisma.orgAdmin.findMany({
        where: { organizationId: competition.organizationId },
        include: {
          user: { select: { email: true } },
        },
      }),
    ]);

    if (!sender?.email?.trim()) {
      return NextResponse.json({ error: "アカウントにメールアドレスが登録されていません" }, { status: 400 });
    }

    const senderName = `${sender.familyName} ${sender.givenName}`.trim() || "（氏名未設定）";
    const affiliation =
      memberships.length > 0
        ? memberships.map((m) => m.club.name).join("、")
        : "所属クラブなし";

    const platformNorm = normalizeEmail(platformTo);
    const bccSet = new Set<string>();
    for (const row of orgAdmins) {
      const em = row.user.email?.trim();
      if (!em) continue;
      const n = normalizeEmail(em);
      if (n === platformNorm) continue;
      bccSet.add(em.trim());
    }
    const bcc = [...bccSet];

    if (bcc.length === 0) {
      console.warn("[host-inquiry] no org admin BCC addresses", {
        competitionId,
        organizationId: competition.organizationId,
      });
    }

    const subject = `[Bluvium] 大会問い合わせ: ${competition.name}`;
    const textBody = [
      `大会: ${competition.name}`,
      `送信者: ${senderName}`,
      `所属: ${affiliation}`,
      `メールアドレス: ${sender.email.trim()}（返信先）`,
      "",
      "---",
      "",
      parsed.message,
      "",
      "---",
      `competitionId=${competition.id}`,
      `userId=${sender.id}`,
    ].join("\n");

    await sendCompetitionHostInquiryEmail({
      platformTo,
      bcc,
      replyTo: sender.email.trim(),
      subject,
      textBody,
    });

    console.info("[host-inquiry] sent", { competitionId, userId: session.userId, bccCount: bcc.length });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Resend が失敗しました")) {
      return NextResponse.json({ error: "メールの送信に失敗しました。しばらくしてから再度お試しください。" }, { status: 503 });
    }
    if (e instanceof Error && e.message === "RESEND_API_KEY が未設定です") {
      return NextResponse.json({ error: "メール送信機能が未設定です。管理者にご連絡ください。" }, { status: 503 });
    }
    if (e instanceof Error && e.message.includes("PLATFORM_COMPETITION_INQUIRY_EMAIL")) {
      return NextResponse.json(
        {
          error:
            "問い合わせメールの送信先が未設定です。管理者にご連絡ください。（PLATFORM_COMPETITION_INQUIRY_EMAIL）",
        },
        { status: 503 }
      );
    }
    return jsonInternalError500("POST api/competitions/[id]/host-inquiry", e);
  }
}

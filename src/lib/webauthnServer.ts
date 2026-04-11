import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * WebAuthn の expectedOrigin。
 * - リクエストの実際の origin を常に含める
 * - WEBAUTHN_ORIGIN がカンマ区切りならそれらも含める
 * - apex ⇔ www を補完（同一サイトの表記ゆれ対策）
 */
export function resolveWebAuthnExpectedOrigins(req: NextRequest): string | string[] {
  const actual = req.nextUrl.origin;
  const configuredRaw = process.env.WEBAUTHN_ORIGIN?.trim();
  const set = new Set<string>();

  set.add(actual);

  if (configuredRaw) {
    for (const part of configuredRaw.split(/[\s,]+/)) {
      if (part) set.add(part);
    }
  }

  try {
    const u = new URL(actual);
    const host = u.hostname;
    const port = u.port ? `:${u.port}` : "";
    if (host.startsWith("www.")) {
      set.add(`${u.protocol}//${host.slice(4)}${port}`);
    } else if (host && host !== "localhost") {
      set.add(`${u.protocol}//www.${host}${port}`);
    }
  } catch {
    /* ignore */
  }

  const list = [...set];
  return list.length === 1 ? list[0]! : list;
}

/** 既定 true。false のとき UV 必須を外す（セキュリティは低下） */
export function webAuthnRequireUserVerification(): boolean {
  return process.env.WEBAUTHN_REQUIRE_USER_VERIFICATION !== "false";
}

/**
 * verifyRegistrationResponse / verifyAuthenticationResponse が投げる想定内エラーを 400 に落とす。
 */
export function tryWebAuthnVerifyErrorResponse(err: unknown): NextResponse | null {
  if (!(err instanceof Error)) return null;
  const m = err.message;

  if (
    m.includes("Unexpected registration response origin") ||
    m.includes("Unexpected authentication response origin")
  ) {
    return NextResponse.json(
      {
        error:
          "パスキーの認証元（URL）がサーバー設定と一致しません。www の有無を確認するか、Vercel の WEBAUTHN_ORIGIN に実際のアクセス URL をカンマ区切りで追加してください。",
        code: "WEBAUTHN_ORIGIN_MISMATCH",
      },
      { status: 400 }
    );
  }

  if (m.includes("User verification required")) {
    return NextResponse.json(
      {
        error:
          "この端末では本人確認（生体認証や PIN）を満たせませんでした。別の端末を試すか、一時的に Vercel で WEBAUTHN_REQUIRE_USER_VERIFICATION=false を設定してください（セキュリティは低下します）。",
        code: "WEBAUTHN_USER_VERIFICATION",
      },
      { status: 400 }
    );
  }

  if (m.includes("challenge")) {
    return NextResponse.json(
      {
        error:
          "パスキー用の一時データが一致しません。ページを再読み込みしてから、はじめから登録をやり直してください。",
        code: "WEBAUTHN_CHALLENGE",
      },
      { status: 400 }
    );
  }

  if (m.includes("User not present during registration")) {
    return NextResponse.json(
      {
        error: "登録中にユーザーの存在を確認できませんでした。もう一度お試しください。",
        code: "WEBAUTHN_USER_PRESENCE",
      },
      { status: 400 }
    );
  }

  if (m.includes("User not present during authentication")) {
    return NextResponse.json(
      {
        error: "認証中にユーザーの存在を確認できませんでした。もう一度お試しください。",
        code: "WEBAUTHN_USER_PRESENCE_AUTH",
      },
      { status: 400 }
    );
  }

  if (m.includes("counter value") && m.includes("lower than expected")) {
    return NextResponse.json(
      {
        error: "パスキーの利用回数が不整合です。サポートへ連絡するか、別のパスキーを登録してください。",
        code: "WEBAUTHN_COUNTER",
      },
      { status: 400 }
    );
  }

  if (m.includes("Unsupported Attestation Format")) {
    return NextResponse.json(
      {
        error: "この認証器の形式はサポート対象外です。別の端末・ブラウザで試してください。",
        code: "WEBAUTHN_ATTESTATION",
      },
      { status: 400 }
    );
  }

  return null;
}

/** generateRegistrationOptions 周りの想定内エラー */
export function tryWebAuthnRegistrationOptionsError(err: unknown): NextResponse | null {
  if (!(err instanceof Error)) return null;
  const m = err.message;

  if (m.includes("not a valid base64url string")) {
    return NextResponse.json(
      {
        error: "既存パスキー情報の形式が不正です。サポートへ連絡してください。",
        code: "WEBAUTHN_EXCLUDE_CREDENTIALS",
      },
      { status: 400 }
    );
  }

  return null;
}

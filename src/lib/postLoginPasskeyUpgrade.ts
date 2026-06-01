import { appendRedirectQuery } from "@/lib/postLoginRedirect";

export type PostLoginNavigationInput = {
  redirectAfterLogin: string | null;
  passkeyCredentialCount: number;
  supportsPasskey: boolean;
  loginMethod: "password" | "passkey";
};

const DEFAULT_AFTER_LOGIN = "/dashboard";

function defaultDestination(redirectAfterLogin: string | null): string {
  return redirectAfterLogin ?? DEFAULT_AFTER_LOGIN;
}

/**
 * ログイン成功後の遷移先。パスワードログインかつパスキー未登録のときだけ登録画面へ誘導する。
 */
export function resolvePostLoginPath(input: PostLoginNavigationInput): string {
  const destination = defaultDestination(input.redirectAfterLogin);

  if (input.loginMethod === "passkey") {
    return destination;
  }

  if (
    input.loginMethod === "password" &&
    input.supportsPasskey &&
    input.passkeyCredentialCount === 0
  ) {
    return appendRedirectQuery(
      "/register/passkey?source=login",
      input.redirectAfterLogin
    );
  }

  return destination;
}

import { z } from "zod";

const BodySchema = z.object({
  email: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().email().max(320).optional()
  ),
});

export type PasskeyAuthOptionsMode = "discoverable" | "legacy";

export type ParsedPasskeyAuthOptionsBody =
  | { ok: true; mode: "discoverable" }
  | { ok: true; mode: "legacy"; email: string }
  | { ok: false; error: string };

export function parsePasskeyAuthOptionsBody(body: unknown): ParsedPasskeyAuthOptionsBody {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "メールアドレスの形式が正しくありません" };
  }

  const rawEmail = parsed.data.email?.trim();
  if (!rawEmail) {
    return { ok: true, mode: "discoverable" };
  }

  return { ok: true, mode: "legacy", email: rawEmail.toLowerCase() };
}

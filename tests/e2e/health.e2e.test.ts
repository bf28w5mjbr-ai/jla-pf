/* @vitest-environment node */
import { describe, expect, it } from "vitest";

const baseUrl = process.env.E2E_BASE_URL;

describe.skipIf(!baseUrl)("E2E smoke", () => {
  it("GET /api/_health が 200 を返す", async () => {
    const response = await fetch(`${baseUrl}/api/_health`);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { ok?: unknown };
    expect(payload.ok).toBe(true);
  });
});


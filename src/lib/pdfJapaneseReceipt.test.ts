import React from "react";
import { describe, expect, it } from "vitest";
import { ReceiptPDF } from "@/components/pdf/ReceiptPDF";
import { generatePdfBuffer } from "@/lib/pdf-helper";

/**
 * 本番トレース漏れ・フォント解決失敗で領収書 API が 500 になる退行を防ぐ。
 */
describe("generatePdfBuffer + NotoSansJP", () => {
  it("主催団体名義に相当する ReceiptPDF を PDF バイナリにできる", async () => {
    const el = React.createElement(ReceiptPDF, {
      receiptNumber: "TEST-RCT-001",
      issuedDate: new Date("2025-06-01T12:00:00.000Z"),
      subtitle: "テスト主催団体 名義（大会エントリー参加費）",
      purposeLine: "但、テスト大会 の参加申込に係るエントリー費として",
      issuerSectionTitle: "発行元（主催団体）",
      recipientSectionTitle: "お支払い者",
      simplifyTotalsWhenNoTax: true,
      issuer: {
        name: "テスト主催団体",
        email: "host@example.com",
        address: "〒1000001 東京都千代田区",
      },
      recipient: {
        name: "山田 太郎",
        email: "user@example.com",
        address: "〒1234567 大阪府",
      },
      items: [
        {
          description: "テスト大会／参加申込手数料（エントリー費）",
          quantity: 1,
          unitPrice: 5500,
          amount: 5500,
        },
      ],
      subtotal: 5500,
      taxAmount: 0,
      totalAmount: 5500,
    });

    const buf = await generatePdfBuffer(el);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 4).toString("binary")).toBe("%PDF");
  }, 60_000);
});

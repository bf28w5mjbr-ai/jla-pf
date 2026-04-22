import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 42,
    fontSize: 10,
    fontFamily: "NotoSansJP",
    color: "#1a1a1a",
  },
  header: {
    marginBottom: 22,
    borderBottomWidth: 2,
    borderBottomColor: "#15803d",
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#15803d",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 9,
    color: "#525252",
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  metaText: {
    fontSize: 9,
    color: "#525252",
    marginRight: 14,
  },
  metaStrong: {
    fontSize: 9,
    color: "#262626",
    fontWeight: "bold",
  },
  amountBand: {
    marginTop: 14,
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#f7fee7",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 2,
  },
  amountMain: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#14532d",
    marginBottom: 6,
  },
  amountSub: {
    fontSize: 9,
    color: "#3f3f46",
  },
  purposeLine: {
    fontSize: 10,
    color: "#262626",
    marginBottom: 10,
    lineHeight: 1.5,
  },
  confirmation: {
    fontSize: 10,
    color: "#262626",
    marginBottom: 18,
    lineHeight: 1.5,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 6,
    color: "#171717",
    borderBottomWidth: 0.5,
    borderBottomColor: "#d4d4d4",
    paddingBottom: 3,
  },
  partyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  partyCol: {
    width: "48%",
  },
  value: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 3,
    color: "#171717",
  },
  labelLine: {
    fontSize: 9,
    color: "#525252",
    marginBottom: 2,
    lineHeight: 1.4,
  },
  table: {
    marginTop: 6,
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#ecfdf5",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#86efac",
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#14532d",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableCell: {
    fontSize: 9,
    color: "#262626",
  },
  tableCol1: { width: "46%" },
  tableCol2: { width: "14%", textAlign: "right" },
  tableCol3: { width: "20%", textAlign: "right" },
  tableCol4: { width: "20%", textAlign: "right" },
  totalBox: {
    marginTop: 4,
    padding: 12,
    backgroundColor: "#f0fdf4",
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 10,
    color: "#404040",
  },
  totalValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#171717",
  },
  grandTotal: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#15803d",
    marginTop: 4,
  },
  taxNote: {
    fontSize: 8,
    color: "#737373",
    marginTop: 8,
    lineHeight: 1.45,
  },
  stamp: {
    marginTop: 22,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: "#16a34a",
    borderRadius: 2,
    alignItems: "center",
    backgroundColor: "#f0fdf4",
  },
  stampText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#15803d",
  },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 42,
    right: 42,
    textAlign: "center",
    fontSize: 7,
    color: "#a3a3a3",
    lineHeight: 1.35,
  },
});

export interface ReceiptItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ReceiptPDFProps {
  receiptNumber: string;
  issuedDate: Date;
  issuer: {
    name: string;
    email: string;
    address: string;
  };
  recipient: {
    name: string;
    email: string;
    address: string;
  };
  items: ReceiptItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  invoiceNumber?: string;
  /** タイトル直下の補足（例: 主催団体名義・大会エントリー） */
  subtitle?: string;
  /** 但し書き（例: 但、○○大会の参加申込に係るエントリー費として） */
  purposeLine?: string;
  /** 参照ラベル（例: エントリーID） */
  referenceLabel?: string;
  referenceValue?: string;
  /** 左カラム見出し（既定: 発行者） */
  issuerSectionTitle?: string;
  /** 右カラム見出し（既定: 受取人） */
  recipientSectionTitle?: string;
  /** 消費税が 0 のときの注記（未指定時は共通の短文） */
  taxExemptNote?: string | false;
  /** true のとき消費税行を出さず合計のみ簡略表示 */
  simplifyTotalsWhenNoTax?: boolean;
  /** フッター文言（複数行は \n） */
  footerText?: string;
}

function formatDateJa(date: Date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number) {
  const n = typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount) : 0;
  return `¥${n.toLocaleString("ja-JP")}`;
}

function nonEmptyLines(...parts: (string | undefined | null)[]) {
  return parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

export const ReceiptPDF: React.FC<ReceiptPDFProps> = ({
  receiptNumber,
  issuedDate,
  issuer,
  recipient,
  items,
  subtotal,
  taxAmount,
  totalAmount,
  invoiceNumber,
  subtitle,
  purposeLine,
  referenceLabel,
  referenceValue,
  issuerSectionTitle = "発行者",
  recipientSectionTitle = "受取人",
  taxExemptNote,
  simplifyTotalsWhenNoTax = false,
  footerText,
}) => {
  const isFree = totalAmount === 0;
  const showTaxRow = !simplifyTotalsWhenNoTax || taxAmount !== 0;
  const defaultTaxNote =
    taxExemptNote === false
      ? null
      : (taxExemptNote ??
        "※ 消費税額は、非課税・不課税又は課税対象外の取引として取り扱う旨を発行元にて確認のうえ、金額に含めず記載しておりません。");

  const amountTitle = isFree
    ? `金額　${formatCurrency(0)}（無償エントリー）`
    : `金額　${formatCurrency(totalAmount)}（税込）`;

  const footerLines =
    footerText?.split("\n").filter(Boolean) ??
    ["本書はシステムにより自動生成された領収書です。"];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>領 収 書</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              <Text style={styles.metaStrong}>No. </Text>
              {receiptNumber}
            </Text>
            <Text style={styles.metaText}>
              <Text style={styles.metaStrong}>発行日 </Text>
              {formatDateJa(issuedDate)}
            </Text>
            {referenceLabel && referenceValue ? (
              <Text style={styles.metaText}>
                <Text style={styles.metaStrong}>{referenceLabel} </Text>
                {referenceValue}
              </Text>
            ) : null}
            {invoiceNumber ? (
              <Text style={styles.metaText}>
                <Text style={styles.metaStrong}>請求書番号 </Text>
                {invoiceNumber}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.amountBand}>
          <Text style={styles.amountMain}>{amountTitle}</Text>
          <Text style={styles.amountSub}>
            {isFree
              ? "本エントリーは参加費の徴収を行っていません。"
              : "以下のとおり、参加に係る費用を領収いたしました。"}
          </Text>
        </View>

        {purposeLine ? <Text style={styles.purposeLine}>{purposeLine}</Text> : null}

        <Text style={styles.confirmation}>
          {isFree
            ? "上記のとおり、無償による参加の受付を確認いたしました。"
            : "上記の金額を確かに領収いたしました。"}
        </Text>

        <View style={styles.partyRow}>
          <View style={styles.partyCol}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{recipientSectionTitle}</Text>
              <Text style={styles.value}>{recipient.name}</Text>
              {nonEmptyLines(recipient.email).map((line, i) => (
                <Text key={`re-${i}`} style={styles.labelLine}>
                  {line}
                </Text>
              ))}
              {nonEmptyLines(recipient.address).map((line, i) => (
                <Text key={`ra-${i}`} style={styles.labelLine}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
          <View style={styles.partyCol}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{issuerSectionTitle}</Text>
              <Text style={styles.value}>{issuer.name}</Text>
              {nonEmptyLines(issuer.email).map((line, i) => (
                <Text key={`ie-${i}`} style={styles.labelLine}>
                  {line}
                </Text>
              ))}
              {nonEmptyLines(issuer.address).map((line, i) => (
                <Text key={`ia-${i}`} style={styles.labelLine}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>内訳</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCol1, styles.tableHeaderText]}>摘要</Text>
              <Text style={[styles.tableCol2, styles.tableHeaderText]}>数量</Text>
              <Text style={[styles.tableCol3, styles.tableHeaderText]}>単価</Text>
              <Text style={[styles.tableCol4, styles.tableHeaderText]}>金額</Text>
            </View>
            {items.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCol1, styles.tableCell]}>{item.description}</Text>
                <Text style={[styles.tableCol2, styles.tableCell]}>{item.quantity}</Text>
                <Text style={[styles.tableCol3, styles.tableCell]}>
                  {formatCurrency(item.unitPrice)}
                </Text>
                <Text style={[styles.tableCol4, styles.tableCell]}>
                  {formatCurrency(item.amount)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.totalBox}>
          {simplifyTotalsWhenNoTax && taxAmount === 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>合計（税込）</Text>
              <Text style={[styles.totalValue, styles.grandTotal]}>
                {formatCurrency(totalAmount)}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>小計</Text>
                <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
              </View>
              {showTaxRow ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>消費税等</Text>
                  <Text style={styles.totalValue}>{formatCurrency(taxAmount)}</Text>
                </View>
              ) : null}
              <View style={styles.totalRow}>
                <Text style={styles.grandTotal}>合計</Text>
                <Text style={styles.grandTotal}>{formatCurrency(totalAmount)}</Text>
              </View>
            </>
          )}
          {taxAmount === 0 && totalAmount > 0 && defaultTaxNote ? (
            <Text style={styles.taxNote}>{defaultTaxNote}</Text>
          ) : null}
        </View>

        <View style={styles.stamp}>
          <Text style={styles.stampText}>{isFree ? "受付確認済" : "領収済"}</Text>
        </View>

        <View style={styles.footer}>
          {footerLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>
      </Page>
    </Document>
  );
};

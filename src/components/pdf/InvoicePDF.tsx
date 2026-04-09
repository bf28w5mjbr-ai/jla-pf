import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "NotoSansJP",
  },
  header: {
    marginBottom: 30,
    borderBottom: "2pt solid #ea580c",
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ea580c",
    marginBottom: 5,
  },
  invoiceNumber: {
    fontSize: 12,
    color: "#666",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#333",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  label: {
    fontSize: 10,
    color: "#666",
  },
  value: {
    fontSize: 10,
    fontWeight: "bold",
  },
  table: {
    marginTop: 10,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    padding: 8,
    fontWeight: "bold",
    borderBottom: "1pt solid #d1d5db",
  },
  tableRow: {
    flexDirection: "row",
    padding: 8,
    borderBottom: "1pt solid #e5e7eb",
  },
  tableCol1: {
    width: "50%",
  },
  tableCol2: {
    width: "15%",
    textAlign: "right",
  },
  tableCol3: {
    width: "20%",
    textAlign: "right",
  },
  tableCol4: {
    width: "15%",
    textAlign: "right",
  },
  total: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#fff7ed",
    borderRadius: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  totalLabel: {
    fontSize: 11,
  },
  totalValue: {
    fontSize: 11,
    fontWeight: "bold",
  },
  grandTotal: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#ea580c",
  },
  notes: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#fef3c7",
    borderRadius: 4,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 5,
  },
  notesText: {
    fontSize: 9,
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#999",
  },
});

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface InvoicePDFProps {
  invoiceNumber: string;
  issuedDate: Date;
  dueDate: Date;
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
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
}

export const InvoicePDF: React.FC<InvoicePDFProps> = ({
  invoiceNumber,
  issuedDate,
  dueDate,
  issuer,
  recipient,
  items,
  subtotal,
  taxAmount,
  totalAmount,
  notes,
}) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>請求書</Text>
          <Text style={styles.invoiceNumber}>請求書番号: {invoiceNumber}</Text>
        </View>

        <View style={styles.row}>
          <View style={{ width: "48%" }}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>発行者</Text>
              <Text style={styles.value}>{issuer.name}</Text>
              <Text style={styles.label}>{issuer.email}</Text>
              <Text style={styles.label}>{issuer.address}</Text>
            </View>
          </View>

          <View style={{ width: "48%" }}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>請求先</Text>
              <Text style={styles.value}>{recipient.name}</Text>
              <Text style={styles.label}>{recipient.email}</Text>
              <Text style={styles.label}>{recipient.address}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>発行日</Text>
            <Text style={styles.value}>{formatDate(issuedDate)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>支払期限</Text>
            <Text style={styles.value}>{formatDate(dueDate)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableCol1}>項目</Text>
            <Text style={styles.tableCol2}>数量</Text>
            <Text style={styles.tableCol3}>単価</Text>
            <Text style={styles.tableCol4}>金額</Text>
          </View>
          {items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.tableCol1}>{item.description}</Text>
              <Text style={styles.tableCol2}>{item.quantity}</Text>
              <Text style={styles.tableCol3}>{formatCurrency(item.unitPrice)}</Text>
              <Text style={styles.tableCol4}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.total}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>小計</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>消費税</Text>
            <Text style={styles.totalValue}>{formatCurrency(taxAmount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalValue, styles.grandTotal]}>
              合計 {formatCurrency(totalAmount)}
            </Text>
          </View>
        </View>

        {notes && (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>備考</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>本書はシステムにより自動生成されています</Text>
      </Page>
    </Document>
  );
};

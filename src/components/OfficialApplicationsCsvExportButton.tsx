"use client";

import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

export type OfficialApplicationsCsvRow = {
  応募日時: string;
  審査状態: string;
  氏名: string;
  メールアドレス: string;
  電話番号: string;
  希望ポジション: string;
  応募メッセージ: string;
};

function escapeCsvCell(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function sanitizeFileName(name: string): string {
  const normalized = name.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
  return normalized.length > 0 ? normalized.slice(0, 80) : "official_entries";
}

function buildCsv(rows: OfficialApplicationsCsvRow[]): string {
  const headers: (keyof OfficialApplicationsCsvRow)[] = [
    "応募日時",
    "審査状態",
    "氏名",
    "メールアドレス",
    "電話番号",
    "希望ポジション",
    "応募メッセージ",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(",")),
  ];
  return lines.join("\r\n");
}

export default function OfficialApplicationsCsvExportButton({
  rows,
  fileNameBase,
}: {
  rows: OfficialApplicationsCsvRow[];
  fileNameBase: string;
}) {
  const onDownload = () => {
    if (rows.length === 0) return;
    const csv = buildCsv(rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFileName(fileNameBase)}.csv`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={onDownload}
      disabled={rows.length === 0}
    >
      <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
      エントリーオフィシャル情報をCSV出力
    </Button>
  );
}

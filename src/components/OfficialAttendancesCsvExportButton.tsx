"use client";

import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

export type OfficialAttendancesCsvRow = {
  出席日: string;
  氏名: string;
  メールアドレス: string;
  電話番号: string;
  出席方法: string;
  大会種別: string;
  カウント追加分: string;
};

function escapeCsvCell(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function sanitizeFileName(name: string): string {
  const normalized = name.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
  return normalized.length > 0 ? normalized.slice(0, 80) : "official_attendances";
}

function buildCsv(rows: OfficialAttendancesCsvRow[]): string {
  const headers: (keyof OfficialAttendancesCsvRow)[] = [
    "出席日",
    "氏名",
    "メールアドレス",
    "電話番号",
    "出席方法",
    "大会種別",
    "カウント追加分",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(",")),
  ];
  return lines.join("\r\n");
}

export default function OfficialAttendancesCsvExportButton({
  rows,
  fileNameBase,
}: {
  rows: OfficialAttendancesCsvRow[];
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
      当日出席オフィシャル情報をCSV出力
    </Button>
  );
}

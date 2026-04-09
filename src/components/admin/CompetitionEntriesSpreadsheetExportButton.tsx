"use client";

import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";

export type EntryExportRow = {
  statusLabel: string;
  name: string;
  nameKana: string;
  sex: string;
  birth: string;
  phone: string;
  email: string;
  eventInfo: string;
};

const CSV_HEADERS = [
  "エントリー状況",
  "氏名",
  "氏名カナ",
  "性別",
  "生年月日",
  "電話番号",
  "メールアドレス",
  "種目情報",
] as const;

function escapeCsvCell(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function buildEntryCsv(rows: EntryExportRow[]): string {
  const lines = [
    CSV_HEADERS.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.statusLabel),
        escapeCsvCell(r.name),
        escapeCsvCell(r.nameKana),
        escapeCsvCell(r.sex),
        escapeCsvCell(r.birth),
        escapeCsvCell(r.phone),
        escapeCsvCell(r.email),
        escapeCsvCell(r.eventInfo),
      ].join(",")
    ),
  ];
  return lines.join("\r\n");
}

function sanitizeDownloadFileNameBase(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
  return trimmed.length > 0 ? trimmed.slice(0, 80) : "entries";
}

type Props = {
  rows: EntryExportRow[];
  /** 拡張子なし。例: `大会名_個人` */
  fileNameBase: string;
  /** ボタン表示ラベル */
  label?: string;
};

export function CompetitionEntriesSpreadsheetExportButton({
  rows,
  fileNameBase,
  label = "CSVダウンロード",
}: Props) {
  const handleClick = () => {
    if (rows.length === 0) return;
    const csv = buildEntryCsv(rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeDownloadFileNameBase(fileNameBase)}.csv`;
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
      onClick={handleClick}
      disabled={rows.length === 0}
    >
      <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </Button>
  );
}

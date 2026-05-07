import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage = "データがありません",
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/75 bg-card">
      <table className="min-w-full border-collapse">
        <thead className="bg-muted/25">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                scope="col"
                className={cn(
                  "px-4 py-3 text-left text-xs font-semibold tracking-tight text-muted-foreground sm:px-5",
                  idx === 0 &&
                    "sticky left-0 z-[2] border-r border-border/70 bg-muted/95 backdrop-blur-sm supports-[backdrop-filter]:bg-muted/85"
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {data.length === 0 ? (
            <tr>
              <td
                className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-5"
                colSpan={columns.length}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="group/row transition-colors hover:bg-muted/35"
              >
                {columns.map((col, idx) => (
                  <td
                    key={idx}
                    className={cn(
                      "px-4 py-3 text-sm sm:px-5",
                      col.className || "",
                      idx === 0 &&
                        "sticky left-0 z-[1] border-r border-border/70 bg-card shadow-[2px_0_8px_-4px_rgba(0,0,0,0.12)] transition-colors group-hover/row:bg-muted/50 dark:shadow-[2px_0_10px_-4px_rgba(0,0,0,0.45)]"
                    )}
                  >
                    {typeof col.accessor === "function"
                      ? col.accessor(row)
                      : String(row[col.accessor])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

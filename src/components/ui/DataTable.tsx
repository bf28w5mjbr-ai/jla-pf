import { ReactNode } from "react";

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
      <table className="min-w-full">
        <thead className="bg-muted/25">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-5"
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
                className="transition-colors hover:bg-muted/35"
              >
                {columns.map((col, idx) => (
                  <td key={idx} className={`px-4 py-3 text-sm sm:px-5 ${col.className || ""}`}>
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

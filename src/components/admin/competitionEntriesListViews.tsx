/** チームエントリー一覧（クラブ・種目ごとのチーム数）用 */
export type TeamEntryGroupListRow = {
  key: string;
  rowIndex: number;
  clubName: string;
  eventLabel: string;
  teamCount: number;
};

export type IndividualEntryListRow = {
  key: string;
  fullName: string;
  clubName: string;
  eventsLabel: string;
};

export function EntriesEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function TeamEntryGroupsTableDesktop({ rows }: { rows: TeamEntryGroupListRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border shadow-sm md:block">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              No.
            </th>
            <th className="min-w-[10rem] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              クラブ名
            </th>
            <th className="min-w-[14rem] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              エントリー種目
            </th>
            <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              チーム数
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-border last:border-0 odd:bg-muted/20 hover:bg-muted/40"
            >
              <td className="whitespace-nowrap px-3 py-2.5 align-top tabular-nums text-muted-foreground">
                {row.rowIndex}
              </td>
              <td className="max-w-[16rem] whitespace-normal px-3 py-2.5 align-top text-xs leading-snug text-foreground">
                {row.clubName}
              </td>
              <td className="px-3 py-2.5 align-top text-xs leading-relaxed text-foreground">{row.eventLabel}</td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-right tabular-nums text-foreground">
                {row.teamCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamEntryGroupsCardsMobile({ rows }: { rows: TeamEntryGroupListRow[] }) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
            <span className="text-xs font-medium text-muted-foreground">No. {row.rowIndex}</span>
            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
              チーム {row.teamCount}
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">{row.clubName}</p>
          <p className="mt-2 text-xs leading-relaxed text-foreground">
            <span className="mb-1 block font-medium text-muted-foreground">エントリー種目</span>
            {row.eventLabel}
          </p>
        </div>
      ))}
    </div>
  );
}

export function TeamEntryGroupsResponsive({
  rows,
  emptyMessage,
}: {
  rows: TeamEntryGroupListRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EntriesEmpty message={emptyMessage} />;
  }
  return (
    <>
      <TeamEntryGroupsCardsMobile rows={rows} />
      <TeamEntryGroupsTableDesktop rows={rows} />
    </>
  );
}

function IndividualEntriesTableDesktop({ rows }: { rows: IndividualEntryListRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border shadow-sm md:block">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            <th className="min-w-[8rem] whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">
              氏名
            </th>
            <th className="min-w-[7rem] whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">
              所属クラブ
            </th>
            <th className="min-w-[14rem] px-3 py-3 text-xs font-semibold text-muted-foreground">出場種目</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-border last:border-0 odd:bg-muted/20 hover:bg-muted/40"
            >
              <td className="whitespace-nowrap px-3 py-2.5 align-top font-medium text-foreground">
                {row.fullName}
              </td>
              <td className="max-w-[14rem] whitespace-normal px-3 py-2.5 align-top text-xs leading-snug text-foreground">
                {row.clubName}
              </td>
              <td className="px-3 py-2.5 align-top text-xs leading-relaxed text-foreground">{row.eventsLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndividualEntriesCardsMobile({ rows }: { rows: IndividualEntryListRow[] }) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">{row.fullName}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">所属クラブ</span> {row.clubName}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-foreground">
            <span className="mb-1 block font-medium text-muted-foreground">出場種目</span>
            {row.eventsLabel}
          </p>
        </div>
      ))}
    </div>
  );
}

export function IndividualEntriesResponsive({
  rows,
  emptyMessage,
}: {
  rows: IndividualEntryListRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EntriesEmpty message={emptyMessage} />;
  }
  return (
    <>
      <IndividualEntriesCardsMobile rows={rows} />
      <IndividualEntriesTableDesktop rows={rows} />
    </>
  );
}

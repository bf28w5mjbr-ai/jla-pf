"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpDown, ListFilter } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type CompetitionListSort = "start" | "entry_end" | "entries";

const SORT_LABEL: Record<CompetitionListSort, string> = {
  start: "開催日順",
  entry_end: "エントリー締切順",
  entries: "おすすめ順",
};

type Props = {
  sort: CompetitionListSort;
  sortHrefs: Record<CompetitionListSort, string>;
  selectedView: "all" | "upcoming" | "past";
  selectedCategory: string;
  searchQuery: string;
  availableCategories: string[];
  viewHrefs: { all: string; upcoming: string; past: string };
  categoryHrefs: { all: string; byCategory: Record<string, string> };
  resetHref: string;
};

export function CompetitionsListControls({
  sort,
  sortHrefs,
  selectedView,
  selectedCategory,
  searchQuery,
  availableCategories,
  viewHrefs,
  categoryHrefs,
  resetHref,
}: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const filterActive =
    selectedCategory !== "ALL" ||
    selectedView !== "all" ||
    searchQuery.length > 0;

  const viewLabel =
    selectedView === "upcoming"
      ? "開催予定"
      : selectedView === "past"
        ? "過去"
        : "すべて";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={sortOpen} onOpenChange={setSortOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant={sort !== "start" ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              並び替え
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">並び替え</DialogTitle>
            </DialogHeader>
            <div className="grid gap-1.5 pt-1">
              {(
                [
                  ["start", "開催日順", "開催日が近い順（予定）／新しい順（過去）"],
                  [
                    "entry_end",
                    "エントリー締切順",
                    "締切が近い順（予定）／締切が新しい順（過去）",
                  ],
                  [
                    "entries",
                    "おすすめ順",
                    "個人エントリー＋チームエントリー件数が多い順",
                  ],
                ] as const
              ).map(([key, title, desc]) => (
                <DialogClose key={key} asChild>
                  <Link
                    href={sortHrefs[key]}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm transition hover:bg-muted/80 ${
                      sort === key
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border"
                    }`}
                  >
                    <div>{title}</div>
                    <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {desc}
                    </div>
                  </Link>
                </DialogClose>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant={filterActive ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <ListFilter className="h-3.5 w-3.5" />
              絞り込み
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">絞り込み</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <form action="/competitions" method="get" className="space-y-2">
                {sort !== "start" && (
                  <input type="hidden" name="sort" value={sort} />
                )}
                {selectedCategory !== "ALL" && (
                  <input type="hidden" name="category" value={selectedCategory} />
                )}
                {selectedView !== "all" && (
                  <input type="hidden" name="view" value={selectedView} />
                )}
                <p className="text-xs font-medium text-muted-foreground">
                  キーワード
                </p>
                <div className="flex gap-2">
                  <Input
                    name="q"
                    defaultValue={searchQuery}
                    placeholder="大会名・会場・主催団体"
                    className="h-9 text-sm"
                  />
                  <Button type="submit" size="sm" className="h-9 shrink-0">
                    検索
                  </Button>
                </div>
              </form>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">期間</p>
                <div className="flex flex-wrap gap-1.5">
                  <DialogClose asChild>
                    <Link
                      href={viewHrefs.all}
                      className={cn(
                        buttonVariants({
                          variant: selectedView === "all" ? "default" : "outline",
                          size: "sm",
                        }),
                        "h-8 text-xs"
                      )}
                    >
                      すべて
                    </Link>
                  </DialogClose>
                  <DialogClose asChild>
                    <Link
                      href={viewHrefs.upcoming}
                      className={cn(
                        buttonVariants({
                          variant:
                            selectedView === "upcoming" ? "default" : "outline",
                          size: "sm",
                        }),
                        "h-8 text-xs"
                      )}
                    >
                      開催予定
                    </Link>
                  </DialogClose>
                  <DialogClose asChild>
                    <Link
                      href={viewHrefs.past}
                      className={cn(
                        buttonVariants({
                          variant: selectedView === "past" ? "default" : "outline",
                          size: "sm",
                        }),
                        "h-8 text-xs"
                      )}
                    >
                      過去
                    </Link>
                  </DialogClose>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  カテゴリ
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <DialogClose asChild>
                    <Link
                      href={categoryHrefs.all}
                      className={cn(
                        buttonVariants({
                          variant:
                            selectedCategory === "ALL" ? "default" : "outline",
                          size: "sm",
                        }),
                        "h-8 text-xs"
                      )}
                    >
                      すべて
                    </Link>
                  </DialogClose>
                  {availableCategories.map((category) => (
                    <DialogClose key={category} asChild>
                      <Link
                        href={categoryHrefs.byCategory[category]!}
                        className={cn(
                          buttonVariants({
                            variant:
                              selectedCategory === category
                                ? "default"
                                : "outline",
                            size: "sm",
                          }),
                          "h-8 text-xs"
                        )}
                      >
                        {category}
                      </Link>
                    </DialogClose>
                  ))}
                </div>
              </div>

              {filterActive && (
                <div className="border-t border-border pt-3">
                  <DialogClose asChild>
                    <Link
                      href={resetHref}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "h-8 w-full text-xs"
                      )}
                    >
                      絞り込みをリセット
                    </Link>
                  </DialogClose>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="rounded-md bg-muted/80 px-1.5 py-0.5 text-foreground/90">
          {SORT_LABEL[sort]}
        </span>
        <span className="rounded-md bg-muted/50 px-1.5 py-0.5">{viewLabel}</span>
        <span className="rounded-md bg-muted/50 px-1.5 py-0.5">
          {selectedCategory === "ALL" ? "全カテゴリ" : selectedCategory}
        </span>
        {searchQuery.length > 0 && (
          <span
            className="max-w-[14rem] truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-primary"
            title={searchQuery}
          >
            「{searchQuery}」
          </span>
        )}
      </div>
    </div>
  );
}

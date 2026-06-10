"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  organizationId: string;
  competitionId: string;
  isExpanded: boolean;
  className?: string;
};

export function BusinessPanelFinanceExpandToggle({
  organizationId,
  competitionId,
  isExpanded,
  className,
}: Props) {
  const href = isExpanded
    ? `/organizations/${organizationId}?tab=business`
    : `/organizations/${organizationId}?tab=business&financeCompetition=${competitionId}`;

  return (
    <Button asChild variant={isExpanded ? "secondary" : "outline"} size="sm" className={className}>
      <Link href={href} scroll={false}>
        {isExpanded ? (
          <>
            <ChevronUp className="h-3.5 w-3.5 opacity-70" aria-hidden />
            閉じる
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
            収支
          </>
        )}
      </Link>
    </Button>
  );
}

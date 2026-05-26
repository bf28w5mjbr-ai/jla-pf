import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import DayOpsUnlockBanner from "@/components/DayOpsUnlockBanner";

type Props = {
  competitionId: string;
  dayOpsUnlockConfigured: boolean;
  hasDayOpsUnlock: boolean;
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
};

export default function StartListEventPageShell({
  competitionId,
  dayOpsUnlockConfigured,
  hasDayOpsUnlock,
  backHref,
  backLabel,
  children,
}: Props) {
  return (
    <div className="app-page mx-auto max-w-3xl space-y-3.5 px-3 py-4 sm:max-w-4xl sm:px-5 sm:py-6">
      <DayOpsUnlockBanner
        competitionId={competitionId}
        passphraseConfigured={dayOpsUnlockConfigured}
        alreadyUnlocked={hasDayOpsUnlock}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-9 gap-1 px-3 text-xs shadow-sm" asChild>
          <Link href={backHref}>
            <ChevronLeft className="size-4" />
            {backLabel}
          </Link>
        </Button>
      </div>
      {children}
    </div>
  );
}

import { cn } from "@/lib/utils";

export function buildClubCaptionLine(
  memberships: Array<{ club: { abbreviation: string | null; name: string } }>
): string | null {
  if (memberships.length === 0) return null;
  return memberships
    .map((m) => m.club.abbreviation || m.club.name)
    .join(" · ");
}

export function buildQualificationCaptionLine(
  qualifications: Array<{ kind: string }>,
  labelForKind: (kind: string) => string
): string | null {
  if (qualifications.length === 0) return null;
  return qualifications.map((q) => labelForKind(q.kind)).join(" · ");
}

export function HeroCaptionText({
  children,
  className,
  variant = "overlay",
}: {
  children: string;
  className?: string;
  variant?: "overlay" | "panel";
}) {
  return (
    <p
      className={cn(
        "text-sm tracking-wide",
        variant === "overlay"
          ? "text-white/90 drop-shadow-sm"
          : "text-foreground/75",
        className
      )}
    >
      {children}
    </p>
  );
}

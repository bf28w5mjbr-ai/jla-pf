import { ReactNode, useId } from "react";
import type { ExplanationDensity } from "@/lib/explanation";
import { sectionLeadClass } from "@/lib/explanation";
import { cn } from "@/lib/utils";

export function FormSection({
  title,
  description,
  descriptionDensity = "balanced",
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** セクション説明の視認性・分量の段階（デフォルト: balanced） */
  descriptionDensity?: ExplanationDensity;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-muted/30 p-4 shadow-sm sm:p-5",
        className
      )}
      aria-labelledby={headingId}
    >
      <div className="mb-4 border-b border-border/80 pb-3">
        <h2 id={headingId} className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description != null && description !== "" && (
          <p className={sectionLeadClass(descriptionDensity)}>{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

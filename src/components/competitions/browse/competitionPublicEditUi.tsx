import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CompetitionEditorialSection } from "./competitionEditorialUi";

export type CompetitionPublicLayout = "classic" | "editorial";

type SectionAccent = "orange" | "emerald" | "muted";

export function CompetitionPublicEditButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "h-8 shrink-0 gap-1.5 border-border/70 bg-background/80 text-xs shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function CompetitionPublicInlineForm({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-2.5 rounded-xl border border-dashed border-orange-300/45 bg-orange-50/30 p-3.5 dark:border-orange-800/40 dark:bg-orange-950/20 sm:p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CompetitionPublicListItem({
  children,
  className,
  layout = "classic",
}: {
  children: ReactNode;
  className?: string;
  layout?: CompetitionPublicLayout;
}) {
  return (
    <div
      className={cn(
        layout === "editorial"
          ? "py-4 first:pt-0"
          : "rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CompetitionPublicEmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="py-4 text-center text-xs leading-relaxed text-muted-foreground">{children}</p>
  );
}

export function CompetitionPublicContentSection({
  layout = "classic",
  subheading,
  title,
  titleExtra,
  description,
  accent = "muted",
  children,
  className,
  contentClassName,
}: {
  layout?: CompetitionPublicLayout;
  subheading: string;
  title: ReactNode;
  titleExtra?: ReactNode;
  description?: string;
  accent?: SectionAccent;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  if (layout === "editorial") {
    return (
      <CompetitionEditorialSection
        subheading={subheading}
        title={title}
        titleExtra={titleExtra}
        variant="flat"
        accent={accent}
        className={className}
      >
        {description ? (
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        <div className={contentClassName}>{children}</div>
      </CompetitionEditorialSection>
    );
  }

  return (
    <Card className={cn("overflow-hidden border-border/80 shadow-sm", className)}>
      <CardHeader className="space-y-0.5 border-b border-border/80 bg-muted/15 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
            {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
          </div>
          {titleExtra}
        </div>
      </CardHeader>
      <CardContent className={cn("px-4 py-3 sm:px-5 sm:py-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

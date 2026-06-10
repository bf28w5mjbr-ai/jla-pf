import type { ReactNode } from "react";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import { cn } from "@/lib/utils";

export function SettingsEditorialSection({
  label,
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  isFirst = false,
}: {
  label: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  isFirst?: boolean;
}) {
  return (
    <section
      className={cn(
        dashboardSectionClassName,
        isFirst ? "pb-12 pt-10 sm:pb-16 sm:pt-12" : "border-t border-border/40 pb-12 pt-12 sm:pb-16 sm:pt-16",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            {label}
          </p>
          <h2 className="mt-1 text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn("mt-6", contentClassName)}>{children}</div>
    </section>
  );
}

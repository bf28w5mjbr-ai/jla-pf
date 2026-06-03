import { cn } from "@/lib/utils";

type Props = {
  label: string;
  title: string;
  className?: string;
};

export function HomeSectionHeading({ label, title, className }: Props) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <h2 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {title}
      </h2>
    </div>
  );
}

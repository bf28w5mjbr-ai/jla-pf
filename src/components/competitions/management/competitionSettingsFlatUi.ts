import { cn } from "@/lib/utils";

export const settingsFlatHint = "text-[11px] leading-relaxed text-muted-foreground";

export const settingsFlatSectionLabel =
  "text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/75";

export const settingsFlatValue = "text-xs text-foreground";

export const settingsFlatValueStrong = "text-xs font-medium text-foreground";

export const settingsFlatRow =
  "group flex min-h-8 items-center gap-2 py-1 transition-colors hover:bg-muted/25";

export const settingsFlatDivide = "divide-y divide-border/40";

export const settingsFlatEditSurface = "border-l border-foreground/15 py-2 pl-3";

export const settingsFlatList = "divide-y divide-border/40";

export const settingsFlatFieldGroup = "space-y-3 py-3 first:pt-0 last:pb-0";

export const settingsFlatInputShell =
  "flex min-h-8 items-center gap-2 rounded-md border border-border/50 bg-background px-2.5";

export function settingsFlatStatusClass(tone: "muted" | "success" | "error"): string {
  return cn(
    settingsFlatHint,
    tone === "success" && "text-emerald-700 dark:text-emerald-300",
    tone === "error" && "text-destructive"
  );
}

export function settingsFlatBlockTitleClassName(): string {
  return "text-sm font-semibold tracking-tight text-foreground";
}

import type { LucideIcon } from "lucide-react";
import { IdCard, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

function ContactItem({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: string;
  className?: string;
}) {
  return (
    <li className={cn("flex min-w-0 items-center gap-2", className)}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
      <span className="truncate text-sm text-foreground/90">{children}</span>
    </li>
  );
}

export function DashboardProfileHeroContact({
  phoneNumber,
  email,
  jlaMemberNumber,
  className,
}: {
  phoneNumber: string | null;
  email: string | null;
  jlaMemberNumber: string | null;
  className?: string;
}) {
  const items: { icon: LucideIcon; value: string }[] = [];
  if (phoneNumber) items.push({ icon: Phone, value: phoneNumber });
  if (email) items.push({ icon: Mail, value: email });
  if (jlaMemberNumber) items.push({ icon: IdCard, value: `JLA ${jlaMemberNumber}` });

  if (items.length === 0) return null;

  return (
    <div className={cn("mt-6", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
        Contact
      </p>
      <ul className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
        {items.map((item) => (
          <ContactItem key={item.value} icon={item.icon}>
            {item.value}
          </ContactItem>
        ))}
      </ul>
    </div>
  );
}

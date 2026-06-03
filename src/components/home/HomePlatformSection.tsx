import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";

const pillars = [
  {
    title: "会員・所属",
    body: "クラブへの参加や所属情報をアプリ上で管理できます。",
  },
  {
    title: "資格・大会",
    body: "資格情報や大会エントリーに必要な条件をまとめて扱えます。",
  },
  {
    title: "決済",
    body: "エントリー料などの支払いを安全に処理できます。",
  },
] as const;

export function HomePlatformSection() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-14 sm:max-w-4xl sm:py-16 lg:max-w-5xl">
      <HomeSectionHeading label="Platform" title="大会運営に必要な機能を、ひとつに" />
      <ul className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
        {pillars.map((item, index) => (
          <li
            key={item.title}
            className="flex flex-col rounded-2xl border border-border/90 bg-card/95 p-6 shadow-sm backdrop-blur-sm dark:border-border dark:bg-card/80 sm:min-h-[11rem]"
          >
            <span className="text-[11px] font-medium tabular-nums text-primary/80">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-base font-semibold text-foreground">{item.title}</h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

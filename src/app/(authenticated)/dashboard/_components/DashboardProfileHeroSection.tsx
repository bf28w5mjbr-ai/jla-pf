import type { ReactNode } from "react";
import { DashboardProfileHeroGeometry } from "./DashboardProfileHeroGeometry";

export function DashboardProfileHeroSection({
  familyName,
  givenName,
  meta,
  contact,
  captions,
  settingsAction,
}: {
  familyName: string;
  givenName: string;
  meta: ReactNode;
  contact?: ReactNode;
  captions?: ReactNode;
  settingsAction: ReactNode;
}) {
  return (
    <section className="relative w-full overflow-hidden pb-12 pt-3 md:mx-auto md:max-w-3xl md:px-4 md:pb-16 md:py-16 lg:max-w-5xl lg:py-20">
      <DashboardProfileHeroGeometry
        variant="accent"
        className="absolute -right-6 top-16 opacity-70 sm:-right-4 sm:top-14 md:hidden"
      />

      <div className="absolute right-4 top-3 z-10 md:right-0 md:top-4">{settingsAction}</div>

      <div className="relative grid md:grid-cols-[minmax(0,1fr)_minmax(0,11rem)] md:items-start md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,13rem)] lg:gap-12">
        <div className="relative z-[1] min-w-0 max-w-3xl px-4 md:px-0">
          <header>
            <h1 className="text-[1.85rem] font-semibold leading-[1.15] tracking-tight text-foreground min-[400px]:text-3xl sm:text-4xl lg:text-[2.75rem]">
              {familyName}{" "}
              <span className="text-orange-700 dark:text-orange-200">{givenName}</span>
            </h1>

            <div className="mt-4 max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base">
              {meta}
            </div>
          </header>

          {contact}

          {captions ? <div className="mt-5 flex flex-col gap-2">{captions}</div> : null}
        </div>

        <DashboardProfileHeroGeometry className="mt-2 hidden justify-self-end md:block lg:mt-4" />
      </div>
    </section>
  );
}

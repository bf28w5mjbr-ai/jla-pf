import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { Button } from "@/components/ui/button";

export function HomeClosingCtaSection() {
  const loginHref = "/login?redirect=%2F";
  const registerHref = "/register?redirect=%2F";

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:max-w-4xl sm:py-20 lg:max-w-5xl">
      <div className="rounded-3xl border border-border/90 bg-gradient-to-br from-card via-card to-muted/40 p-8 text-center shadow-sm sm:p-12">
        <HomeSectionHeading
          label="Get started"
          title="アカウントをお持ちの方"
          className="items-center text-center"
        />
        <p className="mx-auto mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          エントリーやクラブ参加、プロフィールの管理はログイン後にご利用いただけます。
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={registerHref}>
              新規登録
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href={loginHref}>ログイン</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

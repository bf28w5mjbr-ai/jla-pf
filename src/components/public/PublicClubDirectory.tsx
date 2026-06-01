"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search, Users } from "lucide-react";
import type { ClubPublicRecord } from "@/lib/clubPublicFields";
import { clubPublicLocationLabel, clubPublicTypeLabel } from "@/lib/clubPublicFields";
import { publicUploadDisplaySrc } from "@/lib/publicUploadSupabaseInfer";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  initialClubs: ClubPublicRecord[];
};

function ClubLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  const src = publicUploadDisplaySrc(logoUrl);
  const chars = [...name.trim()];
  const initialsLabel = chars.length >= 2 ? `${chars[0]}${chars[1]}` : (chars[0] ?? "?");

  if (!src || broken) {
    return (
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/40 text-xs font-semibold text-muted-foreground"
        aria-hidden
      >
        {initialsLabel}
      </div>
    );
  }
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/30 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element -- 任意オリジンのクラブロゴ */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain p-1"
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

export function PublicClubDirectory({ initialClubs }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialClubs;
    return initialClubs.filter((club) => {
      const haystack = [
        club.name,
        club.nameKana ?? "",
        club.abbreviation ?? "",
        club.patrolLocation ?? "",
        clubPublicLocationLabel(club),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [initialClubs, query]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="クラブ名・監視場所で検索"
          className="pl-9"
          aria-label="クラブを検索"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            条件に一致するクラブがありません。
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((club) => {
            const typeLabel = clubPublicTypeLabel(club);
            const location = clubPublicLocationLabel(club);
            return (
              <li key={club.id}>
                <Card className="h-full overflow-hidden border-border/80 shadow-sm transition hover:border-primary/25 hover:shadow-md">
                  <CardContent className="flex h-full gap-3 p-4">
                    <ClubLogo name={club.name} logoUrl={club.logoUrl} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <Link
                        href={`/clubs/view/${club.id}`}
                        className="text-sm font-semibold text-foreground hover:text-primary"
                      >
                        {club.name}
                      </Link>
                      {club.nameKana ? (
                        <p className="truncate text-xs text-muted-foreground">{club.nameKana}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {typeLabel ? (
                          <span className="inline-flex rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-foreground">
                            {typeLabel}
                          </span>
                        ) : null}
                      </div>
                      {club.patrolLocation ? (
                        <p className="flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          <span className="line-clamp-2">{club.patrolLocation}</span>
                        </p>
                      ) : location ? (
                        <p className="flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          <span>{location}</span>
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PublicClubDetailPanel({ club }: { club: ClubPublicRecord }) {
  const typeLabel = clubPublicTypeLabel(club);
  const location = clubPublicLocationLabel(club);
  const logoSrc = publicUploadDisplaySrc(club.logoUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {logoSrc ? (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/30 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" className="h-full w-full object-contain p-2" />
          </div>
        ) : (
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/40 text-lg font-semibold text-muted-foreground"
            aria-hidden
          >
            {club.name.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {club.name}
          </h1>
          {club.nameKana ? (
            <p className="text-sm text-muted-foreground">{club.nameKana}</p>
          ) : null}
          {club.abbreviation ? (
            <p className="text-xs text-muted-foreground">略称: {club.abbreviation}</p>
          ) : null}
          {typeLabel ? (
            <span className="inline-flex rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium">
              {typeLabel}
            </span>
          ) : null}
        </div>
      </div>

      <Card className="border-border/80">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {club.establishedYear ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">設立年</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{club.establishedYear}年</dd>
              </div>
            ) : null}
            {location ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">所在地（市区町村まで）</dt>
                <dd className="mt-0.5 font-medium">{location}</dd>
              </div>
            ) : null}
            {club.patrolLocation ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">監視場所</dt>
                <dd className="mt-0.5 font-medium leading-relaxed">{club.patrolLocation}</dd>
              </div>
            ) : null}
            {club.websiteUrl ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">公式サイト</dt>
                <dd className="mt-0.5">
                  <a
                    href={club.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {club.websiteUrl}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex gap-3">
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-foreground">クラブに参加する</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                参加申請・所属管理は会員登録後に行えます。
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href={`/login?redirect=${encodeURIComponent(`/clubs/${club.id}/join`)}`}>
              ログインして参加
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

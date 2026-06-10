"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CompetitionEditorialPanel,
  CompetitionSubheading,
} from "@/components/competitions/browse/competitionEditorialUi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";

export type PublicGalleryPhoto = {
  id: string;
  imageUrl: string;
  fileName: string | null;
};

type Props = {
  photos: PublicGalleryPhoto[];
  layout?: "classic" | "editorial";
};

function isAbsoluteImageUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

export default function CompetitionPublicGallery({ photos, layout = "classic" }: Props) {
  const isEditorial = layout === "editorial";
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const current = photos[index];
  const count = photos.length;

  const goPrev = useCallback(() => {
    setIndex((i) => (i <= 0 ? count - 1 : i - 1));
  }, [count]);

  const goNext = useCallback(() => {
    setIndex((i) => (i >= count - 1 ? 0 : i + 1));
  }, [count]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  if (count === 0) return null;

  const galleryGrid = (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border/60 bg-muted/15 outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setIndex(i);
                setOpen(true);
              }}
            >
              <Image
                src={p.imageUrl}
                alt={p.fileName || `写真 ${i + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                unoptimized={isAbsoluteImageUrl(p.imageUrl)}
              />
            </button>
          </li>
        ))}
      </ul>
      {!isEditorial ? (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          写真をタップすると拡大表示できます
        </p>
      ) : null}
    </>
  );

  return (
    <>
      {isEditorial ? (
        <CompetitionEditorialPanel accent="muted">
          <CompetitionSubheading>Gallery</CompetitionSubheading>
          <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground">
            <Images className="size-4 text-primary/80" aria-hidden />
            フォトギャラリー
          </h3>
          <div className="mt-4">{galleryGrid}</div>
        </CompetitionEditorialPanel>
      ) : (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/80 bg-muted/20 px-4 py-3 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <Images className="h-4 w-4 text-primary/80" aria-hidden />
              フォトギャラリー
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-5 sm:py-5">{galleryGrid}</CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[min(90vh,900px)] w-[min(96vw,900px)] max-w-none gap-0 overflow-hidden border-border/80 p-0"
          aria-describedby={undefined}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{current ? current.fileName || "ギャラリー写真" : "ギャラリー"}</DialogTitle>
          </DialogHeader>
          {current ? (
            <div className="relative flex max-h-[min(85vh,820px)] min-h-[200px] w-full items-center justify-center bg-black/90">
              <div className="relative h-full min-h-[240px] w-full">
                <Image
                  src={current.imageUrl}
                  alt={current.fileName || "ギャラリー写真"}
                  fill
                  className="object-contain p-2 sm:p-4"
                  sizes="100vw"
                  priority
                  unoptimized={isAbsoluteImageUrl(current.imageUrl)}
                />
              </div>
              {count > 1 ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border-0 bg-background/80 shadow-md backdrop-blur-sm hover:bg-background"
                    onClick={goPrev}
                    aria-label="前の写真"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border-0 bg-background/80 shadow-md backdrop-blur-sm hover:bg-background"
                    onClick={goNext}
                    aria-label="次の写真"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                  <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur-sm">
                    {index + 1} / {count}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

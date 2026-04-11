"use client";

import { Toaster } from "sonner";
import { useEffect, type ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    void import("@/lib/capacitor/init").then((m) => m.initCapacitorApp());
  }, []);

  return (
    <>
      {children}
      <Toaster
        richColors
        closeButton
        position="top-center"
        toastOptions={{
          classNames: {
            toast: "font-sans shadow-lg",
            title: "font-medium",
            description: "text-sm opacity-90",
          },
        }}
      />
    </>
  );
}

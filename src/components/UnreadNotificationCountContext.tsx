"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type UnreadNotificationCountContextValue = {
  unreadCount: number;
  setUnreadCount: (next: number | ((prev: number) => number)) => void;
};

const UnreadNotificationCountContext = createContext<UnreadNotificationCountContextValue | null>(null);

export function UnreadNotificationCountProvider({
  initialUnreadCount,
  children,
}: {
  initialUnreadCount: number;
  children: ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const value = useMemo(
    () => ({
      unreadCount,
      setUnreadCount,
    }),
    [unreadCount]
  );

  return (
    <UnreadNotificationCountContext.Provider value={value}>
      {children}
    </UnreadNotificationCountContext.Provider>
  );
}

export function useUnreadNotificationCount() {
  return useContext(UnreadNotificationCountContext);
}

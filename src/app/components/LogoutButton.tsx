"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded border px-3 py-1 text-sm hover:bg-gray-100"
    >
      ログアウト
    </button>
  );
}

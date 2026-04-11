import { redirect } from "next/navigation";
import { appRoutes } from "@/lib/appRoutes";

export const dynamic = "force-dynamic";

/** @deprecated `appRoutes.me.entries()` へ移行 */
export default function EntriesPageRedirect() {
  redirect(appRoutes.me.entries());
}

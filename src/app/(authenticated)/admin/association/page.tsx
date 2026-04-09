import { redirect } from "next/navigation";

/**
 * 旧 URL。アカウント管理へ統合。
 */
export default async function AssociationAdminLegacyRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) q.append(key, v);
    } else {
      q.set(key, value);
    }
  }
  const suffix = q.toString();
  redirect(suffix ? `/admin/account?${suffix}` : "/admin/account");
}

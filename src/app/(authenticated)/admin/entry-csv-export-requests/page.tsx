import { redirect } from "next/navigation";

/** 旧URL。アカウント管理の大会主催者タブへ。 */
export default function EntryCsvExportRequestsLegacyRedirectPage() {
  redirect("/admin/account?tab=host");
}

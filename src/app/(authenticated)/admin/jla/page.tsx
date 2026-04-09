import { redirect } from 'next/navigation';
export default function LegacyJlaAdminRedirectPage() {
  redirect("/admin/account");
}

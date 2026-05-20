import { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "クラブ承認 | Bluvium Admin",
};

/** @deprecated クラブ成立審査は廃止。PF のクラブ管理へリダイレクト */
export default function AdminClubApplicationsPage() {
  redirect("/admin/clubs");
}

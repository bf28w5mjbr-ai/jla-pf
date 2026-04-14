import { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "クラブ作成 | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function CreateClubPage() {
  notFound();
}

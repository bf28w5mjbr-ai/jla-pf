import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ organizationId?: string }>;
};

/** ブックマーク互換: org 配下の作成フローへ転送 */
export default async function CreateCompetitionRedirectPage({ searchParams }: PageProps) {
  const { organizationId } = await searchParams;

  if (organizationId) {
    redirect(`/organizations/${organizationId}/competitions/create`);
  }

  redirect("/dashboard");
}

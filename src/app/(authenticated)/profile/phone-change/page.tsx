import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import PhoneChangeForm from "./PhoneChangeForm";

export default async function PhoneChangePage() {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  if (!token) redirect("/login");

  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      contact: { select: { phoneNumber: true } },
      email: true,
      security: { select: { passwordHash: true } },
    },
  });

  if (!user) redirect("/login");

  const hasEmail = user.email && !user.email.includes("@temp.jla.local");
  const hasPassword = !!user.security?.passwordHash;
  const isSecure = hasEmail && hasPassword;

  // セキュリティ設定が完了していない場合はリダイレクト
  if (!isSecure) {
    redirect("/profile/security?from=phone-change");
  }

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">電話番号変更</h1>
      
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">⚠️ 重要な操作です</h3>
        <p className="text-sm text-amber-800 dark:text-amber-200">
          電話番号の変更は、ログインに影響する重要な操作です。
          本人確認のため、メールアドレスとパスワードでの認証を行います。
        </p>
      </div>

      <PhoneChangeForm currentPhone={user.contact?.phoneNumber ?? ""} />
    </div>
  );
}

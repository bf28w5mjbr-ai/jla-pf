import { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";
import PageLayout from '@/components/ui/PageLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import AccountDangerZone from '@/components/AccountDangerZone';
import ProfilePhotoUpload from '@/components/ProfilePhotoUpload';

export const metadata: Metadata = {
  title: '設定 | JLA PF',
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      familyName: true,
      givenName: true,
      familyNameKana: true,
      givenNameKana: true,
      phoneNumber: true,
      role: true,
      dateOfBirth: true,
      sex: true,
      postalCode: true,
      prefecture: true,
      city: true,
      addressLine1: true,
      addressLine2: true,
      jlaMemberNumber: true,
      profilePhotoUrl: true,
      createdAt: true,
    }
  });

  if (!user) redirect("/login");

  const isSecure = true; // メールアドレスとパスワードは登録時に必須

  return (
    <PageLayout title="設定" description="アカウントとセキュリティの設定を管理">
      <div className="space-y-6">
        {/* プロフィール写真 */}
        <Card>
          <CardHeader>
            <CardTitle>プロフィール写真</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfilePhotoUpload 
              currentPhotoUrl={user.profilePhotoUrl}
              userName={`${user.familyName}${user.givenName}`}
            />
          </CardContent>
        </Card>

        {/* セキュリティ */}
        <Card>
          <CardHeader>
            <CardTitle>セキュリティ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* セキュリティ状態 */}
              <div className="flex items-start gap-4 pb-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                  <span className="text-3xl">✓</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    アカウントは保護されています
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    メールアドレスとパスワードが設定済みです。電話番号が使えなくなってもアカウントにアクセスできます。
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 px-4 py-3 rounded-md border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                      <span className="text-xl">✓</span>
                      <span className="text-sm font-medium text-green-800 dark:text-green-400">
                        メールアドレス
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-3 rounded-md border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                      <span className="text-xl">✓</span>
                      <span className="text-sm font-medium text-green-800 dark:text-green-400">
                        パスワード
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* セキュリティ設定リンク */}
              <div className="space-y-3">
                <a
                  href="/profile/security"
                  className="flex items-center justify-between p-4 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#2f2f2f] transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <span className="text-xl">📧</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">メールアドレスとパスワード</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        メール・パスワード設定済み
                      </p>
                    </div>
                  </div>
                  <span className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">→</span>
                </a>

                <a
                  href="/profile/phone-change"
                  className="flex items-center justify-between p-4 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#2f2f2f] transition-colors group"
                >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <span className="text-xl">📱</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">電話番号変更</h3>
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                          現在: {user.phoneNumber}
                        </p>
                      </div>
                    </div>
                    <span className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">→</span>
                  </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 個人情報 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>個人情報</CardTitle>
            <Link
              href="/settings/edit-profile"
              className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              編集
            </Link>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 基本情報 */}
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">氏名</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {user.familyName} {user.givenName}
                </dd>
                <dd className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {user.familyNameKana} {user.givenNameKana}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">生年月日</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {new Date(user.dateOfBirth).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">性別</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {user.sex === 'MALE' ? '男性' : user.sex === 'FEMALE' ? '女性' : 'その他'}
                </dd>
              </div>
              {user.jlaMemberNumber && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">JLA会員番号</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">
                    {user.jlaMemberNumber}
                  </dd>
                </div>
              )}
              
              {/* アカウント情報 */}
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">メールアドレス</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
                  {user.email}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">電話番号</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">
                  {user.phoneNumber}
                </dd>
              </div>
              
              {/* 住所情報 */}
              {user.postalCode && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">郵便番号</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">
                    〒{user.postalCode}
                  </dd>
                </div>
              )}
              {(user.prefecture || user.city || user.addressLine1) && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">住所</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {user.prefecture}{user.city}{user.addressLine1}
                    {user.addressLine2 && (
                      <>
                        <br />
                        {user.addressLine2}
                      </>
                    )}
                  </dd>
                </div>
              )}
              
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">ユーザーID</dt>
                <dd className="text-xs font-mono text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-[#1f1f1f] px-3 py-2 rounded-md break-all">
                  {user.id}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">登録日</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {new Date(user.createdAt).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* 危険な操作 */}
        {isSecure && (
          <AccountDangerZone />
        )}
      </div>
    </PageLayout>
  );
}

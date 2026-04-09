import { redirect } from 'next/navigation';

export default async function ProfilePage() {
  // プロフィールページはダッシュボードに統合されました
  redirect('/dashboard');
}

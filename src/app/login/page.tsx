import { Metadata } from 'next';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'ログイン | JLA PF',
  description: 'JLA PFにログイン',
};

export default function LoginPage() {
  return <LoginForm />;
}

import { AccountView } from '@neondatabase/auth/react';
import { Header } from '@/components/layout/header';

export const dynamicParams = false;

export default async function AccountPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return (
    <>
      <Header title="Settings" />
      <div className="p-6 lg:p-8">
        <AccountView path={path} />
      </div>
    </>
  );
}

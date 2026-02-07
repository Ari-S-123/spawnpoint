import { AccountView } from '@neondatabase/auth/react';

export const dynamicParams = false;

export default async function AccountPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-3 p-4 md:p-6">
      <AccountView path={path} />
    </main>
  );
}

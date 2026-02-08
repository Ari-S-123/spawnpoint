import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';
import { Header } from '@/components/layout/header';
import { ActionsPanel } from '@/components/agents/actions-panel';

export default async function ActionsPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <Header breadcrumbs={[{ label: 'Actions' }]} />
      <div className="flex-1 overflow-hidden">
        <ActionsPanel />
      </div>
    </div>
  );
}

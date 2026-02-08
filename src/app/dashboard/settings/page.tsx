import { AccountView } from '@neondatabase/auth/react';
import { Header } from '@/components/layout/header';

export default function SettingsPage() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Settings' }]} />
      <div className="flex flex-1 flex-col items-center p-6">
        <div className="w-full max-w-lg">
          <AccountView path="settings" />
        </div>
      </div>
    </>
  );
}

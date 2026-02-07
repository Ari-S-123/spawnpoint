import { redirect } from 'next/navigation';

export const dynamicParams = false;

export default async function AccountRedirect({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  redirect(`/dashboard/account/${path}`);
}

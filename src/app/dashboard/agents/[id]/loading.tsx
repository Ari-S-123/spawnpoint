import { Skeleton } from '@/components/ui/skeleton';

export default function AgentDetailLoading() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-32" />
      </div>
      <Skeleton className="mb-6 h-10 w-96" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}

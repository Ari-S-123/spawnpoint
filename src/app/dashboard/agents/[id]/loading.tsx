import { Skeleton } from '@/components/ui/skeleton';

export default function AgentDetailLoading() {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-6">
        <Skeleton className="h-7 w-7 rounded" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="p-6">
        {/* Overview panel skeleton */}
        <Skeleton className="mb-8 h-[180px] w-full rounded-xl" />

        {/* Tab bar skeleton */}
        <Skeleton className="mb-6 h-10 w-96 rounded-lg" />

        {/* Status grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    </>
  );
}

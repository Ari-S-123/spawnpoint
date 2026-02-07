import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-6">
        <Skeleton className="h-7 w-7 rounded" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex flex-col gap-8 p-6">
        <Skeleton className="h-[140px] w-full rounded-xl" />

        <div>
          <Skeleton className="mb-1 h-5 w-28" />
          <Skeleton className="mb-4 h-4 w-36" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[140px] w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

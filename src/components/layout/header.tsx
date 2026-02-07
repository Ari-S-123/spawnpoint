import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

export function Header({ title }: { title?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
      <SidebarTrigger className="-ml-2" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {title && <h1 className="text-sm font-medium text-muted-foreground">{title}</h1>}
    </header>
  );
}

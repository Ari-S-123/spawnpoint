import Link from 'next/link';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

type Breadcrumb = {
  label: string;
  href?: string;
};

export function Header({ breadcrumbs = [] }: { breadcrumbs?: Breadcrumb[] }) {
  const backHref = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2]?.href : undefined;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-6">
      <SidebarTrigger className="-ml-2" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      {backHref && (
        <Button
          variant="ghost"
          size="icon"
          className="mr-1 h-7 w-7 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href={backHref}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </Button>
      )}

      <nav className="flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
            {crumb.href && i < breadcrumbs.length - 1 ? (
              <Link href={crumb.href} className="text-muted-foreground transition-colors hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span className={i === breadcrumbs.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                {crumb.label}
              </span>
            )}
          </div>
        ))}
      </nav>
    </header>
  );
}

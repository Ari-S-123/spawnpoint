'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Plus, Settings } from 'lucide-react';
import { UserButton } from '@neondatabase/auth/react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';

const navItems = [
  { title: 'Agents', href: '/dashboard', icon: Bot },
  { title: 'Create Agent', href: '/dashboard?create=true', icon: Plus },
  { title: 'Settings', href: '/dashboard/account/settings', icon: Settings }
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-zinc-800/50 px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span
            className="text-xl font-light tracking-tight text-zinc-100"
            style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
          >
            Spawn<span className="text-amber-400">Point</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium tracking-[0.2em] text-amber-400/50 uppercase">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const hrefBase = item.href.split('?')[0] ?? item.href;
                const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(hrefBase);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={cn(isActive && 'bg-amber-500/10 text-amber-300')}
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="relative border-t border-zinc-800/50 p-4">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
        <UserButton disableDefaultLinks />
      </SidebarFooter>
    </Sidebar>
  );
}

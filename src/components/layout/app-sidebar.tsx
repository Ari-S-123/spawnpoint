'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Settings } from 'lucide-react';
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
  { title: 'Agents', href: '/dashboard', icon: Bot, matchPrefix: '/dashboard' },
  { title: 'Settings', href: '/dashboard/settings', icon: Settings, matchPrefix: '/dashboard/settings' }
];

export function AppSidebar() {
  const pathname = usePathname();

  function isActive(item: (typeof navItems)[0]) {
    if (item.href === '/dashboard') {
      return pathname === '/dashboard' || pathname.startsWith('/dashboard/agents');
    }
    return pathname.startsWith(item.matchPrefix);
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-zinc-800/50 px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400">
            <Bot className="h-4 w-4" />
          </div>
          <span
            className="text-lg font-light tracking-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
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
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item)}
                    className={cn(isActive(item) && 'bg-amber-500/10 text-amber-300')}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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

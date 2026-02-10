import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, CalendarPlus, ListMusic, LogOut, Drum, Settings, Wallet } from "lucide-react";
import { useMemo } from "react";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isAdmin, isMember } = useAuth();

  const navItems = useMemo(() => {
    if (isMember) {
      const items = [
        { title: "Dashboard", url: "/", icon: LayoutDashboard },
        { title: "Shows", url: "/shows", icon: ListMusic },
      ];
      if (user?.canAddShows) {
        items.push({ title: "Add Show", url: "/shows/new", icon: CalendarPlus });
      }
      items.push({ title: "Financials", url: "/financials", icon: Wallet });
      return items;
    }
    return [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Shows", url: "/shows", icon: ListMusic },
      { title: "Add Show", url: "/shows/new", icon: CalendarPlus },
      { title: "Financials", url: "/financials", icon: Wallet },
      { title: "Settings", url: "/settings", icon: Settings },
    ];
  }, [isAdmin, isMember, user?.canAddShows]);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <Drum className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" data-testid="text-sidebar-brand">
              Drum Circle PK
            </p>
            <p className="text-xs text-muted-foreground truncate">Management</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.url === "/"
                    ? location === "/"
                    : location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
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

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {user?.displayName?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-user-name">
              {user?.displayName || "User"}
            </p>
            <p className="text-xs text-muted-foreground truncate capitalize">
              {user?.role === "founder" ? "Admin" : "Member"}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            data-testid="button-logout"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

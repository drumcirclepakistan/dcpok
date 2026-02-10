import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LayoutDashboard, CalendarPlus, ListMusic, LogOut, Drum, Settings, Wallet, BookOpen, Pencil, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, isAdmin, isMember, refreshUser } = useAuth();
  const { toast } = useToast();
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const nameUpdateMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("PATCH", "/api/member/name", { name });
    },
    onSuccess: () => {
      toast({ title: "Name updated", description: "Your display name has been changed." });
      setNameDialogOpen(false);
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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
      { title: "Directory", url: "/directory", icon: BookOpen },
      { title: "Financials", url: "/financials", icon: Wallet },
      { title: "Settings", url: "/settings", icon: Settings },
    ];
  }, [isAdmin, isMember, user?.canAddShows]);

  const handleOpenNameDialog = () => {
    setNewName(user?.displayName || "");
    setNameDialogOpen(true);
  };

  const handleSaveName = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    nameUpdateMutation.mutate(trimmed);
  };

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
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium truncate" data-testid="text-user-name">
                {user?.displayName || "User"}
              </p>
              {isMember && user?.canEditName && (
                <button
                  onClick={handleOpenNameDialog}
                  className="flex-shrink-0 text-muted-foreground hover-elevate rounded-md p-0.5"
                  data-testid="button-edit-name"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
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

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Display Name</DialogTitle>
            <DialogDescription>
              Update your display name. This will be reflected across all your shows and records.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter your name"
              data-testid="input-new-name"
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)} data-testid="button-cancel-name">
              Cancel
            </Button>
            <Button
              onClick={handleSaveName}
              disabled={nameUpdateMutation.isPending || !newName.trim()}
              data-testid="button-save-name"
            >
              {nameUpdateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}

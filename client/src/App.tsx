import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { NotificationBell } from "@/components/notification-bell";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import ShowsPage from "@/pages/shows";
import ShowForm from "@/pages/show-form";
import ShowDetail from "@/pages/show-detail";
import SettingsPage from "@/pages/settings";
import FinancialsPage from "@/pages/financials";
import DirectoryPage from "@/pages/directory";
import PolicyPage from "@/pages/policy";
import ActivityLogPage from "@/pages/activity-log";
import MemberSettingsPage from "@/pages/member-settings";

import { Redirect } from "wouter";

function AdminOnly({ component: Component }: { component: React.ComponentType }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Redirect to="/" />;
  return <Component />;
}

function MemberOnly({ component: Component }: { component: React.ComponentType }) {
  const { isMember } = useAuth();
  if (!isMember) return <Redirect to="/" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/shows" component={ShowsPage} />
      <Route path="/shows/new" component={ShowForm} />
      <Route path="/shows/:id/edit">{() => <AdminOnly component={ShowForm} />}</Route>
      <Route path="/shows/:id">{() => <AdminOnly component={ShowDetail} />}</Route>
      <Route path="/directory">{() => <AdminOnly component={DirectoryPage} />}</Route>
      <Route path="/financials" component={FinancialsPage} />
      <Route path="/policy">{() => <MemberOnly component={PolicyPage} />}</Route>
      <Route path="/settings">{() => <AdminOnly component={SettingsPage} />}</Route>
      <Route path="/account" component={MemberSettingsPage} />
      <Route path="/activity-log">{() => <AdminOnly component={ActivityLogPage} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 z-50 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>
          <PullToRefresh>
            <Router />
          </PullToRefresh>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <Skeleton className="w-16 h-16 rounded-full mx-auto" />
          <Skeleton className="h-5 w-40 mx-auto" />
          <Skeleton className="h-4 w-24 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AppLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

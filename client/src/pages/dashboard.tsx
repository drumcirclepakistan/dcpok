import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  CalendarDays, TrendingUp, Music, MapPin, Layers,
  Wallet, Receipt, Crown, AlertCircle,
} from "lucide-react";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, subMonths, subYears } from "date-fns";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import type { Show } from "@shared/schema";

type TimeRange = "lifetime" | "this_year" | "last_year" | "this_month" | "last_month" | "last_3_months" | "last_6_months" | "custom";

interface DashboardStats {
  totalShows: number;
  totalRevenue: number;
  totalExpenses: number;
  revenueAfterExpenses: number;
  founderRevenue: number;
  upcomingCount: number;
  pendingAmount: number;
  topCities: { city: string; count: number }[];
  topTypes: { type: string; count: number }[];
}

function getDateRange(range: TimeRange, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  switch (range) {
    case "lifetime":
      return {};
    case "this_year":
      return { from: startOfYear(now).toISOString(), to: endOfYear(now).toISOString() };
    case "last_year": {
      const ly = subYears(now, 1);
      return { from: startOfYear(ly).toISOString(), to: endOfYear(ly).toISOString() };
    }
    case "this_month":
      return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm).toISOString(), to: endOfMonth(lm).toISOString() };
    }
    case "last_3_months":
      return { from: subMonths(now, 3).toISOString(), to: now.toISOString() };
    case "last_6_months":
      return { from: subMonths(now, 6).toISOString(), to: now.toISOString() };
    case "custom":
      return {
        from: customFrom ? new Date(customFrom).toISOString() : undefined,
        to: customTo ? new Date(customTo + "T23:59:59").toISOString() : undefined,
      };
    default:
      return {};
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  testId,
  variant,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  testId: string;
  variant?: "default" | "highlight";
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold mt-1 ${variant === "highlight" ? "text-primary" : ""}`} data-testid={testId}>
              {value}
            </p>
          </div>
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
          <Skeleton className="w-9 h-9 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

const showTypeBadgeVariant = (type: string) => {
  switch (type) {
    case "Corporate": return "default";
    case "University": return "secondary";
    case "Private": return "outline";
    case "Public": return "secondary";
    default: return "outline";
  }
};

const timeRangeLabels: Record<TimeRange, string> = {
  lifetime: "Lifetime",
  this_year: "This Year",
  last_year: "Last Year",
  this_month: "This Month",
  last_month: "Last Month",
  last_3_months: "Last 3 Months",
  last_6_months: "Last 6 Months",
  custom: "Custom Range",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>("lifetime");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const dateRange = useMemo(() => getDateRange(timeRange, customFrom, customTo), [timeRange, customFrom, customTo]);

  const statsQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    const qs = params.toString();
    return `/api/dashboard/stats${qs ? `?${qs}` : ""}`;
  }, [dateRange]);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats", dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await fetch(statsQueryKey, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });

  const { data: shows } = useQuery<Show[]>({
    queryKey: ["/api/shows"],
  });

  const upcomingShows = shows?.filter((s) => s.status === "upcoming") || [];
  const nextShows = upcomingShows
    .sort((a, b) => new Date(a.showDate).getTime() - new Date(b.showDate).getTime())
    .slice(0, 5);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-welcome">
            Welcome back, {user?.displayName || "Founder"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Here's what's happening with Drum Circle Pakistan
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[160px]" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(timeRangeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {timeRange === "custom" && (
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">From</label>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              data-testid="input-custom-from"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">To</label>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              data-testid="input-custom-to"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4, 5, 6].map((i) => <StatSkeleton key={i} />)}
          </>
        ) : (
          <>
            <StatCard
              label="Total Shows"
              value={stats?.totalShows || 0}
              icon={Music}
              testId="stat-total-shows"
            />
            <StatCard
              label="Total Revenue"
              value={`Rs ${(stats?.totalRevenue || 0).toLocaleString()}`}
              icon={TrendingUp}
              testId="stat-revenue"
            />
            <StatCard
              label="Revenue After Expenses"
              value={`Rs ${(stats?.revenueAfterExpenses || 0).toLocaleString()}`}
              icon={Receipt}
              testId="stat-revenue-after-expenses"
            />
            <StatCard
              label="My Earnings (Founder)"
              value={`Rs ${(stats?.founderRevenue || 0).toLocaleString()}`}
              icon={Crown}
              testId="stat-founder-revenue"
              variant="highlight"
            />
            <StatCard
              label="Upcoming Shows"
              value={stats?.upcomingCount || 0}
              icon={CalendarDays}
              testId="stat-upcoming"
            />
            <StatCard
              label="Pending Payments"
              value={`Rs ${(stats?.pendingAmount || 0).toLocaleString()}`}
              icon={Wallet}
              testId="stat-pending"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-5 pb-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              Top Cities
            </h3>
            {statsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (stats?.topCities?.length || 0) === 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="text-no-cities">No data for selected range</p>
            ) : (
              <div className="space-y-2">
                {stats?.topCities.map((c, i) => (
                  <div key={c.city} className="flex items-center justify-between gap-2" data-testid={`city-row-${i}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      <span className="text-sm truncate">{c.city}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] flex-shrink-0">{c.count} show{c.count !== 1 ? "s" : ""}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-muted-foreground" />
              Show Types
            </h3>
            {statsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (stats?.topTypes?.length || 0) === 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="text-no-types">No data for selected range</p>
            ) : (
              <div className="space-y-2">
                {stats?.topTypes.map((t, i) => (
                  <div key={t.type} className="flex items-center justify-between gap-2" data-testid={`type-row-${i}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={showTypeBadgeVariant(t.type) as any} className="text-[10px]">{t.type}</Badge>
                    </div>
                    <span className="text-sm font-semibold flex-shrink-0">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="text-base font-semibold">Upcoming Shows</h2>
          <Link href="/shows">
            <span className="text-sm text-primary font-medium cursor-pointer" data-testid="link-view-all-shows">
              View all
            </span>
          </Link>
        </div>

        {!shows ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-4 pb-4">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : nextShows.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-8 flex flex-col items-center justify-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground" data-testid="text-no-upcoming">
                No upcoming shows scheduled
              </p>
              <Link href="/shows/new">
                <span className="text-sm text-primary font-medium mt-2 cursor-pointer" data-testid="link-add-first-show">
                  Add your first show
                </span>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {nextShows.map((show) => (
              <Link key={show.id} href={`/shows/${show.id}`}>
                <Card className="hover-elevate cursor-pointer" data-testid={`card-show-${show.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate" data-testid={`text-show-title-${show.id}`}>
                            {show.title}
                          </p>
                          {!show.isPaid && (
                            <Badge variant="destructive" className="text-[10px]">
                              <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                              Unpaid
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {show.city}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(show.showDate), "MMM d, yyyy")}
                          </span>
                        </div>
                        {show.organizationName && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {show.organizationName}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <Badge variant={showTypeBadgeVariant(show.showType) as any}>
                          {show.showType}
                        </Badge>
                        <span className="text-sm font-semibold" data-testid={`text-show-amount-${show.id}`}>
                          Rs {show.totalAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

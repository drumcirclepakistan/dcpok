import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/lib/auth";
import {
  CalendarDays, TrendingUp, Music, MapPin, Layers,
  Wallet, Receipt, Crown, AlertCircle, AlertTriangle, Calendar as CalendarIcon,
  CheckCircle, UserCheck,
} from "lucide-react";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, subMonths, subYears, endOfDay } from "date-fns";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import type { Show } from "@shared/schema";

interface CustomDateRange {
  from?: Date;
  to?: Date;
}

type TimeRange = "lifetime" | "this_year" | "last_year" | "this_month" | "last_month" | "last_3_months" | "last_6_months" | "custom";

interface DashboardStats {
  totalShows: number;
  totalRevenue: number;
  totalExpenses: number;
  revenueAfterExpenses: number;
  founderRevenue: number;
  upcomingCount: number;
  pendingAmount: number;
  noAdvanceCount: number;
  topCities: { city: string; count: number }[];
  topTypes: { type: string; count: number }[];
}

interface MemberDashboardShow extends Show {
  isReferrer?: boolean;
  myEarning?: number;
}

interface MemberDashboardStats {
  totalEarnings: number;
  showsPerformed: number;
  upcomingCount: number;
  pendingPayments: number;
  referredCount: number;
  topCities: { city: string; count: number }[];
  topTypes: { type: string; count: number }[];
  upcomingShows: MemberDashboardShow[];
  completedShows: MemberDashboardShow[];
}

function getDateRange(range: TimeRange, customRange: CustomDateRange | undefined): { from?: string; to?: string } {
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
        from: customRange?.from ? customRange.from.toISOString() : undefined,
        to: customRange?.to ? endOfDay(customRange.to).toISOString() : undefined,
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
  variant?: "default" | "highlight" | "warning";
}) {
  const iconBg = variant === "warning" ? "bg-orange-500/10" : "bg-primary/10";
  const iconColor = variant === "warning" ? "text-orange-500" : "text-primary";
  const valueColor = variant === "highlight" ? "text-primary" : variant === "warning" ? "text-orange-600 dark:text-orange-400" : "";
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold mt-1 ${valueColor}`} data-testid={testId}>
              {value}
            </p>
          </div>
          <div className={`w-9 h-9 rounded-md ${iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
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

const showTypeBadgeVariant = (_type: string) => "secondary";

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
  const { user, isMember } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>("lifetime");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>();

  const dateRange = useMemo(() => getDateRange(timeRange, customRange), [timeRange, customRange]);

  const statsQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    const qs = params.toString();
    const basePath = isMember ? "/api/member/dashboard" : "/api/dashboard/stats";
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }, [dateRange, isMember]);

  const { data: adminStats, isLoading: adminStatsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats", dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await fetch(statsQueryKey, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    enabled: !isMember,
  });

  const { data: memberStats, isLoading: memberStatsLoading } = useQuery<MemberDashboardStats>({
    queryKey: ["/api/member/dashboard", dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await fetch(statsQueryKey, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    enabled: isMember,
  });

  const statsLoading = isMember ? memberStatsLoading : adminStatsLoading;

  const { data: shows } = useQuery<Show[]>({
    queryKey: ["/api/shows"],
    enabled: !isMember,
  });

  const upcomingShows = shows?.filter((s) => s.status === "upcoming") || [];
  const nextShows = upcomingShows
    .sort((a, b) => new Date(a.showDate).getTime() - new Date(b.showDate).getTime())
    .slice(0, 5);

  const memberUpcoming = memberStats?.upcomingShows || [];
  const memberCompleted = memberStats?.completedShows || [];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-welcome">
            Welcome back, {user?.displayName || "Haider Jamil"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isMember
              ? "Here's your performance overview"
              : "Here's what's happening with Drum Circle Pakistan"}
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
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start text-left font-normal" data-testid="button-custom-range">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {customRange?.from ? (
                customRange.to ? (
                  <span>{format(customRange.from, "MMM d, yyyy")} - {format(customRange.to, "MMM d, yyyy")}</span>
                ) : (
                  <span>{format(customRange.from, "MMM d, yyyy")} - Pick end date</span>
                )
              ) : (
                <span className="text-muted-foreground">Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={customRange as any}
              onSelect={(range: any) => setCustomRange(range)}
              numberOfMonths={2}
              data-testid="calendar-range-picker"
            />
          </PopoverContent>
        </Popover>
      )}

      {isMember ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statsLoading ? (
              <>
                {[1, 2, 3, 4].map((i) => <StatSkeleton key={i} />)}
              </>
            ) : (
              <>
                <StatCard
                  label="Total Earnings"
                  value={`Rs ${(memberStats?.totalEarnings || 0).toLocaleString()}`}
                  icon={Crown}
                  testId="stat-total-earnings"
                  variant="highlight"
                />
                <StatCard
                  label="Shows Performed"
                  value={memberStats?.showsPerformed || 0}
                  icon={Music}
                  testId="stat-shows-performed"
                />
                <StatCard
                  label="Upcoming Shows"
                  value={memberStats?.upcomingCount || 0}
                  icon={CalendarDays}
                  testId="stat-upcoming"
                />
                <StatCard
                  label="Pending Payments"
                  value={`Rs ${(memberStats?.pendingPayments || 0).toLocaleString()}`}
                  icon={Wallet}
                  testId="stat-pending-payments"
                />
                {(memberStats?.referredCount || 0) > 0 && (
                  <StatCard
                    label="Shows Referred"
                    value={memberStats?.referredCount || 0}
                    icon={UserCheck}
                    testId="stat-referred-shows"
                  />
                )}
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
                ) : (memberStats?.topCities?.length || 0) === 0 ? (
                  <p className="text-xs text-muted-foreground" data-testid="text-no-cities">No data for selected range</p>
                ) : (
                  <div className="space-y-2">
                    {memberStats?.topCities.map((c, i) => (
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
                ) : (memberStats?.topTypes?.length || 0) === 0 ? (
                  <p className="text-xs text-muted-foreground" data-testid="text-no-types">No data for selected range</p>
                ) : (
                  <div className="space-y-2">
                    {memberStats?.topTypes.map((t, i) => (
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
            </div>
            <p className="text-xs text-muted-foreground mb-2" data-testid="text-estimated-note">
              *Estimated, expenses not accounted yet, actual amount may vary
            </p>

            {statsLoading ? (
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
            ) : memberUpcoming.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 flex flex-col items-center justify-center">
                  <CalendarDays className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-upcoming">
                    No upcoming shows assigned
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {memberUpcoming.map((show) => (
                  <Card key={show.id} data-testid={`card-upcoming-show-${show.id}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate" data-testid={`text-upcoming-show-title-${show.id}`}>
                              {show.title}
                            </p>
                            {show.isReferrer && (
                              <Badge variant="outline" className="text-[10px] text-primary">
                                <UserCheck className="w-2.5 h-2.5 mr-0.5" />
                                Referred by you
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
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <Badge variant={showTypeBadgeVariant(show.showType) as any}>
                            {show.showType}
                          </Badge>
                          {user?.canViewAmounts && show.totalAmount != null && (
                            <span className="text-sm font-semibold" data-testid={`text-upcoming-show-amount-${show.id}`}>
                              Rs {show.totalAmount.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <h2 className="text-base font-semibold">Completed Shows</h2>
            </div>

            {statsLoading ? (
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
            ) : memberCompleted.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 flex flex-col items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-completed">
                    No completed shows yet
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {memberCompleted.map((show) => (
                  <Card key={show.id} data-testid={`card-completed-show-${show.id}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate" data-testid={`text-completed-show-title-${show.id}`}>
                              {show.title}
                            </p>
                            {show.isReferrer && (
                              <Badge variant="outline" className="text-[10px] text-primary">
                                <UserCheck className="w-2.5 h-2.5 mr-0.5" />
                                Referred by you
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
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <Badge variant={showTypeBadgeVariant(show.showType) as any}>
                            {show.showType}
                          </Badge>
                          {user?.canViewAmounts && show.totalAmount != null && (
                            <span className="text-sm font-semibold" data-testid={`text-completed-show-amount-${show.id}`}>
                              Rs {show.totalAmount.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {statsLoading ? (
              <>
                {[1, 2, 3, 4, 5, 6].map((i) => <StatSkeleton key={i} />)}
              </>
            ) : (
              <>
                <StatCard
                  label="Total Shows"
                  value={adminStats?.totalShows || 0}
                  icon={Music}
                  testId="stat-total-shows"
                />
                <StatCard
                  label="Total Revenue"
                  value={`Rs ${(adminStats?.totalRevenue || 0).toLocaleString()}`}
                  icon={TrendingUp}
                  testId="stat-revenue"
                />
                <StatCard
                  label="Revenue After Expenses"
                  value={`Rs ${(adminStats?.revenueAfterExpenses || 0).toLocaleString()}`}
                  icon={Receipt}
                  testId="stat-revenue-after-expenses"
                />
                <StatCard
                  label="My Earnings"
                  value={`Rs ${(adminStats?.founderRevenue || 0).toLocaleString()}`}
                  icon={Crown}
                  testId="stat-founder-revenue"
                  variant="highlight"
                />
                <StatCard
                  label="Upcoming Shows"
                  value={adminStats?.upcomingCount || 0}
                  icon={CalendarDays}
                  testId="stat-upcoming"
                />
                <StatCard
                  label="Pending Payments"
                  value={`Rs ${(adminStats?.pendingAmount || 0).toLocaleString()}`}
                  icon={Wallet}
                  testId="stat-pending"
                />
                {(adminStats?.noAdvanceCount || 0) > 0 && (
                  <StatCard
                    label="No Advance Received"
                    value={adminStats?.noAdvanceCount || 0}
                    icon={AlertTriangle}
                    testId="stat-no-advance"
                    variant="warning"
                  />
                )}
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
                ) : (adminStats?.topCities?.length || 0) === 0 ? (
                  <p className="text-xs text-muted-foreground" data-testid="text-no-cities">No data for selected range</p>
                ) : (
                  <div className="space-y-2">
                    {adminStats?.topCities.map((c, i) => (
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
                ) : (adminStats?.topTypes?.length || 0) === 0 ? (
                  <p className="text-xs text-muted-foreground" data-testid="text-no-types">No data for selected range</p>
                ) : (
                  <div className="space-y-2">
                    {adminStats?.topTypes.map((t, i) => (
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
                              {show.advancePayment === 0 && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                  <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                                  Advance not paid
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
                            {(show.organizationName || show.publicShowFor) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {show.organizationName || show.publicShowFor}
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
        </>
      )}
    </div>
  );
}

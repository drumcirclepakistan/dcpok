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
import {
  TrendingUp, Wallet, MapPin, Music, Calendar as CalendarIcon,
  BarChart3, CheckCircle, AlertCircle, ArrowUpRight, UserCheck,
} from "lucide-react";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, subMonths, subYears, endOfDay } from "date-fns";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";

type TimeRange = "lifetime" | "this_year" | "last_year" | "this_month" | "last_month" | "last_3_months" | "last_6_months" | "custom";

interface CustomDateRange {
  from?: Date;
  to?: Date;
}

interface FinancialShow {
  id: string;
  title: string;
  city: string;
  showDate: string;
  showType: string;
  totalAmount: number;
  memberEarning: number;
  isPaid: boolean;
  isReferrer?: boolean;
}

interface FinancialStats {
  member: string;
  totalEarnings: number;
  totalShows: number;
  avgPerShow: number;
  paidShows: number;
  unpaidShows: number;
  unpaidAmount: number;
  pendingAmount: number;
  upcomingShowsCount: number;
  referredCount?: number;
  cities: { city: string; count: number }[];
  shows: FinancialShow[];
  upcomingShows: FinancialShow[];
}

interface BandMemberInfo {
  id: string;
  name: string;
}

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

const showTypeBadgeVariant = (type: string) => {
  switch (type) {
    case "Corporate": return "default";
    case "University": return "secondary";
    case "Private": return "outline";
    case "Public": return "secondary";
    default: return "outline";
  }
};

export default function FinancialsPage() {
  const { isAdmin, isMember, user } = useAuth();
  const [selectedMember, setSelectedMember] = useState("Haider Jamil");
  const [timeRange, setTimeRange] = useState<TimeRange>("lifetime");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>();

  const { data: bandMembers = [] } = useQuery<BandMemberInfo[]>({
    queryKey: ["/api/band-members"],
    enabled: isAdmin,
  });

  const memberNames = useMemo(() => {
    const names = ["Haider Jamil", ...bandMembers.map((m) => m.name)];
    return Array.from(new Set(names));
  }, [bandMembers]);

  const dateRange = useMemo(() => getDateRange(timeRange, customRange), [timeRange, customRange]);

  const adminQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("member", selectedMember);
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    return `/api/financials?${params.toString()}`;
  }, [selectedMember, dateRange]);

  const memberQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    return `/api/member/financials?${params.toString()}`;
  }, [dateRange]);

  const { data: stats, isLoading } = useQuery<FinancialStats>({
    queryKey: isMember
      ? ["/api/member/financials", dateRange.from, dateRange.to]
      : ["/api/financials", selectedMember, dateRange.from, dateRange.to],
    queryFn: async () => {
      const url = isMember ? memberQueryUrl : adminQueryUrl;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load financials");
      return res.json();
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-financials-heading">
          {isMember ? "My Financials" : "Financials"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isMember ? "Your earnings and performance breakdown" : "Detailed earnings and performance breakdown"}
        </p>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        {isAdmin && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Member</label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="w-[160px]" data-testid="select-member">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {memberNames.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Period</label>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[160px]" data-testid="select-financial-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(timeRangeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {timeRange === "custom" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal" data-testid="button-financial-custom-range">
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
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="pt-5 pb-5">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-7 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card><CardContent className="pt-5 pb-5"><Skeleton className="h-32 w-full" /></CardContent></Card>
            <Card><CardContent className="pt-5 pb-5"><Skeleton className="h-32 w-full" /></CardContent></Card>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-5 pb-5">
                <p className="text-xs text-muted-foreground">Total Earnings (Paid)</p>
                <p className="text-xl font-bold mt-1 text-primary" data-testid="stat-total-earnings">
                  Rs {(stats?.totalEarnings || 0).toLocaleString()}
                </p>
                {(stats?.paidShows || 0) > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    from {stats?.paidShows} paid show{stats?.paidShows !== 1 ? "s" : ""}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5">
                <p className="text-xs text-muted-foreground">Shows Performed</p>
                <p className="text-xl font-bold mt-1" data-testid="stat-total-shows-financial">
                  {stats?.totalShows || 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5">
                <p className="text-xs text-muted-foreground">Avg Per Show</p>
                <p className="text-xl font-bold mt-1" data-testid="stat-avg-per-show">
                  Rs {(stats?.avgPerShow || 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5">
                <p className="text-xs text-muted-foreground">Unpaid Amount</p>
                <p className="text-xl font-bold mt-1" data-testid="stat-unpaid-amount">
                  Rs {(stats?.unpaidAmount || 0).toLocaleString()}
                </p>
                {(stats?.unpaidShows || 0) > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {stats?.unpaidShows} completed show{stats?.unpaidShows !== 1 ? "s" : ""} not yet paid
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5">
                <p className="text-xs text-muted-foreground">Pending Amount</p>
                <p className="text-xl font-bold mt-1" data-testid="stat-pending-amount">
                  Rs {(stats?.pendingAmount || 0).toLocaleString()}
                </p>
                {(stats?.upcomingShowsCount || 0) > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {stats?.upcomingShowsCount} upcoming show{stats?.upcomingShowsCount !== 1 ? "s" : ""}
                  </p>
                )}
              </CardContent>
            </Card>
            {isMember && (stats?.referredCount || 0) > 0 && (
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-xs text-muted-foreground">Shows Referred</p>
                      <p className="text-xl font-bold mt-1" data-testid="stat-referred-count">
                        {stats?.referredCount || 0}
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <UserCheck className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-5 pb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  Cities Performed In
                </h3>
                {(stats?.cities?.length || 0) === 0 ? (
                  <p className="text-xs text-muted-foreground" data-testid="text-no-financial-cities">No data for selected range</p>
                ) : (
                  <div className="space-y-2">
                    {stats?.cities.map((c, i) => (
                      <div key={c.city} className="flex items-center justify-between gap-2" data-testid={`financial-city-row-${i}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                          <span className="text-sm truncate">{c.city}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                          {c.count} show{c.count !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  Payment Summary
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Paid (completed)</span>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-semibold" data-testid="text-paid-shows-count">{stats?.paidShows || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Unpaid (completed)</span>
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                      <span className="text-sm font-semibold" data-testid="text-unpaid-shows-count">{stats?.unpaidShows || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Upcoming</span>
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold" data-testid="text-upcoming-shows-count">{stats?.upcomingShowsCount || 0}</span>
                    </div>
                  </div>
                  <div className="border-t pt-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Total earned (paid)</span>
                    <span className="text-sm font-bold text-primary">Rs {(stats?.totalEarnings || 0).toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {(stats?.upcomingShows?.length || 0) > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                Upcoming Shows ({stats?.upcomingShows?.length || 0})
              </h2>
              <div className="space-y-2">
                {stats?.upcomingShows.map((show) => {
                  const cardContent = (
                    <Card className={`${isAdmin ? "hover-elevate cursor-pointer" : ""}`} data-testid={`financial-upcoming-show-${show.id}`}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{show.title}</p>
                              <Badge variant={showTypeBadgeVariant(show.showType) as any} className="text-[10px]">
                                {show.showType}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                <CalendarIcon className="w-2.5 h-2.5 mr-0.5" />
                                Upcoming
                              </Badge>
                              {isMember && show.isReferrer && (
                                <Badge variant="outline" className="text-[10px] text-primary">
                                  <UserCheck className="w-2.5 h-2.5 mr-0.5" />
                                  Referred by you
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground">{show.city}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(show.showDate), "MMM d, yyyy")}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-sm font-bold text-muted-foreground" data-testid={`financial-upcoming-earning-${show.id}`}>
                              Rs {show.memberEarning.toLocaleString()}
                            </span>
                            {isMember && (
                              <span className="text-[10px] text-muted-foreground italic">Estimated</span>
                            )}
                            {isAdmin && (
                              <span className="text-[10px] text-muted-foreground">
                                of Rs {show.totalAmount.toLocaleString()}
                              </span>
                            )}
                            {isMember && user?.canViewAmounts && show.totalAmount != null && (
                              <span className="text-[10px] text-muted-foreground">
                                Show total: Rs {show.totalAmount.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                  return isAdmin ? (
                    <Link key={show.id} href={`/shows/${show.id}`}>{cardContent}</Link>
                  ) : (
                    <div key={show.id}>{cardContent}</div>
                  );
                })}
              </div>
              {isMember && (
                <p className="text-xs text-muted-foreground italic mt-2">
                  *Estimated amounts for upcoming shows. Expenses not accounted yet, actual amount may vary.
                </p>
              )}
            </div>
          )}

          <div>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Music className="w-4 h-4 text-muted-foreground" />
              Shows Performed ({stats?.shows?.length || 0})
            </h2>
            {(stats?.shows?.length || 0) === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 flex flex-col items-center justify-center">
                  <Music className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-financial-shows">
                    {isMember
                      ? "No shows performed in the selected period"
                      : selectedMember === "Haider Jamil"
                        ? "No shows performed in the selected period"
                        : `${selectedMember} has no shows performed in the selected period`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {stats?.shows.map((show) => {
                  const cardContent = (
                    <Card className={`${isAdmin ? "hover-elevate cursor-pointer" : ""}`} data-testid={`financial-show-${show.id}`}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{show.title}</p>
                              <Badge variant={showTypeBadgeVariant(show.showType) as any} className="text-[10px]">
                                {show.showType}
                              </Badge>
                              {show.isPaid ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                                  Paid
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">
                                  <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                                  Unpaid
                                </Badge>
                              )}
                              {isMember && show.isReferrer && (
                                <Badge variant="outline" className="text-[10px] text-primary">
                                  <UserCheck className="w-2.5 h-2.5 mr-0.5" />
                                  Referred by you
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground">{show.city}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(show.showDate), "MMM d, yyyy")}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-sm font-bold text-primary" data-testid={`financial-earning-${show.id}`}>
                              Rs {show.memberEarning.toLocaleString()}
                            </span>
                            {isAdmin && (
                              <span className="text-[10px] text-muted-foreground">
                                of Rs {show.totalAmount.toLocaleString()}
                              </span>
                            )}
                            {isMember && user?.canViewAmounts && show.totalAmount != null && (
                              <span className="text-[10px] text-muted-foreground">
                                Show total: Rs {show.totalAmount.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                  return isAdmin ? (
                    <Link key={show.id} href={`/shows/${show.id}`}>{cardContent}</Link>
                  ) : (
                    <div key={show.id}>{cardContent}</div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Search, BookOpen, Phone, Mail, User, MapPin, Building2,
  CalendarDays, Layers, FileText, Calendar as CalendarIcon,
  ChevronDown, ChevronUp, Hash,
} from "lucide-react";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, subMonths, subYears } from "date-fns";
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import type { Show } from "@shared/schema";

interface CustomDateRange {
  from?: Date;
  to?: Date;
}

type TimeRange = "lifetime" | "this_year" | "last_year" | "this_month" | "last_month" | "last_3_months" | "last_6_months" | "custom";

function getDateRange(range: TimeRange, customRange: CustomDateRange | undefined): { from?: Date; to?: Date } {
  const now = new Date();
  switch (range) {
    case "lifetime":
      return {};
    case "this_year":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "last_year": {
      const ly = subYears(now, 1);
      return { from: startOfYear(ly), to: endOfYear(ly) };
    }
    case "this_month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "last_3_months":
      return { from: subMonths(now, 3), to: now };
    case "last_6_months":
      return { from: subMonths(now, 6), to: now };
    case "custom":
      return { from: customRange?.from, to: customRange?.to };
  }
}

const rangeLabels: Record<TimeRange, string> = {
  lifetime: "Lifetime",
  this_year: "This Year",
  last_year: "Last Year",
  this_month: "This Month",
  last_month: "Last Month",
  last_3_months: "Last 3 Months",
  last_6_months: "Last 6 Months",
  custom: "Custom Range",
};

export default function DirectoryPage() {
  const { isAdmin } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("lifetime");
  const [customRange, setCustomRange] = useState<CustomDateRange>({});
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [contactShow, setContactShow] = useState<Show | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());

  const { data: shows = [], isLoading } = useQuery<Show[]>({
    queryKey: ["/api/shows"],
    enabled: isAdmin,
  });

  if (!isAdmin) {
    navigate("/");
    return null;
  }

  const dateRange = useMemo(() => getDateRange(timeRange, customRange), [timeRange, customRange]);

  const dateFiltered = useMemo(() => {
    return shows.filter((s) => {
      const showDate = new Date(s.showDate);
      if (dateRange.from && showDate < dateRange.from) return false;
      if (dateRange.to && showDate > dateRange.to) return false;
      return true;
    });
  }, [shows, dateRange]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return dateFiltered;
    const q = search.toLowerCase().trim();

    return dateFiltered.filter((s) => {
      const fields = [
        s.title,
        s.city,
        s.showType,
        s.organizationName,
        s.publicShowFor,
        s.notes,
        s.pocName,
        s.pocPhone,
        s.pocEmail,
        s.status,
        s.isPaid ? "paid" : "unpaid",
      ];
      return fields.some((f) => f && f.toLowerCase().includes(q));
    });
  }, [dateFiltered, search]);

  const summary = useMemo(() => {
    const totalShows = searchResults.length;
    const paid = searchResults.filter((s) => s.isPaid).length;
    const unpaid = totalShows - paid;
    const nonCancelled = searchResults.filter((s) => s.status !== "cancelled");
    const completed = nonCancelled.filter((s) => new Date(s.showDate) <= new Date()).length;
    const upcoming = nonCancelled.filter((s) => new Date(s.showDate) > new Date()).length;
    const totalRevenue = nonCancelled.reduce((sum, s) => sum + s.totalAmount, 0);

    const typeBreakdown: Record<string, number> = {};
    const cityBreakdown: Record<string, number> = {};
    const orgBreakdown: Record<string, Show[]> = {};

    for (const s of searchResults) {
      typeBreakdown[s.showType] = (typeBreakdown[s.showType] || 0) + 1;
      cityBreakdown[s.city] = (cityBreakdown[s.city] || 0) + 1;

      const orgKey = (s.organizationName || s.publicShowFor || "").trim();
      if (orgKey) {
        const normalizedKey = orgKey.toLowerCase();
        const existingKey = Object.keys(orgBreakdown).find((k) => k.toLowerCase() === normalizedKey);
        if (existingKey) {
          orgBreakdown[existingKey].push(s);
        } else {
          orgBreakdown[orgKey] = [s];
        }
      }
    }

    return {
      totalShows, paid, unpaid, completed, upcoming, totalRevenue,
      typeBreakdown: Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]),
      cityBreakdown: Object.entries(cityBreakdown).sort((a, b) => b[1] - a[1]),
      orgBreakdown: Object.entries(orgBreakdown).sort((a, b) => b[1].length - a[1].length),
    };
  }, [searchResults]);

  const sortedResults = useMemo(() => {
    return [...searchResults].sort((a, b) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime());
  }, [searchResults]);

  const toggleOrg = (org: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(org)) next.delete(org);
      else next.add(org);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-directory-title">Directory</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[160px]" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(rangeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key} data-testid={`option-range-${key}`}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {timeRange === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={fromOpen} onOpenChange={setFromOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" data-testid="button-from-date">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {customRange.from ? format(customRange.from, "MMM dd, yyyy") : "From date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customRange.from} onSelect={(d) => { setCustomRange((p) => ({ ...p, from: d || undefined })); setFromOpen(false); }} />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">to</span>
          <Popover open={toOpen} onOpenChange={setToOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" data-testid="button-to-date">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {customRange.to ? format(customRange.to, "MMM dd, yyyy") : "To date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customRange.to} onSelect={(d) => { setCustomRange((p) => ({ ...p, to: d || undefined })); setToOpen(false); }} />
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search everything... title, organization, city, contact, notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-directory-search"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Shows</p>
            <p className="text-lg font-bold" data-testid="text-total-shows">{summary.totalShows}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-lg font-bold" data-testid="text-completed">{summary.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Upcoming</p>
            <p className="text-lg font-bold" data-testid="text-upcoming">{summary.upcoming}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="text-paid">{summary.paid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Unpaid</p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400" data-testid="text-unpaid">{summary.unpaid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-lg font-bold" data-testid="text-revenue">Rs {summary.totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {summary.typeBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.typeBreakdown.map(([type, count]) => (
            <Badge key={type} variant="secondary" data-testid={`badge-type-${type}`}>
              {type}: {count}
            </Badge>
          ))}
        </div>
      )}

      {summary.orgBreakdown.length > 0 && search.trim() && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Organizations ({summary.orgBreakdown.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.orgBreakdown.map(([org, orgShows]) => (
              <div key={org}>
                <button
                  onClick={() => toggleOrg(org)}
                  className="w-full flex items-center justify-between gap-2 p-2 rounded-md hover-elevate"
                  data-testid={`button-org-${org}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{org}</span>
                    <Badge variant="secondary">{orgShows.length} {orgShows.length === 1 ? "show" : "shows"}</Badge>
                  </div>
                  {expandedOrgs.has(org) ? <ChevronUp className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                </button>
                {expandedOrgs.has(org) && (
                  <div className="ml-6 mt-1 space-y-1">
                    {orgShows.map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm py-1">
                        <span className="text-muted-foreground">{format(new Date(s.showDate), "MMM dd, yyyy")}</span>
                        <span className="font-medium">{s.title}</span>
                        <Badge variant="secondary">{s.showType}</Badge>
                        <span className="text-muted-foreground">{s.city}</span>
                        {s.isPaid ? (
                          <Badge variant="secondary" className="text-green-600 dark:text-green-400">Paid</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-red-600 dark:text-red-400">Unpaid</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground" data-testid="text-results-count">
            {sortedResults.length} {sortedResults.length === 1 ? "result" : "results"}
            {search.trim() && ` for "${search}"`}
          </p>
        </div>

        {sortedResults.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No shows found{search.trim() ? ` matching "${search}"` : ""}</p>
            </CardContent>
          </Card>
        )}

        {sortedResults.map((show) => (
          <Card key={show.id} data-testid={`card-show-${show.id}`}>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Link href={`/shows/${show.id}`} className="font-medium text-sm hover:underline" data-testid={`link-show-${show.id}`}>
                      {show.title}
                    </Link>
                    <Badge variant="secondary">{show.showType}</Badge>
                    {show.isPaid ? (
                      <Badge variant="secondary" className="text-green-600 dark:text-green-400">Paid</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-red-600 dark:text-red-400">Unpaid</Badge>
                    )}
                    {new Date(show.showDate) > new Date() ? (
                      <Badge variant="default">Upcoming</Badge>
                    ) : (
                      <Badge variant="secondary">Completed</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {format(new Date(show.showDate), "MMM dd, yyyy")}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {show.city}
                    </span>
                    {show.organizationName && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {show.organizationName}
                      </span>
                    )}
                    {show.publicShowFor && (
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {show.publicShowFor}
                      </span>
                    )}
                    <span className="font-medium text-foreground">
                      Rs {show.totalAmount.toLocaleString()}
                    </span>
                  </div>
                  {show.notes && search.trim() && show.notes.toLowerCase().includes(search.toLowerCase()) && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                      <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{show.notes}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {(show.pocName || show.pocPhone || show.pocEmail) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setContactShow(show)}
                      data-testid={`button-contact-${show.id}`}
                    >
                      <Phone className="w-3.5 h-3.5 mr-1.5" />
                      Contact
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!contactShow} onOpenChange={(open) => { if (!open) setContactShow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Contact Details
            </DialogTitle>
          </DialogHeader>
          {contactShow && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{contactShow.title}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(contactShow.showDate), "MMMM dd, yyyy")} &middot; {contactShow.city}
              </p>
              <div className="space-y-2 pt-2">
                {contactShow.pocName && (
                  <div className="flex items-center gap-3 text-sm">
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span data-testid="text-contact-name">{contactShow.pocName}</span>
                  </div>
                )}
                {contactShow.pocPhone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <a href={`tel:${contactShow.pocPhone}`} className="text-primary hover:underline" data-testid="text-contact-phone">
                      {contactShow.pocPhone}
                    </a>
                  </div>
                )}
                {contactShow.pocEmail && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <a href={`mailto:${contactShow.pocEmail}`} className="text-primary hover:underline" data-testid="text-contact-email">
                      {contactShow.pocEmail}
                    </a>
                  </div>
                )}
                {!contactShow.pocName && !contactShow.pocPhone && !contactShow.pocEmail && (
                  <p className="text-sm text-muted-foreground">No contact details available</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

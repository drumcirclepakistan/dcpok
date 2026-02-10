import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarPlus, Search, ListMusic, Filter, AlertCircle, CheckCircle, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import type { Show } from "@shared/schema";
import { useAuth } from "@/lib/auth";

interface MemberShow {
  id: string;
  title: string;
  city: string;
  showType: string;
  showDate: string;
  totalAmount: number;
  myEarning: number;
  isPaid: boolean;
  status: string;
  isUpcoming: boolean;
  organizationName?: string | null;
  publicShowFor?: string | null;
  isReferrer?: boolean;
}

const statusColors: Record<string, string> = {
  upcoming: "default",
  completed: "secondary",
  cancelled: "destructive",
};

const showTypeBadgeVariant = (_type: string) => "secondary";

export default function ShowsPage() {
  const { isAdmin, isMember, user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState("all");

  const { data: shows, isLoading: adminLoading } = useQuery<Show[]>({
    queryKey: ["/api/shows"],
    enabled: isAdmin,
  });

  const { data: memberShows, isLoading: memberLoading } = useQuery<MemberShow[]>({
    queryKey: ["/api/member/shows"],
    enabled: isMember,
  });

  const isLoading = isAdmin ? adminLoading : memberLoading;

  const { data: showTypes = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/show-types"],
  });

  const normalizedShows = useMemo(() => {
    if (isMember && memberShows) {
      return memberShows.map((s) => ({
        ...s,
        advancePayment: 0,
        status: s.isUpcoming ? "upcoming" : (s.status || "completed"),
        isReferrer: s.isReferrer || false,
      }));
    }
    if (isAdmin && shows) {
      return shows.map((s) => ({
        ...s,
        showDate: typeof s.showDate === 'string' ? s.showDate : new Date(s.showDate).toISOString(),
        myEarning: 0,
        isUpcoming: new Date(s.showDate) > new Date(),
        isReferrer: false,
      }));
    }
    return [];
  }, [shows, memberShows, isAdmin, isMember]);

  const filtered = useMemo(() => {
    return normalizedShows
      .filter((s) => {
        const matchesSearch =
          !search ||
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.city.toLowerCase().includes(search.toLowerCase()) ||
          (s.organizationName?.toLowerCase().includes(search.toLowerCase())) ||
          (s.publicShowFor?.toLowerCase().includes(search.toLowerCase()));
        const matchesStatus = statusFilter === "all" || s.status === statusFilter;
        const matchesType = typeFilter === "all" || s.showType === typeFilter;
        const matchesPaid = paidFilter === "all" || (paidFilter === "paid" ? s.isPaid : !s.isPaid);
        return matchesSearch && matchesStatus && matchesType && matchesPaid;
      });
  }, [normalizedShows, search, statusFilter, typeFilter, paidFilter]);

  const unpaidCompleted = useMemo(() => {
    return filtered
      .filter((s) => {
        const isCompleted = s.status === "completed" || new Date(s.showDate) < new Date();
        return isCompleted && !s.isPaid;
      })
      .sort((a, b) => new Date(a.showDate).getTime() - new Date(b.showDate).getTime());
  }, [filtered]);

  const noAdvancePaid = useMemo(() => {
    if (isMember) return [];
    return filtered
      .filter((s: any) => {
        const isUpcoming = s.status === "upcoming" && new Date(s.showDate) > new Date();
        return isUpcoming && s.advancePayment === 0;
      })
      .sort((a, b) => new Date(a.showDate).getTime() - new Date(b.showDate).getTime());
  }, [filtered, isMember]);

  const otherShows = useMemo(() => {
    const unpaidCompletedIds = new Set(unpaidCompleted.map((s) => s.id));
    const noAdvanceIds = new Set(noAdvancePaid.map((s) => s.id));
    return filtered
      .filter((s) => !unpaidCompletedIds.has(s.id) && !noAdvanceIds.has(s.id))
      .sort((a, b) => {
        const aUpcoming = a.status === "upcoming";
        const bUpcoming = b.status === "upcoming";
        if (aUpcoming && bUpcoming) {
          return new Date(a.showDate).getTime() - new Date(b.showDate).getTime();
        }
        if (aUpcoming) return -1;
        if (bUpcoming) return 1;
        return new Date(b.showDate).getTime() - new Date(a.showDate).getTime();
      });
  }, [filtered, unpaidCompleted, noAdvancePaid]);

  const renderShowCard = (show: any, isAlert: boolean) => {
    const isOverdue = !show.isPaid && (show.status === "completed" || new Date(show.showDate) < new Date());
    const showLink = isAdmin ? `/shows/${show.id}` : undefined;
    const CardWrapper = ({ children }: { children: React.ReactNode }) =>
      showLink ? <Link href={showLink}>{children}</Link> : <>{children}</>;
    return (
      <CardWrapper key={show.id}>
        <Card
          className={`${showLink ? "hover-elevate cursor-pointer" : ""} ${isAlert ? "border-destructive/40" : ""}`}
          data-testid={`card-show-${show.id}`}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm" data-testid={`text-show-title-${show.id}`}>
                    {show.title}
                  </p>
                  <Badge variant={statusColors[show.status] as any} className="text-[10px]">
                    {show.status}
                  </Badge>
                  {show.isPaid ? (
                    <Badge variant="secondary" className="text-[10px]">
                      <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                      Paid
                    </Badge>
                  ) : isOverdue ? (
                    <Badge variant="destructive" className="text-[10px]">
                      <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                      Unpaid
                    </Badge>
                  ) : isAdmin && show.status === "upcoming" && show.advancePayment === 0 ? (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                      Advance not paid
                    </Badge>
                  ) : null}
                  {isMember && show.isReferrer && (
                    <Badge variant="outline" className="text-[10px] text-primary">
                      <UserCheck className="w-2.5 h-2.5 mr-0.5" />
                      Referred by you
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">{show.city}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(show.showDate), "MMM d, yyyy 'at' h:mm a")}
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
                {isMember ? (
                  <>
                    <span className="text-sm font-semibold" data-testid={`text-show-earning-${show.id}`}>
                      Rs {show.myEarning?.toLocaleString() || "0"}
                    </span>
                    {show.isUpcoming && (
                      <span className="text-[10px] text-muted-foreground italic">Estimated</span>
                    )}
                    {user?.canViewAmounts && show.totalAmount != null && (
                      <span className="text-[10px] text-muted-foreground">
                        Show total: Rs {show.totalAmount.toLocaleString()}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold" data-testid={`text-show-amount-${show.id}`}>
                      Rs {show.totalAmount.toLocaleString()}
                    </span>
                    {show.advancePayment > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Advance: Rs {show.advancePayment.toLocaleString()}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </CardWrapper>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-shows-heading">
            {isMember ? "My Shows" : "Shows"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isMember ? "Shows you're assigned to" : "Manage all your performances"}
          </p>
        </div>
        {(isAdmin || user?.canAddShows) && (
          <Link href="/shows/new">
            <Button data-testid="button-add-show">
              <CalendarPlus className="w-4 h-4 mr-2" />
              Add Show
            </Button>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-search-shows"
            placeholder="Search shows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-type-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {showTypes.map((type) => (
              <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={paidFilter} onValueChange={setPaidFilter}>
          <SelectTrigger className="w-[120px]" data-testid="select-paid-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10 flex flex-col items-center justify-center">
            <ListMusic className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground" data-testid="text-no-shows">
              {normalizedShows.length === 0
                ? (isMember ? "No shows assigned to you yet" : "No shows yet")
                : "No shows match your filters"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {normalizedShows.length === 0
                ? (isMember ? "You'll see shows here once you're assigned to them" : "Add your first show to get started")
                : "Try adjusting your search or filters"}
            </p>
            {normalizedShows.length === 0 && isAdmin && (
              <Link href="/shows/new">
                <Button className="mt-4" data-testid="button-add-first-show">
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  Add Show
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {unpaidCompleted.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <h3 className="text-sm font-semibold text-destructive" data-testid="text-action-required">
                  Action Required - Unpaid Shows ({unpaidCompleted.length})
                </h3>
              </div>
              {unpaidCompleted.map((show) => renderShowCard(show, true))}
            </div>
          )}

          {noAdvancePaid.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-400" data-testid="text-no-advance">
                  No Advance Received ({noAdvancePaid.length})
                </h3>
              </div>
              {noAdvancePaid.map((show) => renderShowCard(show, false))}
            </div>
          )}

          {otherShows.length > 0 && (
            <div className="space-y-2">
              {(unpaidCompleted.length > 0 || noAdvancePaid.length > 0) && (
                <h3 className="text-sm font-semibold text-muted-foreground mt-2">All Shows</h3>
              )}
              {otherShows.map((show) => renderShowCard(show, false))}
            </div>
          )}

          {isMember && (
            <p className="text-xs text-muted-foreground italic mt-2" data-testid="text-member-estimate-note">
              *Amounts shown for upcoming shows are estimated. Expenses not accounted yet, actual amount may vary.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

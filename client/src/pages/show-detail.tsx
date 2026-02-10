import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, MapPin, Calendar, Building2, Pencil, Trash2,
  StickyNote, User, Phone, Mail, Plus, X, Users, Receipt, Calculator,
  Loader2, CheckCircle, AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import type { Show, ShowExpense, ShowMember } from "@shared/schema";

const statusColors: Record<string, string> = {
  upcoming: "default",
  completed: "secondary",
  cancelled: "destructive",
};

interface MemberFormRow {
  name: string;
  role: "session_player" | "manager" | "other";
  paymentType: "percentage" | "fixed" | "manual";
  paymentValue: number;
  isReferrer: boolean;
}

function calculateZainPayout(
  paymentValue: number,
  isReferrer: boolean,
  showTotal: number,
  netAmount: number,
  totalExpenses: number
): number {
  if (isReferrer) {
    return Math.round((paymentValue / 100) * netAmount);
  }
  if (showTotal < 100000) {
    const base = 15000;
    if (totalExpenses === 0) {
      return base;
    }
    const expenseDeduction = Math.round((paymentValue / 100) * totalExpenses);
    return Math.max(0, base - expenseDeduction);
  }
  return Math.round((paymentValue / 100) * netAmount);
}

export default function ShowDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: show, isLoading } = useQuery<Show>({
    queryKey: ["/api/shows", id],
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery<ShowExpense[]>({
    queryKey: ["/api/shows", id, "expenses"],
    enabled: !!id,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<ShowMember[]>({
    queryKey: ["/api/shows", id, "members"],
    enabled: !!id,
  });

  const { data: appSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const [newExpenseDesc, setNewExpenseDesc] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");

  const [memberRows, setMemberRows] = useState<MemberFormRow[]>([]);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [memberPreset, setMemberPreset] = useState("");

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/shows/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: "Show deleted" });
      navigate("/shows");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const togglePaidMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/shows/${id}/toggle-paid`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: show?.isPaid ? "Marked as unpaid" : "Marked as paid" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addExpenseMutation = useMutation({
    mutationFn: (data: { description: string; amount: number }) =>
      apiRequest("POST", `/api/shows/${id}/expenses`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id, "expenses"] });
      setNewExpenseDesc("");
      setNewExpenseAmount("");
      toast({ title: "Expense added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (expenseId: string) =>
      apiRequest("DELETE", `/api/shows/${id}/expenses/${expenseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id, "expenses"] });
      toast({ title: "Expense removed" });
    },
  });

  const saveMembersMutation = useMutation({
    mutationFn: (data: { members: any[] }) =>
      apiRequest("PUT", `/api/shows/${id}/members`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id, "members"] });
      setShowMemberForm(false);
      setMemberRows([]);
      toast({ title: "Band members updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const netAmount = (show?.totalAmount || 0) - totalExpenses;

  const calculatedMembers = useMemo(() => {
    return members.map((m) => {
      let calc = m.calculatedAmount;
      if (m.name === "Zain Shahid" && m.paymentType === "percentage") {
        calc = calculateZainPayout(m.paymentValue, m.isReferrer, show?.totalAmount || 0, netAmount, totalExpenses);
      } else if (m.paymentType === "percentage") {
        calc = Math.round((m.paymentValue / 100) * netAmount);
      } else if (m.paymentType === "fixed") {
        calc = m.paymentValue;
      } else {
        calc = m.paymentValue;
      }
      return { ...m, calculatedAmount: calc };
    });
  }, [members, netAmount, totalExpenses, show?.totalAmount]);

  const totalMemberPayouts = calculatedMembers.reduce((s, m) => s + m.calculatedAmount, 0);
  const founderPayout = netAmount - totalMemberPayouts;

  const handleAddExpense = () => {
    if (!newExpenseDesc.trim() || !newExpenseAmount) return;
    addExpenseMutation.mutate({
      description: newExpenseDesc.trim(),
      amount: Number(newExpenseAmount),
    });
  };

  const handleAddMemberPreset = (preset: string) => {
    const sessionPercent = Number(appSettings.session_player_percentage || "15");
    const referralPercent = Number(appSettings.referral_percentage || "33");
    const wahabFixed = Number(appSettings.wahab_fixed_rate || "15000");
    const managerRate = Number(appSettings.manager_default_rate || "3000");

    let newRow: MemberFormRow | null = null;

    if (preset === "zain") {
      newRow = { name: "Zain Shahid", role: "session_player", paymentType: "percentage", paymentValue: sessionPercent, isReferrer: false };
    } else if (preset === "wahab") {
      newRow = { name: "Wahab", role: "session_player", paymentType: "fixed", paymentValue: wahabFixed, isReferrer: false };
    } else if (preset === "hassan") {
      newRow = { name: "Hassan", role: "manager", paymentType: "fixed", paymentValue: managerRate, isReferrer: false };
    } else if (preset === "other_player") {
      newRow = { name: "", role: "session_player", paymentType: "manual", paymentValue: 0, isReferrer: false };
    } else if (preset === "other_manager") {
      newRow = { name: "", role: "manager", paymentType: "manual", paymentValue: 0, isReferrer: false };
    }

    if (newRow) {
      setMemberRows((prev) => [...prev, newRow!]);
    }
    setMemberPreset("");
  };

  const handleMemberChange = (idx: number, field: keyof MemberFormRow, value: any) => {
    setMemberRows((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "isReferrer" && value === true && updated[idx].name === "Zain Shahid") {
        updated[idx].paymentValue = Number(appSettings.referral_percentage || "33");
      }
      if (field === "isReferrer" && value === false && updated[idx].name === "Zain Shahid") {
        updated[idx].paymentValue = Number(appSettings.session_player_percentage || "15");
      }
      return updated;
    });
  };

  const handleRemoveMemberRow = (idx: number) => {
    setMemberRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const getFormRowCalc = (row: MemberFormRow): number => {
    if (row.name === "Zain Shahid" && row.paymentType === "percentage") {
      return calculateZainPayout(row.paymentValue, row.isReferrer, show?.totalAmount || 0, netAmount, totalExpenses);
    }
    if (row.paymentType === "percentage") {
      return Math.round((row.paymentValue / 100) * netAmount);
    }
    return row.paymentValue;
  };

  const handleSaveMembers = () => {
    const membersData = memberRows.map((m) => ({
      name: m.name,
      role: m.role,
      paymentType: m.paymentType,
      paymentValue: m.paymentValue,
      isReferrer: m.isReferrer,
      calculatedAmount: getFormRowCalc(m),
    }));
    saveMembersMutation.mutate({ members: membersData });
  };

  const startEditMembers = () => {
    if (members.length > 0) {
      setMemberRows(members.map((m) => ({
        name: m.name,
        role: m.role as MemberFormRow["role"],
        paymentType: m.paymentType as MemberFormRow["paymentType"],
        paymentValue: m.paymentValue,
        isReferrer: m.isReferrer,
      })));
    }
    setShowMemberForm(true);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-md" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-5 h-5" />
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-muted-foreground">Show not found</p>
            <Link href="/shows">
              <Button variant="outline" className="mt-4">Back to Shows</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingAmount = show.totalAmount - show.advancePayment;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button size="icon" variant="ghost" onClick={() => navigate("/shows")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate" data-testid="text-show-detail-title">{show.title}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant={statusColors[show.status] as any}>{show.status}</Badge>
              <Badge variant="outline">{show.showType}</Badge>
              {show.isPaid ? (
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-paid">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Paid
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]" data-testid="badge-unpaid">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Unpaid
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={show.isPaid ? "outline" : "default"}
            onClick={() => togglePaidMutation.mutate()}
            disabled={togglePaidMutation.isPending}
            data-testid="button-toggle-paid"
          >
            {togglePaidMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : show.isPaid ? (
              <AlertCircle className="w-4 h-4 mr-2" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            {show.isPaid ? "Mark Unpaid" : "Mark Paid"}
          </Button>
          <Link href={`/shows/${id}/edit`}>
            <Button variant="outline" data-testid="button-edit-show">
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" data-testid="button-delete-show">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this show?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove "{show.title}" from your records. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                <AlertDialogAction data-testid="button-confirm-delete" onClick={() => deleteMutation.mutate()}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-expenses">Expenses</TabsTrigger>
          <TabsTrigger value="members" data-testid="tab-members">Band</TabsTrigger>
          <TabsTrigger value="payout" data-testid="tab-payout">Payout</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">City</p>
                  <p className="text-sm font-medium" data-testid="text-detail-city">{show.city}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Date & Time</p>
                  <p className="text-sm font-medium" data-testid="text-detail-date">
                    {format(new Date(show.showDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>

              {show.organizationName && (
                <div className="flex items-start gap-3">
                  <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {show.showType === "University" ? "University" : "Company"}
                    </p>
                    <p className="text-sm font-medium" data-testid="text-detail-org">{show.organizationName}</p>
                  </div>
                </div>
              )}

              <div className="border-t pt-5">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Amount</p>
                    <p className="text-lg font-bold" data-testid="text-detail-total">Rs {show.totalAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Advance</p>
                    <p className="text-lg font-bold" data-testid="text-detail-advance">Rs {show.advancePayment.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-lg font-bold text-primary" data-testid="text-detail-pending">Rs {pendingAmount.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {(show.pocName || show.pocPhone || show.pocEmail) && (
                <div className="border-t pt-5">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Contact Person</p>
                  <div className="space-y-2">
                    {show.pocName && (
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm" data-testid="text-poc-name">{show.pocName}</span>
                      </div>
                    )}
                    {show.pocPhone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                        <a href={`tel:${show.pocPhone}`} className="text-sm text-primary" data-testid="text-poc-phone">{show.pocPhone}</a>
                      </div>
                    )}
                    {show.pocEmail && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                        <a href={`mailto:${show.pocEmail}`} className="text-sm text-primary" data-testid="text-poc-email">{show.pocEmail}</a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {show.notes && (
                <div className="border-t pt-5">
                  <div className="flex items-start gap-3">
                    <StickyNote className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm whitespace-pre-wrap mt-1" data-testid="text-detail-notes">{show.notes}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4 space-y-3">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-muted-foreground" />
                  Show Expenses
                </h3>
                <p className="text-sm text-muted-foreground">
                  Total: <span className="font-semibold text-foreground" data-testid="text-total-expenses">Rs {totalExpenses.toLocaleString()}</span>
                </p>
              </div>

              {expenses.length === 0 && !expensesLoading && (
                <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-expenses">
                  No expenses recorded yet
                </p>
              )}

              <div className="space-y-2">
                {expenses.map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0" data-testid={`expense-row-${exp.id}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{exp.description}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold">Rs {exp.amount.toLocaleString()}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteExpenseMutation.mutate(exp.id)}
                        data-testid={`button-delete-expense-${exp.id}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[150px]">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                  <Input
                    value={newExpenseDesc}
                    onChange={(e) => setNewExpenseDesc(e.target.value)}
                    placeholder="e.g. Car rental"
                    data-testid="input-expense-desc"
                  />
                </div>
                <div className="w-[120px]">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount (Rs)</label>
                  <Input
                    type="number"
                    value={newExpenseAmount}
                    onChange={(e) => setNewExpenseAmount(e.target.value)}
                    placeholder="0"
                    data-testid="input-expense-amount"
                  />
                </div>
                <Button
                  onClick={handleAddExpense}
                  disabled={addExpenseMutation.isPending || !newExpenseDesc.trim() || !newExpenseAmount}
                  data-testid="button-add-expense"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="mt-4 space-y-3">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Band Members
                </h3>
                {!showMemberForm && (
                  <Button variant="outline" onClick={startEditMembers} data-testid="button-edit-members">
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    {members.length > 0 ? "Edit" : "Add Members"}
                  </Button>
                )}
              </div>

              {!showMemberForm && (
                <>
                  <div className="py-2 border-b flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Haider Jamil</p>
                      <p className="text-xs text-muted-foreground">Founder (Always present)</p>
                    </div>
                    <Badge variant="outline">Founder</Badge>
                  </div>

                  {members.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-members">
                      No additional members assigned yet
                    </p>
                  )}

                  {calculatedMembers.map((m) => (
                    <div key={m.id} className="py-3 border-b last:border-b-0 flex items-center justify-between gap-3" data-testid={`member-row-${m.id}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{m.name}</p>
                          {m.isReferrer && <Badge variant="secondary" className="text-[10px]">Referred</Badge>}
                          {m.name === "Zain Shahid" && !m.isReferrer && (show?.totalAmount || 0) < 100000 && (
                            <Badge variant="outline" className="text-[10px]">Min 15K rule</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">
                          {m.role.replace("_", " ")}
                          {m.paymentType === "percentage" && ` (${m.paymentValue}%)`}
                          {m.paymentType === "fixed" && ` (Fixed)`}
                        </p>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0">
                        Rs {m.calculatedAmount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {showMemberForm && (
                <div className="space-y-4">
                  <div className="py-2 border-b flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Haider Jamil</p>
                      <p className="text-xs text-muted-foreground">Founder (Always present)</p>
                    </div>
                    <Badge variant="outline">Founder</Badge>
                  </div>

                  {memberRows.map((row, idx) => (
                    <div key={idx} className="p-3 border rounded-md space-y-3" data-testid={`member-form-row-${idx}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {row.role === "session_player" ? "Session Player" : row.role === "manager" ? "Manager" : "Other"}
                        </p>
                        <Button size="icon" variant="ghost" onClick={() => handleRemoveMemberRow(idx)} data-testid={`button-remove-member-${idx}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                          <Input
                            value={row.name}
                            onChange={(e) => handleMemberChange(idx, "name", e.target.value)}
                            placeholder="Member name"
                            data-testid={`input-member-name-${idx}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            {row.paymentType === "percentage" ? "Percentage (%)" : "Amount (Rs)"}
                          </label>
                          <Input
                            type="number"
                            value={row.paymentValue}
                            onChange={(e) => handleMemberChange(idx, "paymentValue", Number(e.target.value))}
                            data-testid={`input-member-value-${idx}`}
                          />
                        </div>
                      </div>

                      {row.name === "Zain Shahid" && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={row.isReferrer}
                            onCheckedChange={(checked) => handleMemberChange(idx, "isReferrer", !!checked)}
                            data-testid={`checkbox-referrer-${idx}`}
                          />
                          <label className="text-xs text-muted-foreground">
                            Referred show (gets {appSettings.referral_percentage || "33"}% instead of {appSettings.session_player_percentage || "15"}%)
                          </label>
                        </div>
                      )}

                      {row.name === "Zain Shahid" && !row.isReferrer && (show?.totalAmount || 0) < 100000 && (
                        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                          Show under Rs 100K: Base Rs 15,000
                          {totalExpenses > 0 && ` minus ${row.paymentValue}% of expenses (Rs ${Math.round((row.paymentValue / 100) * totalExpenses).toLocaleString()})`}
                        </p>
                      )}

                      <p className="text-xs text-muted-foreground">
                        Calculated: <span className="font-semibold text-foreground">
                          Rs {getFormRowCalc(row).toLocaleString()}
                        </span>
                      </p>
                    </div>
                  ))}

                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[160px]">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Add member</label>
                      <Select value={memberPreset} onValueChange={(v) => { setMemberPreset(v); handleAddMemberPreset(v); }}>
                        <SelectTrigger data-testid="select-add-member">
                          <SelectValue placeholder="Select member..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="zain">Zain Shahid (Session Player)</SelectItem>
                          <SelectItem value="wahab">Wahab (Session Player)</SelectItem>
                          <SelectItem value="hassan">Hassan (Manager)</SelectItem>
                          <SelectItem value="other_player">Other Session Player</SelectItem>
                          <SelectItem value="other_manager">Other Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                    <Button onClick={handleSaveMembers} disabled={saveMembersMutation.isPending} data-testid="button-save-members">
                      {saveMembersMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                      ) : (
                        "Save Members"
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowMemberForm(false); setMemberRows([]); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payout" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                <Calculator className="w-4 h-4 text-muted-foreground" />
                Payout Breakdown
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-muted-foreground">Show Total</span>
                  <span className="text-sm font-semibold" data-testid="text-payout-total">Rs {show.totalAmount.toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-muted-foreground">Total Expenses</span>
                  <span className="text-sm font-semibold text-destructive" data-testid="text-payout-expenses">
                    - Rs {totalExpenses.toLocaleString()}
                  </span>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm font-medium">Net Amount (After Expenses)</span>
                  <span className="text-sm font-bold" data-testid="text-payout-net">Rs {netAmount.toLocaleString()}</span>
                </div>

                <Separator />

                {calculatedMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <span className="text-sm">{m.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({m.paymentType === "percentage" ? `${m.paymentValue}%` : "Fixed"})
                      </span>
                      {m.isReferrer && <span className="text-xs text-primary ml-1">(Referral)</span>}
                      {m.name === "Zain Shahid" && !m.isReferrer && show.totalAmount < 100000 && (
                        <span className="text-xs text-muted-foreground ml-1">(Min 15K rule)</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold flex-shrink-0">
                      Rs {m.calculatedAmount.toLocaleString()}
                    </span>
                  </div>
                ))}

                <Separator />

                <div className="flex items-center justify-between gap-3 py-3 bg-primary/5 px-3 rounded-md">
                  <div>
                    <span className="text-sm font-bold">Haider Jamil</span>
                    <span className="text-xs text-muted-foreground ml-2">(Founder)</span>
                  </div>
                  <span className="text-lg font-bold text-primary" data-testid="text-payout-founder">
                    Rs {founderPayout.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

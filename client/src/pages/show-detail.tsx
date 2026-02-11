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
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, MapPin, Calendar, Building2, Pencil, Trash2,
  StickyNote, User, Phone, Mail, Plus, X, Users, Receipt, Calculator,
  Loader2, CheckCircle, AlertCircle, Drum, Ban, MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { calculateDynamicPayout, type Show, type ShowExpense, type ShowMember, type PayoutConfig, type RetainedFundAllocation } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const statusColors: Record<string, string> = {
  upcoming: "default",
  completed: "secondary",
  cancelled: "destructive",
};

interface BandMemberConfig {
  id: string;
  name: string;
  role: string;
  customRole: string | null;
  userId: string | null;
  paymentType: string;
  normalRate: number | null;
  referralRate: number | null;
  hasMinLogic: boolean;
  minThreshold: number | null;
  minFlatRate: number | null;
}

interface MemberFormRow {
  name: string;
  role: "session_player" | "manager" | "other";
  paymentType: "percentage" | "fixed";
  paymentValue: number;
  isReferrer: boolean;
  manualOverride: boolean;
  manualAmount: number;
}

type MemberPayoutConfig = PayoutConfig;

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

  const { data: bandMembers = [] } = useQuery<BandMemberConfig[]>({
    queryKey: ["/api/band-members"],
  });

  const { data: retainedAllocations = [] } = useQuery<RetainedFundAllocation[]>({
    queryKey: ["/api/shows", id, "retained-allocations"],
    enabled: !!id && show?.status === "cancelled",
  });

  const bandMemberConfigMap = useMemo(() => {
    const map: Record<string, BandMemberConfig> = {};
    for (const bm of bandMembers) {
      map[bm.name] = bm;
    }
    return map;
  }, [bandMembers]);

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

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [refundType, setRefundType] = useState<string>("non_refundable");
  const [refundAmount, setRefundAmount] = useState("");

  const [allocationMode, setAllocationMode] = useState<"keep_separate" | "assign" | "split">("keep_separate");
  const [allocationSplitMode, setAllocationSplitMode] = useState<"equal" | "payout_rules" | "manual">("equal");
  const [allocationMember, setAllocationMember] = useState("");
  const [allocationSelectedMembers, setAllocationSelectedMembers] = useState<string[]>([]);
  const [allocationManualAmounts, setAllocationManualAmounts] = useState<Record<string, number>>({});
  const [allocationEditing, setAllocationEditing] = useState(false);

  const invalidateShowCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/shows", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/financials"] });
    queryClient.invalidateQueries({ queryKey: ["/api/member/financials"] });
    queryClient.invalidateQueries({ queryKey: ["/api/member/shows"] });
    queryClient.invalidateQueries({ queryKey: ["/api/member/dashboard"] });
  };

  const cancelShowMutation = useMutation({
    mutationFn: (data: { status: string; cancellationReason: string; refundType: string; refundAmount: number }) =>
      apiRequest("PATCH", `/api/shows/${id}`, data),
    onSuccess: () => {
      invalidateShowCaches();
      toast({ title: "Show cancelled" });
      setCancelDialogOpen(false);
      setCancellationReason("");
      setRefundType("non_refundable");
      setRefundAmount("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const uncancelShowMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/shows/${id}/retained-allocations`);
      return apiRequest("PATCH", `/api/shows/${id}`, {
        status: new Date(show!.showDate) > new Date() ? "upcoming" : "completed",
        cancellationReason: null,
        refundType: null,
        refundAmount: 0,
      });
    },
    onSuccess: () => {
      invalidateShowCaches();
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id, "retained-allocations"] });
      toast({ title: "Show restored" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveAllocationsMutation = useMutation({
    mutationFn: (data: { allocations: { bandMemberId: string; memberName: string; amount: number }[] }) =>
      apiRequest("PUT", `/api/shows/${id}/retained-allocations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id, "retained-allocations"] });
      invalidateShowCaches();
      setAllocationEditing(false);
      toast({ title: "Retained funds allocation saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const clearAllocationsMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/shows/${id}/retained-allocations`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id, "retained-allocations"] });
      invalidateShowCaches();
      setAllocationMode("keep_separate");
      setAllocationEditing(false);
      toast({ title: "Allocations cleared" });
    },
  });

  useEffect(() => {
    if (retainedAllocations.length > 0 && !allocationEditing) {
      if (retainedAllocations.length === 1) {
        setAllocationMode("assign");
        setAllocationMember(retainedAllocations[0].bandMemberId);
      } else {
        setAllocationMode("split");
        setAllocationSelectedMembers(retainedAllocations.map(a => a.bandMemberId));
        const amounts: Record<string, number> = {};
        retainedAllocations.forEach(a => { amounts[a.bandMemberId] = a.amount; });
        setAllocationManualAmounts(amounts);
        setAllocationSplitMode("manual");
      }
    } else if (retainedAllocations.length === 0 && !allocationEditing) {
      setAllocationMode("keep_separate");
    }
  }, [retainedAllocations, allocationEditing]);

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
      const snapshotConfig: MemberPayoutConfig = {
        referralRate: m.referralRate,
        hasMinLogic: m.hasMinLogic,
        minThreshold: m.minThreshold,
        minFlatRate: m.minFlatRate,
      };
      const calc = calculateDynamicPayout(snapshotConfig, m.paymentValue, m.isReferrer, show?.totalAmount || 0, netAmount, totalExpenses, m.paymentType);
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

  const handleAddMemberPreset = (memberId: string) => {
    const config = bandMembers.find((bm) => bm.id === memberId);
    if (!config) return;

    const alreadyAdded = memberRows.some((r) => r.name === config.name);
    if (alreadyAdded) {
      toast({ title: "Already added", description: `${config.name} is already in the list`, variant: "destructive" });
      setMemberPreset("");
      return;
    }

    const role = (config.role === "manager" ? "manager" : "session_player") as MemberFormRow["role"];
    const paymentType = (config.paymentType === "percentage" ? "percentage" : "fixed") as MemberFormRow["paymentType"];
    const paymentValue = config.normalRate ?? 0;

    const newRow: MemberFormRow = {
      name: config.name,
      role,
      paymentType,
      paymentValue,
      isReferrer: false,
      manualOverride: false,
      manualAmount: 0,
    };

    setMemberRows((prev) => [...prev, newRow]);
    setMemberPreset("");
  };

  const handleMemberChange = (idx: number, field: keyof MemberFormRow, value: any) => {
    setMemberRows((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      const config = bandMemberConfigMap[updated[idx].name];
      if (field === "isReferrer" && config) {
        if (value === true && config.referralRate) {
          updated[idx].paymentValue = config.referralRate;
        }
        if (value === false) {
          updated[idx].paymentValue = config.normalRate ?? 0;
        }
      }
      return updated;
    });
  };

  const handleRemoveMemberRow = (idx: number) => {
    setMemberRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const getFormRowCalc = (row: MemberFormRow): number => {
    if (row.manualOverride) return row.manualAmount;
    const config = bandMemberConfigMap[row.name];
    return calculateDynamicPayout(config, row.paymentValue, row.isReferrer, show?.totalAmount || 0, netAmount, totalExpenses, row.paymentType);
  };

  const handleSaveMembers = () => {
    const membersData = memberRows.map((m) => {
      const config = bandMemberConfigMap[m.name];
      if (m.manualOverride) {
        return {
          name: m.name,
          role: m.role,
          paymentType: "fixed" as const,
          paymentValue: m.manualAmount,
          isReferrer: m.isReferrer,
          calculatedAmount: m.manualAmount,
          referralRate: null,
          hasMinLogic: false,
          minThreshold: null,
          minFlatRate: null,
        };
      }
      return {
        name: m.name,
        role: m.role,
        paymentType: m.paymentType,
        paymentValue: m.paymentValue,
        isReferrer: m.isReferrer,
        calculatedAmount: getFormRowCalc(m),
        referralRate: config?.referralRate ?? null,
        hasMinLogic: config?.hasMinLogic ?? false,
        minThreshold: config?.minThreshold ?? null,
        minFlatRate: config?.minFlatRate ?? null,
      };
    });
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
        manualOverride: false,
        manualAmount: m.calculatedAmount,
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
          {show.status !== "cancelled" && (
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
          )}
          {show.status === "cancelled" ? (
            <Button
              variant="outline"
              onClick={() => uncancelShowMutation.mutate()}
              disabled={uncancelShowMutation.isPending}
              data-testid="button-restore-show"
            >
              {uncancelShowMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Restore Show
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(true)}
              data-testid="button-cancel-show"
            >
              <Ban className="w-4 h-4 mr-2" />
              Cancel Show
            </Button>
          )}
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

          <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => {
            setCancelDialogOpen(open);
            if (!open) {
              setCancellationReason("");
              setRefundType("non_refundable");
              setRefundAmount("");
            }
          }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this show?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will mark "{show.title}" as cancelled. Cancelled shows are excluded from all earnings calculations.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {(() => {
                const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
                const fundsReceived = show.isPaid ? show.totalAmount : show.advancePayment;
                const availableForRefund = Math.max(0, fundsReceived - totalExpenses);
                const hasReceivedFunds = fundsReceived > 0;

                return (
                  <div className="space-y-4 py-2">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Reason for cancellation (optional)</label>
                      <Textarea
                        value={cancellationReason}
                        onChange={(e) => setCancellationReason(e.target.value)}
                        placeholder="e.g. Client postponed, weather issues..."
                        data-testid="input-cancellation-reason"
                        className="resize-none"
                        rows={2}
                      />
                    </div>

                    {hasReceivedFunds && (
                      <div>
                        <div className="text-sm space-y-1 mb-3 p-3 rounded-md bg-muted/50">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{show.isPaid ? "Total Paid" : "Advance Received"}</span>
                            <span className="font-medium">Rs {fundsReceived.toLocaleString()}</span>
                          </div>
                          {totalExpenses > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Expenses Incurred</span>
                              <span className="font-medium text-destructive">- Rs {totalExpenses.toLocaleString()}</span>
                            </div>
                          )}
                          <Separator className="my-1" />
                          <div className="flex justify-between">
                            <span className="text-muted-foreground font-medium">Available for Refund</span>
                            <span className="font-bold">Rs {availableForRefund.toLocaleString()}</span>
                          </div>
                        </div>

                        {availableForRefund > 0 ? (
                          <>
                            <Select value={refundType} onValueChange={(val) => {
                              setRefundType(val);
                              if (val !== "partial") setRefundAmount("");
                            }}>
                              <SelectTrigger data-testid="select-refund-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="non_refundable">Will not be refunded</SelectItem>
                                <SelectItem value="partial">Partial refund</SelectItem>
                                <SelectItem value="complete">Complete refund (Rs {availableForRefund.toLocaleString()})</SelectItem>
                              </SelectContent>
                            </Select>

                            {refundType === "partial" && (
                              <div className="mt-2">
                                <label className="text-xs text-muted-foreground mb-1 block">Refund amount (Rs)</label>
                                <Input
                                  type="number"
                                  value={refundAmount}
                                  onChange={(e) => setRefundAmount(e.target.value)}
                                  placeholder={`Max Rs ${availableForRefund.toLocaleString()}`}
                                  max={availableForRefund}
                                  data-testid="input-refund-amount"
                                />
                                {Number(refundAmount) > availableForRefund && (
                                  <p className="text-xs text-destructive mt-1">Refund cannot exceed available funds (Rs {availableForRefund.toLocaleString()})</p>
                                )}
                              </div>
                            )}

                            <p className="text-xs text-muted-foreground mt-2">
                              {refundType === "non_refundable" && `Rs ${availableForRefund.toLocaleString()} will be retained from this cancelled show.`}
                              {refundType === "complete" && `Rs ${availableForRefund.toLocaleString()} will be refunded. No amount retained.`}
                              {refundType === "partial" && refundAmount && Number(refundAmount) <= availableForRefund && `Rs ${Number(refundAmount).toLocaleString()} refunded. Rs ${(availableForRefund - Number(refundAmount)).toLocaleString()} retained.`}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            All received funds have been used for expenses. No amount available for refund.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-cancel">Go Back</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-confirm-cancel"
                  disabled={refundType === "partial" && (() => {
                    const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
                    const funds = show.isPaid ? show.totalAmount : show.advancePayment;
                    const avail = Math.max(0, funds - totalExp);
                    return !refundAmount || Number(refundAmount) > avail || Number(refundAmount) < 0;
                  })()}
                  onClick={() => {
                    const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
                    const fundsReceived = show.isPaid ? show.totalAmount : show.advancePayment;
                    const availableForRefund = Math.max(0, fundsReceived - totalExp);
                    const computedRefundAmount = refundType === "complete"
                      ? availableForRefund
                      : refundType === "partial"
                        ? Number(refundAmount)
                        : 0;
                    cancelShowMutation.mutate({
                      status: "cancelled",
                      cancellationReason: cancellationReason.trim(),
                      refundType: fundsReceived > 0 ? refundType : "non_refundable",
                      refundAmount: computedRefundAmount,
                    });
                  }}
                >
                  {cancelShowMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Cancel Show
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
                      Organization
                    </p>
                    <p className="text-sm font-medium" data-testid="text-detail-org">{show.organizationName}</p>
                  </div>
                </div>
              )}

              {show.publicShowFor && (
                <div className="flex items-start gap-3">
                  <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Public Show For</p>
                    <p className="text-sm font-medium" data-testid="text-detail-public-show-for">{show.publicShowFor}</p>
                  </div>
                </div>
              )}

              {show.numberOfDrums && (
                <div className="flex items-start gap-3">
                  <Drum className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Number of Drums</p>
                    <p className="text-sm font-medium" data-testid="text-detail-drums">{show.numberOfDrums}</p>
                  </div>
                </div>
              )}

              {show.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium" data-testid="text-detail-location">{show.location}</p>
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

              {show.status === "cancelled" && (
                <div className="border-t pt-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <MessageSquare className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Cancellation Reason</p>
                      <p className="text-sm whitespace-pre-wrap mt-1" data-testid="text-cancellation-reason">
                        {show.cancellationReason || "No reason provided"}
                      </p>
                    </div>
                  </div>

                  {(() => {
                    const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
                    const fundsReceived = show.isPaid ? show.totalAmount : show.advancePayment;
                    const afterExpenses = Math.max(0, fundsReceived - totalExp);
                    const retained = Math.max(0, afterExpenses - (show.refundAmount || 0));
                    return fundsReceived > 0 ? (
                      <div className="flex items-start gap-3">
                        <Receipt className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Refund Status</p>
                          <div className="mt-1 space-y-1" data-testid="text-refund-status">
                            {(!show.refundType || show.refundType === "non_refundable") && (
                              <div>
                                <Badge variant="secondary">Non-refundable</Badge>
                                {totalExp > 0 ? (
                                  <p className="text-sm mt-1">Rs {totalExp.toLocaleString()} used for expenses, Rs {retained.toLocaleString()} retained</p>
                                ) : (
                                  <p className="text-sm mt-1">Rs {fundsReceived.toLocaleString()} retained</p>
                                )}
                              </div>
                            )}
                            {show.refundType === "complete" && (
                              <div>
                                <Badge variant="outline">Complete Refund</Badge>
                                <p className="text-sm mt-1">
                                  Rs {(show.refundAmount || 0).toLocaleString()} refunded
                                  {totalExp > 0 ? `, Rs ${totalExp.toLocaleString()} used for expenses` : ""}
                                </p>
                              </div>
                            )}
                            {show.refundType === "partial" && (
                              <div>
                                <Badge variant="outline">Partial Refund</Badge>
                                <p className="text-sm mt-1">
                                  Rs {(show.refundAmount || 0).toLocaleString()} refunded
                                  {totalExp > 0 ? `, Rs ${totalExp.toLocaleString()} expenses` : ""}
                                  {retained > 0 ? `, Rs ${retained.toLocaleString()} retained` : ""}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {show.status === "cancelled" && (() => {
                const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
                const fundsRcvd = show.isPaid ? show.totalAmount : show.advancePayment;
                const afterExp = Math.max(0, fundsRcvd - totalExp);
                const retainedAmt = Math.max(0, afterExp - (show.refundAmount || 0));

                if (retainedAmt <= 0) return null;

                const computeAllocations = () => {
                  if (allocationMode === "keep_separate") return [];
                  if (allocationMode === "assign") {
                    const bm = bandMembers.find(m => m.id === allocationMember);
                    if (!bm) return [];
                    return [{ bandMemberId: bm.id, memberName: bm.name, amount: retainedAmt }];
                  }
                  if (allocationMode === "split") {
                    const selected = bandMembers.filter(m => allocationSelectedMembers.includes(m.id));
                    if (selected.length === 0) return [];

                    if (allocationSplitMode === "equal") {
                      const base = Math.floor(retainedAmt / selected.length);
                      const remainder = retainedAmt - (base * selected.length);
                      return selected.map((m, i) => ({
                        bandMemberId: m.id,
                        memberName: m.name,
                        amount: base + (i === 0 ? remainder : 0),
                      }));
                    }

                    if (allocationSplitMode === "payout_rules") {
                      let totalWeight = 0;
                      const weights = selected.map(m => {
                        let w = 0;
                        if (m.paymentType === "percentage") {
                          w = m.normalRate || 0;
                        } else {
                          w = m.normalRate || 0;
                        }
                        totalWeight += w;
                        return { member: m, weight: w };
                      });
                      if (totalWeight === 0) {
                        const base = Math.floor(retainedAmt / selected.length);
                        const remainder = retainedAmt - (base * selected.length);
                        return selected.map((m, i) => ({
                          bandMemberId: m.id,
                          memberName: m.name,
                          amount: base + (i === 0 ? remainder : 0),
                        }));
                      }
                      let allocated = 0;
                      const results = weights.map((w, i) => {
                        const amt = i === weights.length - 1
                          ? retainedAmt - allocated
                          : Math.round((w.weight / totalWeight) * retainedAmt);
                        allocated += amt;
                        return { bandMemberId: w.member.id, memberName: w.member.name, amount: amt };
                      });
                      return results;
                    }

                    if (allocationSplitMode === "manual") {
                      return selected.map(m => ({
                        bandMemberId: m.id,
                        memberName: m.name,
                        amount: allocationManualAmounts[m.id] || 0,
                      }));
                    }
                  }
                  return [];
                };

                const previewAllocations = allocationEditing ? computeAllocations() : [];
                const previewTotal = previewAllocations.reduce((s, a) => s + a.amount, 0);
                const existingTotal = retainedAllocations.reduce((s, a) => s + a.amount, 0);

                const handleSaveAllocations = () => {
                  if (allocationMode === "keep_separate") {
                    clearAllocationsMutation.mutate();
                    return;
                  }
                  const allocations = computeAllocations().filter(a => a.amount > 0);
                  if (allocations.length === 0) {
                    toast({ title: "No allocations", description: "Please select members and amounts", variant: "destructive" });
                    return;
                  }
                  const total = allocations.reduce((s, a) => s + a.amount, 0);
                  if (total > retainedAmt) {
                    toast({ title: "Exceeds retained", description: `Total (Rs ${total.toLocaleString()}) exceeds retained amount (Rs ${retainedAmt.toLocaleString()})`, variant: "destructive" });
                    return;
                  }
                  saveAllocationsMutation.mutate({ allocations });
                };

                const toggleSelectedMember = (memberId: string) => {
                  setAllocationSelectedMembers(prev =>
                    prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
                  );
                };

                return (
                  <div className="border-t pt-5">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-muted-foreground" />
                        Retained Funds Allocation
                      </h3>
                      <Badge variant="outline" data-testid="badge-retained-amount">Rs {retainedAmt.toLocaleString()}</Badge>
                    </div>

                    {!allocationEditing && retainedAllocations.length === 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground" data-testid="text-retained-kept-separate">
                          Kept separate - not assigned to any member
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAllocationEditing(true)}
                          data-testid="button-allocate-retained"
                        >
                          Allocate Funds
                        </Button>
                      </div>
                    )}

                    {!allocationEditing && retainedAllocations.length > 0 && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          {retainedAllocations.map(a => (
                            <div key={a.id} className="flex items-center justify-between gap-2 text-sm py-1" data-testid={`allocation-row-${a.bandMemberId}`}>
                              <span>{a.memberName}</span>
                              <span className="font-semibold">Rs {a.amount.toLocaleString()}</span>
                            </div>
                          ))}
                          {existingTotal < retainedAmt && (
                            <div className="flex items-center justify-between gap-2 text-sm py-1 text-muted-foreground">
                              <span>Unallocated</span>
                              <span>Rs {(retainedAmt - existingTotal).toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAllocationEditing(true)}
                          data-testid="button-edit-allocation"
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Edit Allocation
                        </Button>
                      </div>
                    )}

                    {allocationEditing && (
                      <div className="space-y-4">
                        <RadioGroup
                          value={allocationMode}
                          onValueChange={(v) => setAllocationMode(v as any)}
                          className="space-y-2"
                          data-testid="radio-allocation-mode"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="keep_separate" id="alloc-separate" />
                            <Label htmlFor="alloc-separate" className="text-sm cursor-pointer">Keep Separate</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="assign" id="alloc-assign" />
                            <Label htmlFor="alloc-assign" className="text-sm cursor-pointer">Assign to Member</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="split" id="alloc-split" />
                            <Label htmlFor="alloc-split" className="text-sm cursor-pointer">Split Between Members</Label>
                          </div>
                        </RadioGroup>

                        {allocationMode === "assign" && (
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Select Member</Label>
                            <Select value={allocationMember} onValueChange={setAllocationMember}>
                              <SelectTrigger data-testid="select-allocation-member">
                                <SelectValue placeholder="Choose member..." />
                              </SelectTrigger>
                              <SelectContent>
                                {bandMembers.map(bm => (
                                  <SelectItem key={bm.id} value={bm.id}>{bm.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {allocationMember && (
                              <p className="text-sm text-muted-foreground">
                                Full Rs {retainedAmt.toLocaleString()} goes to {bandMembers.find(m => m.id === allocationMember)?.name}
                              </p>
                            )}
                          </div>
                        )}

                        {allocationMode === "split" && (
                          <div className="space-y-3">
                            <div>
                              <Label className="text-xs text-muted-foreground mb-2 block">Select Members</Label>
                              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                {bandMembers.map(bm => (
                                  <div key={bm.id} className="flex items-center gap-2">
                                    <Checkbox
                                      id={`alloc-member-${bm.id}`}
                                      checked={allocationSelectedMembers.includes(bm.id)}
                                      onCheckedChange={() => toggleSelectedMember(bm.id)}
                                      data-testid={`checkbox-alloc-member-${bm.id}`}
                                    />
                                    <Label htmlFor={`alloc-member-${bm.id}`} className="text-sm cursor-pointer">{bm.name}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {allocationSelectedMembers.length > 0 && (
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Split Method</Label>
                                <RadioGroup
                                  value={allocationSplitMode}
                                  onValueChange={(v) => setAllocationSplitMode(v as any)}
                                  className="space-y-1.5"
                                  data-testid="radio-split-mode"
                                >
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem value="equal" id="split-equal" />
                                    <Label htmlFor="split-equal" className="text-sm cursor-pointer">Equal Split</Label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem value="payout_rules" id="split-rules" />
                                    <Label htmlFor="split-rules" className="text-sm cursor-pointer">According to Payout Rules</Label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem value="manual" id="split-manual" />
                                    <Label htmlFor="split-manual" className="text-sm cursor-pointer">Manual Amounts</Label>
                                  </div>
                                </RadioGroup>
                              </div>
                            )}

                            {allocationSplitMode === "manual" && allocationSelectedMembers.length > 0 && (
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Enter amounts for each member</Label>
                                {bandMembers.filter(m => allocationSelectedMembers.includes(m.id)).map(bm => (
                                  <div key={bm.id} className="flex items-center gap-2">
                                    <span className="text-sm flex-1 min-w-0 truncate">{bm.name}</span>
                                    <Input
                                      type="number"
                                      className="w-[120px]"
                                      value={allocationManualAmounts[bm.id] || ""}
                                      onChange={(e) => setAllocationManualAmounts(prev => ({
                                        ...prev,
                                        [bm.id]: Number(e.target.value) || 0,
                                      }))}
                                      placeholder="Rs"
                                      data-testid={`input-manual-amount-${bm.id}`}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            {allocationSelectedMembers.length > 0 && (allocationSplitMode === "equal" || allocationSplitMode === "payout_rules") && (
                              <div className="space-y-1 text-sm border rounded-md p-3">
                                <p className="text-xs text-muted-foreground font-medium mb-1">Preview</p>
                                {previewAllocations.map(a => (
                                  <div key={a.bandMemberId} className="flex items-center justify-between gap-2">
                                    <span>{a.memberName}</span>
                                    <span className="font-semibold">Rs {a.amount.toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {allocationMode === "split" && allocationSplitMode === "manual" && previewTotal > 0 && (
                          <div className="flex items-center justify-between gap-2 text-sm border-t pt-2">
                            <span className={previewTotal > retainedAmt ? "text-destructive" : "text-muted-foreground"}>
                              Total: Rs {previewTotal.toLocaleString()} / Rs {retainedAmt.toLocaleString()}
                            </span>
                            {previewTotal < retainedAmt && (
                              <span className="text-muted-foreground text-xs">
                                Rs {(retainedAmt - previewTotal).toLocaleString()} unallocated
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <Button
                            size="sm"
                            onClick={handleSaveAllocations}
                            disabled={saveAllocationsMutation.isPending || clearAllocationsMutation.isPending}
                            data-testid="button-save-allocation"
                          >
                            {(saveAllocationsMutation.isPending || clearAllocationsMutation.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAllocationEditing(false)}
                            data-testid="button-cancel-allocation"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
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
                      <p className="text-xs text-muted-foreground">Admin (Always present)</p>
                    </div>
                    <Badge variant="outline">Admin</Badge>
                  </div>

                  {members.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-members">
                      No additional members assigned yet
                    </p>
                  )}

                  {calculatedMembers.map((m) => {
                    const showMinRule = m.hasMinLogic && m.minThreshold && !m.isReferrer && (show?.totalAmount || 0) < m.minThreshold;
                    return (
                    <div key={m.id} className="py-3 border-b last:border-b-0 flex items-center justify-between gap-3" data-testid={`member-row-${m.id}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{m.name}</p>
                          {m.isReferrer && <Badge variant="secondary" className="text-[10px]">Referred</Badge>}
                          {showMinRule && (
                            <Badge variant="outline" className="text-[10px]">Min Rs {(m.minFlatRate ?? 0).toLocaleString()} rule</Badge>
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
                    );
                  })}
                </>
              )}

              {showMemberForm && (
                <div className="space-y-4">
                  <div className="py-2 border-b flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Haider Jamil</p>
                      <p className="text-xs text-muted-foreground">Admin (Always present)</p>
                    </div>
                    <Badge variant="outline">Admin</Badge>
                  </div>

                  {memberRows.map((row, idx) => {
                    const config = bandMemberConfigMap[row.name];
                    const hasReferralOption = config?.paymentType === "percentage" && config?.referralRate;
                    const hasMinLogicActive = config?.hasMinLogic && config?.minThreshold && config?.minFlatRate;
                    return (
                    <div key={idx} className="p-3 border rounded-md space-y-3" data-testid={`member-form-row-${idx}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-medium">{row.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {row.role.replace("_", " ")} &middot; {row.paymentType === "percentage" ? `${row.paymentValue}% of net` : `Rs ${row.paymentValue.toLocaleString()} fixed`}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => handleRemoveMemberRow(idx)} data-testid={`button-remove-member-${idx}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {hasReferralOption && !row.manualOverride && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={row.isReferrer}
                            onCheckedChange={(checked) => handleMemberChange(idx, "isReferrer", !!checked)}
                            data-testid={`checkbox-referrer-${idx}`}
                          />
                          <label className="text-xs text-muted-foreground">
                            Referred show (gets {config.referralRate}% instead of {config.normalRate}%)
                          </label>
                        </div>
                      )}

                      {!row.manualOverride && hasMinLogicActive && !row.isReferrer && (show?.totalAmount || 0) < (config.minThreshold ?? 0) && (
                        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                          Show under Rs {(config.minThreshold ?? 0).toLocaleString()}: Base Rs {(config.minFlatRate ?? 0).toLocaleString()}
                          {totalExpenses > 0 && ` minus ${row.paymentValue}% of expenses (Rs ${Math.round((row.paymentValue / 100) * totalExpenses).toLocaleString()})`}
                        </p>
                      )}

                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={row.manualOverride}
                          onCheckedChange={(checked) => {
                            const isChecked = !!checked;
                            setMemberRows((prev) => {
                              const updated = [...prev];
                              updated[idx] = { ...updated[idx], manualOverride: isChecked };
                              if (isChecked) {
                                const calcAmount = getFormRowCalc({ ...updated[idx], manualOverride: false });
                                updated[idx].manualAmount = calcAmount;
                              }
                              return updated;
                            });
                          }}
                          data-testid={`checkbox-manual-override-${idx}`}
                        />
                        <label className="text-xs text-muted-foreground">Custom amount</label>
                      </div>

                      {row.manualOverride ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Rs</span>
                          <Input
                            type="number"
                            value={row.manualAmount}
                            onChange={(e) => handleMemberChange(idx, "manualAmount", Number(e.target.value) || 0)}
                            className="w-32"
                            data-testid={`input-manual-amount-${idx}`}
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Calculated: <span className="font-semibold text-foreground">
                            Rs {getFormRowCalc(row).toLocaleString()}
                          </span>
                        </p>
                      )}
                    </div>
                    );
                  })}

                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[160px]">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Add member</label>
                      <Select value={memberPreset} onValueChange={(v) => { setMemberPreset(v); handleAddMemberPreset(v); }}>
                        <SelectTrigger data-testid="select-add-member">
                          <SelectValue placeholder="Select member..." />
                        </SelectTrigger>
                        <SelectContent>
                          {bandMembers
                            .filter((bm) => !memberRows.some((r) => r.name === bm.name))
                            .map((bm) => (
                              <SelectItem key={bm.id} value={bm.id}>
                                {bm.name} ({bm.role === "manager" ? "Manager" : "Session Player"})
                              </SelectItem>
                            ))}
                          {bandMembers.filter((bm) => !memberRows.some((r) => r.name === bm.name)).length === 0 && (
                            <SelectItem value="_none" disabled>All members added</SelectItem>
                          )}
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

                {calculatedMembers.map((m) => {
                  const showMinRule = m.hasMinLogic && m.minThreshold && !m.isReferrer && show.totalAmount < m.minThreshold;
                  return (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <span className="text-sm">{m.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({m.paymentType === "percentage" ? `${m.paymentValue}%` : "Fixed"})
                      </span>
                      {m.isReferrer && <span className="text-xs text-primary ml-1">(Referral)</span>}
                      {showMinRule && (
                        <span className="text-xs text-muted-foreground ml-1">(Min Rs {(m.minFlatRate ?? 0).toLocaleString()} rule)</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold flex-shrink-0">
                      Rs {m.calculatedAmount.toLocaleString()}
                    </span>
                  </div>
                  );
                })}

                <Separator />

                <div className="flex items-center justify-between gap-3 py-3 bg-primary/5 px-3 rounded-md">
                  <div>
                    <span className="text-sm font-bold">Haider Jamil</span>
                    <span className="text-xs text-muted-foreground ml-2">(Admin)</span>
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

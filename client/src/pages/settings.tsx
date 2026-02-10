import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon, Save, Loader2, Percent, DollarSign,
  Users, UserPlus, Shield, KeyRound, Trash2, UserCheck, UserX,
  ChevronDown, ChevronRight, Tag, Plus, Pencil, X,
} from "lucide-react";
import { useState } from "react";

interface BandMember {
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

interface ShowType {
  id: string;
  name: string;
}

const roleOptions = [
  { value: "session_player", label: "Session Player" },
  { value: "manager", label: "Manager" },
  { value: "custom", label: "Custom Role" },
];

function getRoleLabel(role: string, customRole: string | null) {
  if (role === "custom" && customRole) return customRole;
  const found = roleOptions.find((r) => r.value === role);
  return found ? found.label : role;
}

function CollapsibleSection({
  title,
  icon: Icon,
  description,
  defaultOpen = true,
  children,
  testId,
}: {
  title: string;
  icon: any;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  testId: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="w-full flex items-center justify-between p-4 md:p-5 text-left hover-elevate rounded-md"
            data-testid={`button-toggle-${testId}`}
          >
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                {title}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-5 space-y-4">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bandMembers = [], isLoading: isLoadingMembers } = useQuery<BandMember[]>({
    queryKey: ["/api/band-members"],
  });

  const { data: showTypes = [], isLoading: isLoadingTypes } = useQuery<ShowType[]>({
    queryKey: ["/api/show-types"],
  });

  // Payment config editing
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    paymentType: "fixed",
    normalRate: "",
    referralRate: "",
    hasMinLogic: false,
    minThreshold: "",
    minFlatRate: "",
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/band-members/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/band-members"] });
      setEditingPaymentId(null);
      toast({ title: "Payment config saved", description: "Changes apply to future shows only." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const startEditPayment = (member: BandMember) => {
    setEditingPaymentId(member.id);
    setPaymentForm({
      paymentType: member.paymentType || "fixed",
      normalRate: String(member.normalRate ?? ""),
      referralRate: String(member.referralRate ?? ""),
      hasMinLogic: member.hasMinLogic ?? false,
      minThreshold: String(member.minThreshold ?? ""),
      minFlatRate: String(member.minFlatRate ?? ""),
    });
  };

  const savePaymentConfig = (memberId: string) => {
    updatePaymentMutation.mutate({
      id: memberId,
      data: {
        paymentType: paymentForm.paymentType,
        normalRate: paymentForm.normalRate ? Number(paymentForm.normalRate) : null,
        referralRate: paymentForm.referralRate ? Number(paymentForm.referralRate) : null,
        hasMinLogic: paymentForm.hasMinLogic,
        minThreshold: paymentForm.minThreshold ? Number(paymentForm.minThreshold) : null,
        minFlatRate: paymentForm.minFlatRate ? Number(paymentForm.minFlatRate) : null,
      },
    });
  };

  // Add member state
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("session_player");
  const [newMemberCustomRole, setNewMemberCustomRole] = useState("");

  const addMemberMutation = useMutation({
    mutationFn: (data: { name: string; role: string; customRole?: string }) =>
      apiRequest("POST", "/api/band-members", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/band-members"] });
      setNewMemberName("");
      setNewMemberRole("session_player");
      setNewMemberCustomRole("");
      toast({ title: "Member added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role, customRole }: { id: string; role: string; customRole?: string | null }) =>
      apiRequest("PATCH", `/api/band-members/${id}`, { role, customRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/band-members"] });
      toast({ title: "Role updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/band-members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/band-members"] });
      toast({ title: "Member removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Account management
  const [accountMemberId, setAccountMemberId] = useState<string | null>(null);
  const [accountUsername, setAccountUsername] = useState("");
  const [accountPassword, setAccountPassword] = useState("");

  const createAccountMutation = useMutation({
    mutationFn: ({ id, username, password }: { id: string; username: string; password: string }) =>
      apiRequest("POST", `/api/band-members/${id}/create-account`, { username, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/band-members"] });
      setAccountMemberId(null);
      setAccountUsername("");
      setAccountPassword("");
      toast({ title: "Account created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [resetMemberId, setResetMemberId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiRequest("POST", `/api/band-members/${id}/reset-password`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/band-members"] });
      setResetMemberId(null);
      setResetPassword("");
      toast({ title: "Password reset" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [deleteAccountMemberId, setDeleteAccountMemberId] = useState<string | null>(null);

  const deleteAccountMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/band-members/${id}/delete-account`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/band-members"] });
      setDeleteAccountMemberId(null);
      toast({ title: "Account deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editCustomRole, setEditCustomRole] = useState("");

  // Show types management
  const [newTypeName, setNewTypeName] = useState("");
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editTypeName, setEditTypeName] = useState("");

  const addTypeMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/show-types", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/show-types"] });
      setNewTypeName("");
      toast({ title: "Show type added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiRequest("PATCH", `/api/show-types/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/show-types"] });
      setEditingTypeId(null);
      toast({ title: "Show type updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/show-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/show-types"] });
      toast({ title: "Show type removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isLoading = isLoadingMembers || isLoadingTypes;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-settings-heading">
          <SettingsIcon className="w-5 h-5" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Payment configs, band members, and show types
        </p>
      </div>

      {/* Payment Configs per Member */}
      <CollapsibleSection
        title="Payment Configs"
        icon={DollarSign}
        description="Per-member payment rules used in payout calculations"
        defaultOpen={true}
        testId="payment-configs"
      >
        <div className="space-y-3">
          {bandMembers.map((member) => (
            <div key={member.id} className="p-3 border rounded-md space-y-2" data-testid={`payment-config-${member.id}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{member.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">
                      {member.paymentType === "percentage" ? (
                        <><Percent className="w-2.5 h-2.5 mr-0.5" />{member.normalRate}%</>
                      ) : (
                        <><DollarSign className="w-2.5 h-2.5 mr-0.5" />Rs {(member.normalRate ?? 0).toLocaleString()}</>
                      )}
                    </Badge>
                    {member.paymentType === "percentage" && member.referralRate && (
                      <Badge variant="outline" className="text-[10px]">
                        Referral: {member.referralRate}%
                      </Badge>
                    )}
                    {member.hasMinLogic && (
                      <Badge variant="outline" className="text-[10px]">
                        Min logic
                      </Badge>
                    )}
                  </div>
                </div>
                {editingPaymentId !== member.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEditPayment(member)}
                    data-testid={`button-edit-payment-${member.id}`}
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>

              {editingPaymentId === member.id && (
                <div className="space-y-3 pt-2 border-t">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Type</label>
                    <Select
                      value={paymentForm.paymentType}
                      onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentType: v })}
                    >
                      <SelectTrigger data-testid={`select-payment-type-${member.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed Amount (Rs)</SelectItem>
                        <SelectItem value="percentage">Percentage of Net (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        {paymentForm.paymentType === "percentage" ? "Normal Rate (%)" : "Fixed Rate (Rs)"}
                      </label>
                      <Input
                        type="number"
                        value={paymentForm.normalRate}
                        onChange={(e) => setPaymentForm({ ...paymentForm, normalRate: e.target.value })}
                        placeholder={paymentForm.paymentType === "percentage" ? "e.g. 15" : "e.g. 15000"}
                        data-testid={`input-normal-rate-${member.id}`}
                      />
                    </div>

                    {paymentForm.paymentType === "percentage" && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                          Referral Rate (%)
                        </label>
                        <Input
                          type="number"
                          value={paymentForm.referralRate}
                          onChange={(e) => setPaymentForm({ ...paymentForm, referralRate: e.target.value })}
                          placeholder="e.g. 33"
                          data-testid={`input-referral-rate-${member.id}`}
                        />
                      </div>
                    )}
                  </div>

                  {paymentForm.paymentType === "percentage" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={paymentForm.hasMinLogic}
                          onCheckedChange={(v) => setPaymentForm({ ...paymentForm, hasMinLogic: v })}
                          data-testid={`switch-min-logic-${member.id}`}
                        />
                        <label className="text-xs font-medium">
                          Enable minimum value logic
                        </label>
                      </div>

                      {paymentForm.hasMinLogic && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">
                              Threshold (Rs)
                            </label>
                            <Input
                              type="number"
                              value={paymentForm.minThreshold}
                              onChange={(e) => setPaymentForm({ ...paymentForm, minThreshold: e.target.value })}
                              placeholder="e.g. 100000"
                              data-testid={`input-min-threshold-${member.id}`}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              If show total is below this, use flat rate instead
                            </p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">
                              Flat Rate (Rs)
                            </label>
                            <Input
                              type="number"
                              value={paymentForm.minFlatRate}
                              onChange={(e) => setPaymentForm({ ...paymentForm, minFlatRate: e.target.value })}
                              placeholder="e.g. 15000"
                              data-testid={`input-min-flat-rate-${member.id}`}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Base flat rate, minus % of expenses
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => savePaymentConfig(member.id)}
                      disabled={updatePaymentMutation.isPending}
                      data-testid={`button-save-payment-${member.id}`}
                    >
                      {updatePaymentMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <><Save className="w-3 h-3 mr-1" />Save</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingPaymentId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {bandMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">
              Add band members below to configure their payment rules
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground text-xs">How Payouts Work</p>
          <p>1. Total amount minus expenses = net amount</p>
          <p>2. Each member is paid based on their config (fixed or % of net)</p>
          <p>3. Referral shows use the referral rate instead</p>
          <p>4. Min logic: below threshold, member gets flat rate minus % of expenses</p>
          <p>5. Haider Jamil gets the remainder after all payouts</p>
        </div>
      </CollapsibleSection>

      {/* Band Members */}
      <CollapsibleSection
        title="Band Members"
        icon={Users}
        description="Manage members, roles, and login accounts"
        defaultOpen={true}
        testId="band-members"
      >
        <div className="space-y-3">
          {bandMembers.map((member) => (
            <div key={member.id} className="p-3 border rounded-md space-y-2" data-testid={`band-member-${member.id}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{member.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">
                      {getRoleLabel(member.role, member.customRole)}
                    </Badge>
                    {member.userId ? (
                      <Badge variant="outline" className="text-[10px]">
                        <UserCheck className="w-2.5 h-2.5 mr-0.5" />
                        Has Account
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        <UserX className="w-2.5 h-2.5 mr-0.5" />
                        No Account
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                  {editingRoleId === member.id ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select
                        value={editRole}
                        onValueChange={(v) => {
                          setEditRole(v);
                          if (v !== "custom") setEditCustomRole("");
                        }}
                      >
                        <SelectTrigger className="w-[140px]" data-testid={`select-role-${member.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editRole === "custom" && (
                        <Input
                          value={editCustomRole}
                          onChange={(e) => setEditCustomRole(e.target.value)}
                          placeholder="e.g. Sound Engineer"
                          className="w-[140px]"
                          data-testid={`input-custom-role-${member.id}`}
                        />
                      )}
                      <Button
                        size="sm"
                        onClick={() => {
                          updateRoleMutation.mutate({
                            id: member.id,
                            role: editRole,
                            customRole: editRole === "custom" ? editCustomRole : null,
                          });
                          setEditingRoleId(null);
                        }}
                        data-testid={`button-save-role-${member.id}`}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingRoleId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingRoleId(member.id);
                        setEditRole(member.role);
                        setEditCustomRole(member.customRole || "");
                      }}
                      data-testid={`button-edit-role-${member.id}`}
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      Change Role
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-2 flex-wrap">
                {!member.userId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAccountMemberId(member.id);
                      setAccountUsername("");
                      setAccountPassword("");
                    }}
                    data-testid={`button-create-account-${member.id}`}
                  >
                    <UserPlus className="w-3 h-3 mr-1" />
                    Create Account
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setResetMemberId(member.id);
                        setResetPassword("");
                      }}
                      data-testid={`button-reset-password-${member.id}`}
                    >
                      <KeyRound className="w-3 h-3 mr-1" />
                      Reset Password
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteAccountMemberId(member.id)}
                      data-testid={`button-delete-account-${member.id}`}
                    >
                      <UserX className="w-3 h-3 mr-1" />
                      Remove Access
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`Remove ${member.name} from the band?`)) {
                      deleteMemberMutation.mutate(member.id);
                    }
                  }}
                  data-testid={`button-delete-member-${member.id}`}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          ))}

          {bandMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-band-members">
              No band members added yet
            </p>
          )}
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-muted-foreground" />
            Add New Member
          </h3>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
              <Input
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Member name"
                data-testid="input-new-member-name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
              <Select value={newMemberRole} onValueChange={(v) => {
                setNewMemberRole(v);
                if (v !== "custom") setNewMemberCustomRole("");
              }}>
                <SelectTrigger className="w-[150px]" data-testid="select-new-member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newMemberRole === "custom" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Custom Role</label>
                <Input
                  value={newMemberCustomRole}
                  onChange={(e) => setNewMemberCustomRole(e.target.value)}
                  placeholder="e.g. Sound Engineer"
                  className="w-[150px]"
                  data-testid="input-new-member-custom-role"
                />
              </div>
            )}
            <Button
              onClick={() => {
                if (!newMemberName.trim()) {
                  toast({ title: "Error", description: "Name is required", variant: "destructive" });
                  return;
                }
                addMemberMutation.mutate({
                  name: newMemberName.trim(),
                  role: newMemberRole,
                  customRole: newMemberRole === "custom" ? newMemberCustomRole : undefined,
                });
              }}
              disabled={addMemberMutation.isPending}
              data-testid="button-add-member"
            >
              {addMemberMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <><UserPlus className="w-4 h-4 mr-1" />Add</>
              )}
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Show Types */}
      <CollapsibleSection
        title="Show Types"
        icon={Tag}
        description="Manage the types of shows available"
        defaultOpen={false}
        testId="show-types"
      >
        <div className="space-y-2">
          {showTypes.map((type) => (
            <div
              key={type.id}
              className="flex items-center justify-between gap-2 p-2.5 border rounded-md"
              data-testid={`show-type-${type.id}`}
            >
              {editingTypeId === type.id ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <Input
                    value={editTypeName}
                    onChange={(e) => setEditTypeName(e.target.value)}
                    className="flex-1 min-w-[120px]"
                    data-testid={`input-edit-type-${type.id}`}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (editTypeName.trim()) {
                        updateTypeMutation.mutate({ id: type.id, name: editTypeName.trim() });
                      }
                    }}
                    disabled={updateTypeMutation.isPending}
                    data-testid={`button-save-type-${type.id}`}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingTypeId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-sm">{type.name}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingTypeId(type.id);
                        setEditTypeName(type.name);
                      }}
                      data-testid={`button-edit-type-${type.id}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete show type "${type.name}"? Existing shows with this type won't be affected.`)) {
                          deleteTypeMutation.mutate(type.id);
                        }
                      }}
                      data-testid={`button-delete-type-${type.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}

          {showTypes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">
              No show types configured
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder="New show type name"
            className="flex-1"
            data-testid="input-new-show-type"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTypeName.trim()) {
                addTypeMutation.mutate(newTypeName.trim());
              }
            }}
          />
          <Button
            onClick={() => {
              if (newTypeName.trim()) {
                addTypeMutation.mutate(newTypeName.trim());
              }
            }}
            disabled={addTypeMutation.isPending || !newTypeName.trim()}
            data-testid="button-add-show-type"
          >
            {addTypeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><Plus className="w-4 h-4 mr-1" />Add</>
            )}
          </Button>
        </div>
      </CollapsibleSection>

      {/* Create Account Dialog */}
      <AlertDialog open={!!accountMemberId} onOpenChange={(open) => { if (!open) setAccountMemberId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Create Account
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>
                  Set up a login account for{" "}
                  <span className="font-medium text-foreground">
                    {bandMembers.find((m) => m.id === accountMemberId)?.name}
                  </span>
                </p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Username</label>
                  <Input
                    value={accountUsername}
                    onChange={(e) => setAccountUsername(e.target.value)}
                    placeholder="e.g. zain"
                    data-testid="input-account-username"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Password (min 6 characters)</label>
                  <Input
                    type="password"
                    value={accountPassword}
                    onChange={(e) => setAccountPassword(e.target.value)}
                    placeholder="Set a password"
                    data-testid="input-account-password"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-account">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (accountMemberId && accountUsername && accountPassword) {
                  createAccountMutation.mutate({
                    id: accountMemberId,
                    username: accountUsername,
                    password: accountPassword,
                  });
                }
              }}
              disabled={!accountUsername || accountPassword.length < 6}
              data-testid="button-confirm-account"
            >
              Create Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <AlertDialog open={!!resetMemberId} onOpenChange={(open) => { if (!open) setResetMemberId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Reset Password
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>
                  Set a new password for{" "}
                  <span className="font-medium text-foreground">
                    {bandMembers.find((m) => m.id === resetMemberId)?.name}
                  </span>
                </p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">New Password (min 6 characters)</label>
                  <Input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="New password"
                    data-testid="input-reset-password"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reset">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resetMemberId && resetPassword) {
                  resetPasswordMutation.mutate({ id: resetMemberId, password: resetPassword });
                }
              }}
              disabled={resetPassword.length < 6}
              data-testid="button-confirm-reset"
            >
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Dialog */}
      <AlertDialog open={!!deleteAccountMemberId} onOpenChange={(open) => { if (!open) setDeleteAccountMemberId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserX className="w-5 h-5 text-destructive" />
              Remove Access
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the login account for{" "}
              <span className="font-medium text-foreground">
                {bandMembers.find((m) => m.id === deleteAccountMemberId)?.name}
              </span>
              . They will no longer be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-account">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (deleteAccountMemberId) {
                  deleteAccountMutation.mutate(deleteAccountMemberId);
                }
              }}
              data-testid="button-confirm-delete-account"
            >
              Remove Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

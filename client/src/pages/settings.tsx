import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon, Save, Loader2, Percent, DollarSign,
  Users, UserPlus, Shield, KeyRound, Trash2, UserCheck, UserX,
} from "lucide-react";
import { useState, useEffect } from "react";

interface BandMember {
  id: string;
  name: string;
  role: string;
  customRole: string | null;
  userId: string | null;
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

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentSettings, isLoading: isLoadingSettings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const { data: bandMembers = [], isLoading: isLoadingMembers } = useQuery<BandMember[]>({
    queryKey: ["/api/band-members"],
  });

  const [form, setForm] = useState({
    session_player_percentage: "15",
    referral_percentage: "33",
    wahab_fixed_rate: "15000",
    manager_default_rate: "3000",
  });

  useEffect(() => {
    if (currentSettings) {
      setForm({
        session_player_percentage: currentSettings.session_player_percentage || "15",
        referral_percentage: currentSettings.referral_percentage || "33",
        wahab_fixed_rate: currentSettings.wahab_fixed_rate || "15000",
        manager_default_rate: currentSettings.manager_default_rate || "3000",
      });
    }
  }, [currentSettings]);

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("PUT", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved", description: "Changes will apply to future shows only." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
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
      toast({ title: "Member added", description: "New band member has been added." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Update member role
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

  // Delete band member
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

  // Create account state
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
      toast({ title: "Account created", description: "Member can now log in with these credentials." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Reset password state
  const [resetMemberId, setResetMemberId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiRequest("POST", `/api/band-members/${id}/reset-password`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/band-members"] });
      setResetMemberId(null);
      setResetPassword("");
      toast({ title: "Password reset", description: "New password has been set." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Delete account
  const [deleteAccountMemberId, setDeleteAccountMemberId] = useState<string | null>(null);

  const deleteAccountMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/band-members/${id}/delete-account`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/band-members"] });
      setDeleteAccountMemberId(null);
      toast({ title: "Account deleted", description: "Member's access has been revoked." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Edit role state per member
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editCustomRole, setEditCustomRole] = useState("");

  const isLoading = isLoadingSettings || isLoadingMembers;

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
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-settings-heading">
          <SettingsIcon className="w-5 h-5" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage payment rates, member roles, and accounts
        </p>
      </div>

      {/* Payment Rates */}
      <Card>
        <CardContent className="pt-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              Payment Rates
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Configure default payment rates for band members. Changes apply to new shows only.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <Percent className="w-4 h-4 text-muted-foreground" />
              Session Player Rates
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Default percentages applied to the net amount (after expenses)
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Zain Shahid - Normal Rate (%)
                </label>
                <Input
                  type="number"
                  value={form.session_player_percentage}
                  onChange={(e) => setForm({ ...form, session_player_percentage: e.target.value })}
                  data-testid="input-session-percentage"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Zain Shahid - Referral Rate (%)
                </label>
                <Input
                  type="number"
                  value={form.referral_percentage}
                  onChange={(e) => setForm({ ...form, referral_percentage: e.target.value })}
                  data-testid="input-referral-percentage"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              Fixed Rates (Rs)
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Default fixed amounts per show
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Wahab - Per Show Rate (Rs)
                </label>
                <Input
                  type="number"
                  value={form.wahab_fixed_rate}
                  onChange={(e) => setForm({ ...form, wahab_fixed_rate: e.target.value })}
                  data-testid="input-wahab-rate"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Hassan - Manager Rate (Rs)
                </label>
                <Input
                  type="number"
                  value={form.manager_default_rate}
                  onChange={(e) => setForm({ ...form, manager_default_rate: e.target.value })}
                  data-testid="input-manager-rate"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="pt-2">
            <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-settings">
              {saveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" />Save Payment Rates</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Member Roles & Management */}
      <Card>
        <CardContent className="pt-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-muted-foreground" />
              Band Members
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Manage band members, assign roles, and create login accounts
            </p>
          </div>

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
                    Remove Member
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
        </CardContent>
      </Card>

      {/* How Payouts Work */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold mb-3">How Payouts Work</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>1. Total show amount is taken</p>
            <p>2. All expenses (car, food, etc.) are subtracted to get the net amount</p>
            <p>3. Session players are paid based on their rate type:</p>
            <div className="pl-4 space-y-1">
              <p>Zain Shahid: {form.session_player_percentage}% of net (or {form.referral_percentage}% if he referred the show)</p>
              <p>Wahab: Fixed Rs {Number(form.wahab_fixed_rate).toLocaleString()} per show</p>
              <p>Other players: Manual amount entered per show</p>
            </div>
            <p>4. Manager (Hassan) is paid Rs {Number(form.manager_default_rate).toLocaleString()} by default</p>
            <p>5. The remaining amount goes to Haider Jamil (Admin)</p>
          </div>
        </CardContent>
      </Card>

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
              . They will no longer be able to log in. This does not remove them from the band.
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

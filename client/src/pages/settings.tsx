import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Save, Loader2, Percent, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentSettings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
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
          Configure default payment rates for band members. Changes apply to new shows only.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
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
                <><Save className="w-4 h-4 mr-2" />Save Settings</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drum, Eye, EyeOff, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err.message?.includes("401")
          ? "Invalid username or password"
          : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecovery = async () => {
    if (!recoveryKey.trim()) {
      toast({ title: "Recovery key is required", variant: "destructive" });
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setRecoveryLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/emergency-reset", {
        recoveryKey: recoveryKey.trim(),
        newPassword,
      });
      const data = await res.json();
      toast({ title: "Password Reset", description: data.message });
      setRecoveryOpen(false);
      setRecoveryKey("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      toast({ title: "Reset Failed", description: err.message, variant: "destructive" });
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-4">
            <Drum className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="text-app-title">
            Drum Circle Pakistan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Band Management System</p>
        </div>

        <Card>
          <CardContent className="pt-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="username">
                  Username
                </label>
                <Input
                  id="username"
                  data-testid="input-username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    data-testid="input-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={isLoading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    data-testid="button-toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                data-testid="button-login"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setRecoveryOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-forgot-password"
              >
                Forgot Password?
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Drum Circle Pakistan
        </p>
      </div>

      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Admin Password</DialogTitle>
            <DialogDescription>
              Enter your recovery key and a new password to reset your admin account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="recovery-key">Recovery Key</label>
              <Input
                id="recovery-key"
                data-testid="input-recovery-key"
                type="password"
                placeholder="Enter recovery key"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="recovery-new-pw">New Password</label>
              <Input
                id="recovery-new-pw"
                data-testid="input-recovery-new-password"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="recovery-confirm-pw">Confirm New Password</label>
              <Input
                id="recovery-confirm-pw"
                data-testid="input-recovery-confirm-password"
                type="password"
                placeholder="Confirm new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoveryOpen(false)} data-testid="button-cancel-recovery">
              Cancel
            </Button>
            <Button
              onClick={handleRecovery}
              disabled={recoveryLoading || !recoveryKey.trim() || !newPassword || !confirmNewPassword}
              data-testid="button-submit-recovery"
            >
              {recoveryLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

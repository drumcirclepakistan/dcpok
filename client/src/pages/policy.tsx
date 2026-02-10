import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import {
  FileText, DollarSign, TrendingUp, ArrowRight,
  AlertTriangle, Info,
} from "lucide-react";

interface PolicyData {
  name: string;
  role: string;
  customRole?: string | null;
  paymentType: string;
  normalRate: number;
  referralRate?: number | null;
  hasMinLogic: boolean;
  minThreshold?: number | null;
  minFlatRate?: number | null;
}

export default function PolicyPage() {
  const { isMember } = useAuth();
  const [, navigate] = useLocation();

  const { data: policy, isLoading } = useQuery<PolicyData>({
    queryKey: ["/api/member/policy"],
    enabled: isMember,
  });

  if (!isMember) {
    navigate("/");
    return null;
  }

  const roleName = policy?.role === "session_player"
    ? "Session Player"
    : policy?.role === "manager"
      ? "Manager"
      : policy?.customRole || policy?.role || "Member";

  const buildPolicyDescription = (p: PolicyData): string[] => {
    const lines: string[] = [];

    if (p.paymentType === "fixed") {
      lines.push(`You receive a fixed payment of Rs ${p.normalRate.toLocaleString()} per show.`);
      lines.push("This amount remains the same regardless of the show's total amount or expenses.");
    } else if (p.paymentType === "percentage") {
      lines.push(`You receive ${p.normalRate}% of the net amount (total show amount minus all expenses) for each show.`);

      if (p.referralRate) {
        lines.push(`When you refer a show, your rate increases to ${p.referralRate}% of the net amount instead of the standard ${p.normalRate}%.`);
      }

      if (p.hasMinLogic && p.minThreshold && p.minFlatRate) {
        lines.push(`If the total show amount is below Rs ${p.minThreshold.toLocaleString()}, a minimum payment logic applies: you receive a flat rate of Rs ${p.minFlatRate.toLocaleString()}, minus a deduction of ${p.normalRate}% of the show's total expenses.`);
      }
    }

    return lines;
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-policy-heading">
          Payout Policy
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your payment structure as configured by the admin
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : policy ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold" data-testid="text-policy-name">{policy.name}</p>
                  <Badge variant="secondary" className="text-[10px] mt-0.5" data-testid="text-policy-role">{roleName}</Badge>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    Payment Type
                  </h3>
                  <Badge variant="outline" data-testid="text-payment-type">
                    {policy.paymentType === "fixed" ? "Fixed Amount" : "Percentage Based"}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    Your Rate
                  </h3>
                  <p className="text-2xl font-bold text-primary" data-testid="text-rate-value">
                    {policy.paymentType === "fixed"
                      ? `Rs ${policy.normalRate.toLocaleString()}`
                      : `${policy.normalRate}%`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {policy.paymentType === "fixed" ? "per show" : "of net amount (after expenses)"}
                  </p>
                </div>

                {policy.paymentType === "percentage" && policy.referralRate && (
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      Referral Rate
                    </h3>
                    <p className="text-2xl font-bold text-primary" data-testid="text-referral-rate">
                      {policy.referralRate}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      of net amount when you refer a show
                    </p>
                  </div>
                )}

                {policy.paymentType === "percentage" && policy.hasMinLogic && policy.minThreshold && policy.minFlatRate && (
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                      Minimum Payment Rule
                    </h3>
                    <div className="space-y-1">
                      <p className="text-sm" data-testid="text-min-threshold">
                        When the total show amount is below <span className="font-semibold">Rs {policy.minThreshold.toLocaleString()}</span>:
                      </p>
                      <p className="text-sm text-muted-foreground" data-testid="text-min-flat-rate">
                        You receive a flat rate of <span className="font-semibold text-foreground">Rs {policy.minFlatRate.toLocaleString()}</span>, minus {policy.normalRate}% of the show's total expenses.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-muted-foreground" />
                Policy Summary
              </h3>
              <div className="space-y-2">
                {buildPolicyDescription(policy).map((line, i) => (
                  <p key={i} className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-policy-line-${i}`}>
                    {line}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground italic" data-testid="text-policy-note">
            This policy is set and managed by the admin. If you have questions about your payout structure, please contact the admin directly.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center justify-center">
            <FileText className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No payout policy found. Please contact the admin.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

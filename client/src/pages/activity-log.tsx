import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, LogIn, Plus, Trash2, CreditCard, Users, Music, Pencil } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string | null;
  createdAt: string;
}

const actionConfig: Record<string, { label: string; icon: typeof LogIn; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  login: { label: "Login", icon: LogIn, variant: "secondary" },
  show_created: { label: "Show Created", icon: Plus, variant: "default" },
  show_updated: { label: "Show Updated", icon: Pencil, variant: "outline" },
  show_deleted: { label: "Show Deleted", icon: Trash2, variant: "destructive" },
  show_marked_paid: { label: "Marked Paid", icon: CreditCard, variant: "default" },
  show_marked_unpaid: { label: "Marked Unpaid", icon: CreditCard, variant: "outline" },
  members_updated: { label: "Band Updated", icon: Users, variant: "secondary" },
};

export default function ActivityLogPage() {
  const { data: logs = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs"],
  });

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="w-5 h-5" />
        <h1 className="text-xl font-bold" data-testid="text-activity-log-title">Activity Log</h1>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No activity recorded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const config = actionConfig[log.action] || { label: log.action, icon: Music, variant: "outline" as const };
            const Icon = config.icon;
            return (
              <Card key={log.id} data-testid={`activity-log-${log.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{log.userName}</span>
                        <Badge variant={config.variant} className="text-[10px]">
                          {config.label}
                        </Badge>
                      </div>
                      {log.details && (
                        <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{log.details}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

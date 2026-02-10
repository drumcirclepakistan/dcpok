import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { insertShowSchema, type InsertShow, type Show } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, User, Phone, Mail, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState, useCallback } from "react";

interface ConflictShow {
  id: string;
  title: string;
  city: string;
  showType: string;
  showDate: string;
}

export default function ShowForm() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id && id !== "new";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isMember } = useAuth();
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictShows, setConflictShows] = useState<ConflictShow[]>([]);
  const [pendingData, setPendingData] = useState<InsertShow | null>(null);

  const { data: existingShow, isLoading: isLoadingShow } = useQuery<Show>({
    queryKey: ["/api/shows", id],
    enabled: isEditing,
  });

  const { data: showTypes = [] } = useQuery<{ id: string; name: string; showOrgField: boolean; showPublicField: boolean }[]>({
    queryKey: ["/api/show-types"],
  });

  const form = useForm<InsertShow>({
    resolver: zodResolver(insertShowSchema),
    defaultValues: {
      title: "",
      city: "",
      showType: "Corporate",
      organizationName: "",
      publicShowFor: "",
      totalAmount: 0,
      advancePayment: 0,
      showDate: new Date(),
      status: "upcoming",
      notes: "",
      pocName: "",
      pocPhone: "",
      pocEmail: "",
    },
  });

  useEffect(() => {
    if (existingShow) {
      form.reset({
        title: existingShow.title,
        city: existingShow.city,
        showType: existingShow.showType,
        organizationName: existingShow.organizationName || "",
        publicShowFor: existingShow.publicShowFor || "",
        totalAmount: existingShow.totalAmount,
        advancePayment: existingShow.advancePayment,
        showDate: new Date(existingShow.showDate),
        status: existingShow.status,
        notes: existingShow.notes || "",
        pocName: existingShow.pocName || "",
        pocPhone: existingShow.pocPhone || "",
        pocEmail: existingShow.pocEmail || "",
      });
    }
  }, [existingShow, form]);

  const mutation = useMutation({
    mutationFn: async (data: InsertShow) => {
      if (isEditing) {
        return apiRequest("PATCH", `/api/shows/${id}`, data);
      }
      const endpoint = isMember ? "/api/member/shows" : "/api/shows";
      return apiRequest("POST", endpoint, data);
    },
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/member/shows"] });
      toast({
        title: isEditing ? "Show updated" : "Show added",
        description: isEditing
          ? "The show has been updated successfully"
          : "New show has been added to your schedule",
      });
      if (!isEditing) {
        const show = await res.json();
        if (isMember) {
          navigate("/shows");
        } else {
          navigate(`/shows/${show.id}`);
        }
      } else {
        navigate(`/shows/${id}`);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const checkDateConflicts = useCallback(async (data: InsertShow) => {
    try {
      const dateStr = new Date(data.showDate).toISOString();
      const params = new URLSearchParams({ date: dateStr });
      if (isEditing && id) params.set("excludeId", id);
      const res = await fetch(`/api/shows/check-date?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return json.conflicts as ConflictShow[];
    } catch {
      return [];
    }
  }, [isEditing, id]);

  const onSubmit = async (data: InsertShow) => {
    const conflicts = await checkDateConflicts(data);
    if (conflicts.length > 0) {
      setConflictShows(conflicts);
      setPendingData(data);
      setShowConflictDialog(true);
      return;
    }
    mutation.mutate(data);
  };

  const handleConfirmConflict = () => {
    setShowConflictDialog(false);
    if (pendingData) {
      mutation.mutate(pendingData);
      setPendingData(null);
    }
  };

  const handleCancelConflict = () => {
    setShowConflictDialog(false);
    setPendingData(null);
  };

  const selectedShowType = form.watch("showType");
  const selectedTypeConfig = showTypes.find(t => t.name === selectedShowType);
  const showOrgField = selectedTypeConfig?.showOrgField ?? false;
  const showPublicField = selectedTypeConfig?.showPublicField ?? false;

  if (isEditing && isLoadingShow) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
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
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate(isEditing ? `/shows/${id}` : "/shows")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-form-heading">
            {isEditing ? "Edit Show" : "Add New Show"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEditing ? "Update show details" : "Schedule a new performance"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Show Title</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-title" placeholder="e.g. Annual Drum Night" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-city" placeholder="e.g. Karachi" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="showType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Show Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-show-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {showTypes.map((type) => (
                            <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {showOrgField && (
                <FormField
                  control={form.control}
                  name="organizationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization Name (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          data-testid="input-organization"
                          placeholder="e.g. Unilever, Jazz, LUMS"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {showPublicField && (
                <FormField
                  control={form.control}
                  name="publicShowFor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Public Show For (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          data-testid="input-public-show-for"
                          placeholder="e.g. Cafe Aylanto, Monal Restaurant"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="showDate"
                render={({ field }) => {
                  let dateStr = "";
                  try {
                    const d = field.value ? new Date(field.value) : null;
                    if (d && !isNaN(d.getTime())) {
                      dateStr = format(d, "yyyy-MM-dd'T'HH:mm");
                    }
                  } catch {}
                  return (
                    <FormItem>
                      <FormLabel>Date & Time</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          data-testid="input-show-date"
                          value={dateStr}
                          onChange={(e) => {
                            if (e.target.value) field.onChange(new Date(e.target.value));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Amount (Rs)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-total-amount"
                          placeholder="0"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="advancePayment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Advance Payment (Rs)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          data-testid="input-advance-payment"
                          placeholder="0"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {isEditing && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "upcoming"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="upcoming">Upcoming</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Contact Person (Optional)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="pocName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Name</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-poc-name" placeholder="Contact name" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pocPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Phone</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-poc-phone" placeholder="03XX-XXXXXXX" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pocEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Email</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-poc-email" placeholder="email@example.com" type="email" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value || ""}
                        data-testid="input-notes"
                        placeholder="Any additional details about the show..."
                        className="resize-none"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-3 pt-2 flex-wrap">
                <Button type="submit" disabled={mutation.isPending} data-testid="button-save-show">
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {isEditing ? "Update Show" : "Add Show"}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(isEditing ? `/shows/${id}` : "/shows")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Show Date Conflict
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {conflictShows.length === 1
                    ? "Another show is already scheduled on the same day:"
                    : `${conflictShows.length} other shows are already scheduled on the same day:`}
                </p>
                <div className="space-y-2">
                  {conflictShows.map((s) => (
                    <div key={s.id} className="p-2 border rounded-md">
                      <p className="text-sm font-medium text-foreground">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.city} - {s.showType} - {format(new Date(s.showDate), "h:mm a")}
                      </p>
                    </div>
                  ))}
                </div>
                <p>Do you still wish to continue?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConflict} data-testid="button-conflict-no">
              No
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmConflict} data-testid="button-conflict-yes">
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

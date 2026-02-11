import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  FileText,
  Download,
  Trash2,
  Search,
  Plus,
  Calendar as CalendarIcon,
  Filter,
  Pencil,
  X,
  Share2,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import type { Invoice, InvoiceItem, BandMember } from "@shared/schema";
import jsPDF from "jspdf";
import { LOGO_BASE64 } from "@/lib/invoice-logo";

const BRAND_R = 237;
const BRAND_G = 120;
const BRAND_B = 37;

function getInvoiceItems(invoice: Invoice): InvoiceItem[] {
  if (invoice.items) {
    try {
      const parsed = JSON.parse(invoice.items);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return [{
    city: invoice.city,
    numberOfDrums: invoice.numberOfDrums,
    duration: invoice.duration,
    eventDate: typeof invoice.eventDate === "string" ? invoice.eventDate : new Date(invoice.eventDate).toISOString(),
    amount: invoice.amount,
  }];
}

function generateInvoicePDF(invoice: Invoice) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const marginLeft = 18;
  const marginRight = 18;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const rightEdge = pageWidth - marginRight;

  const typeLabel = invoice.type === "invoice" ? "INVOICE" : "QUOTATION";
  const createdDateStr = format(new Date(invoice.createdAt), "dd MMM yyyy");
  const items = getInvoiceItems(invoice);
  const totalAmount = items.reduce((sum, it) => sum + it.amount, 0);

  doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
  doc.rect(0, 0, pageWidth, 3.5, "F");

  try {
    const logoW = 24;
    const logoH = 18;
    doc.addImage(LOGO_BASE64, "PNG", marginLeft, 8, logoW, logoH);
  } catch {}

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(BRAND_R, BRAND_G, BRAND_B);
  doc.text(typeLabel, rightEdge, 18, { align: "right" });

  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.displayNumber, rightEdge, 24, { align: "right" });
  doc.text(`Date: ${createdDateStr}`, rightEdge, 29, { align: "right" });

  let y = 36;
  doc.setDrawColor(BRAND_R, BRAND_G, BRAND_B);
  doc.setLineWidth(0.5);
  doc.line(marginLeft, y, rightEdge, y);

  y += 7;
  doc.setTextColor(110, 110, 110);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("BILL TO", marginLeft, y);

  y += 5;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(invoice.billTo, marginLeft, y);

  y += 9;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(marginLeft, y, contentWidth, 7.5, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text("DESCRIPTION", marginLeft + 3, y + 5);
  doc.text("AMOUNT", rightEdge - 3, y + 5, { align: "right" });

  y += 11;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const eventDateStr = format(new Date(item.eventDate), "dd MMM yyyy");
    const desc = `Drum Circle \u2013 ${item.city} \u2013 ${eventDateStr} \u2013 ${item.numberOfDrums} Drums \u2013 ${item.duration}`;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    const descLines = doc.splitTextToSize(desc, contentWidth - 45);
    doc.text(descLines, marginLeft + 3, y);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(`Rs ${item.amount.toLocaleString()}`, rightEdge - 3, y, { align: "right" });

    y += descLines.length * 4.2 + 3;

    if (i < items.length - 1) {
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.15);
      doc.line(marginLeft + 3, y, rightEdge - 3, y);
      y += 3;
    }
  }

  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, rightEdge, y);

  y += 5;
  doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
  doc.roundedRect(rightEdge - 65, y - 1, 65, 9, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL", rightEdge - 61, y + 5);
  doc.text(`Rs ${totalAmount.toLocaleString()}`, rightEdge - 3, y + 5, { align: "right" });

  y += 13;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  if (invoice.taxMode === "inclusive") {
    doc.text("All taxes inclusive.", marginLeft, y);
  } else {
    doc.text("Exclusive of all taxes. Any applicable taxes will be charged separately.", marginLeft, y);
  }

  y += 10;
  doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
  doc.roundedRect(marginLeft, y - 1, contentWidth, 7.5, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("TERMS & REQUIREMENTS", marginLeft + 3, y + 4.5);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  const terms = [
    "The organizer shall provide a minimum of three (x3) microphones with three (x3) large microphone stands, along with one (x1) headset microphone and a functional sound system at the venue.",
    "Armless chairs must be arranged in accordance with the agreed number of drums confirmed prior to the event.",
    "Three to four (3-4) bottles of drinking water (room temperature) are to be made available at the time of performance.",
    "The event date will be confirmed and locked upon receipt of a 50% advance payment, which is non-refundable.",
    "The remaining 50% balance is payable before the commencement of the drum circle.",
    "Drum Circle Pakistan shall not be held liable for any losses arising from unforeseen circumstances beyond its reasonable control.",
    "The organizer is requested to provide two to three (2\u20133) support staff members to assist with loading and unloading drums between the vehicle and the activity area.",
    "In the unlikely event that Drum Circle Pakistan is unable to perform due to internal reasons, any amount paid by the client shall be refunded in full.",
  ];

  for (let i = 0; i < terms.length; i++) {
    const termText = `${i + 1}. ${terms[i]}`;
    const lines = doc.splitTextToSize(termText, contentWidth - 4);
    if (y + lines.length * 3.5 > 268) {
      doc.addPage();
      doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
      doc.rect(0, 0, pageWidth, 3.5, "F");
      y = 14;
    }
    doc.text(lines, marginLeft + 3, y);
    y += lines.length * 3.5 + 2;
  }

  y += 4;
  if (y > 235) {
    doc.addPage();
    doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
    doc.rect(0, 0, pageWidth, 3.5, "F");
    y = 14;
  }

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, rightEdge, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(BRAND_R, BRAND_G, BRAND_B);
  doc.text("PAYMENT DETAILS", marginLeft, y);
  y += 5;

  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  const bankDetails = [
    ["Account Title:", "Haider Jamil"],
    ["Account #:", "01728593801"],
    ["Bank:", "Standard Chartered Bank"],
    ["IBAN:", "PK91SCBL0000001728593801"],
    ["CNIC/NTN:", "34603-6653341-7"],
  ];
  for (const [label, value] of bankDetails) {
    doc.setFont("helvetica", "bold");
    doc.text(label, marginLeft + 3, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, marginLeft + 28, y);
    y += 4;
  }

  y += 6;
  if (y > 278) {
    doc.addPage();
    doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
    doc.rect(0, 0, pageWidth, 3.5, "F");
    y = 14;
  }

  doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
  doc.rect(0, y, pageWidth, 16, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("+92 300 459 8500  |  drumcirclepakistan@gmail.com", pageWidth / 2, y + 6, { align: "center" });
  doc.setFontSize(6.5);
  doc.text("This document is system-generated and does not require manual authorization or signature.", pageWidth / 2, y + 11, { align: "center" });

  return doc;
}

function downloadInvoicePDF(invoice: Invoice) {
  const doc = generateInvoicePDF(invoice);
  const fileName = `${invoice.type === "invoice" ? "Invoice" : "Quotation"}_${invoice.billTo.replace(/\s+/g, "_")}_${format(new Date(invoice.createdAt), "dd-MMM-yyyy")}_${Date.now()}.pdf`;
  doc.save(fileName);
}

interface ShowItemForm {
  city: string;
  numberOfDrums: string;
  duration: string;
  eventDate: Date | undefined;
  amount: string;
}

function emptyItem(): ShowItemForm {
  return { city: "", numberOfDrums: "", duration: "", eventDate: undefined, amount: "" };
}

export default function InvoiceGeneratorPage() {
  const { toast } = useToast();
  const { user, isAdmin, isMember } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [shareInvoiceId, setShareInvoiceId] = useState<string | null>(null);

  const [formType, setFormType] = useState<"invoice" | "quotation">("invoice");
  const [billTo, setBillTo] = useState("");
  const [taxMode, setTaxMode] = useState<"inclusive" | "exclusive">("exclusive");
  const [showItems, setShowItems] = useState<ShowItemForm[]>([emptyItem()]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = isAdmin || (isMember && user?.canGenerateInvoice);
  const apiBase = isAdmin ? "/api/invoices" : "/api/member/invoices";

  const { data: bandMembersList } = useQuery<BandMember[]>({
    queryKey: ["/api/band-members"],
    enabled: isAdmin,
  });

  const { data: invoicesList, isLoading } = useQuery<Invoice[]>({
    queryKey: [apiBase, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`${apiBase}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", apiBase, data);
      return res.json();
    },
    onSuccess: (invoice: Invoice) => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      toast({ title: `${invoice.type === "invoice" ? "Invoice" : "Quotation"} created`, description: invoice.displayNumber });
      downloadInvoicePDF(invoice);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `${apiBase}/${id}`, data);
      return res.json();
    },
    onSuccess: (invoice: Invoice) => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      toast({ title: `${invoice.type === "invoice" ? "Invoice" : "Quotation"} updated`, description: invoice.displayNumber });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${apiBase}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      toast({ title: "Deleted successfully" });
      setDeleteId(null);
    },
  });

  const shareMutation = useMutation({
    mutationFn: async ({ id, memberId }: { id: string; memberId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/invoices/${id}`, { sharedWithMemberId: memberId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      toast({ title: "Sharing updated" });
      setShareInvoiceId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingInvoice(null);
    setFormType("invoice");
    setBillTo("");
    setTaxMode("exclusive");
    setShowItems([emptyItem()]);
  }

  function startEdit(inv: Invoice) {
    setEditingInvoice(inv);
    setFormType(inv.type);
    setBillTo(inv.billTo);
    setTaxMode(inv.taxMode);
    const items = getInvoiceItems(inv);
    setShowItems(items.map(it => ({
      city: it.city,
      numberOfDrums: String(it.numberOfDrums),
      duration: it.duration,
      eventDate: new Date(it.eventDate),
      amount: String(it.amount),
    })));
    setShowForm(true);
  }

  function updateItem(index: number, field: keyof ShowItemForm, value: any) {
    setShowItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function addItem() {
    setShowItems(prev => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    if (showItems.length <= 1) return;
    setShowItems(prev => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    if (!billTo) {
      toast({ title: "Please enter client name", variant: "destructive" });
      return;
    }
    for (let i = 0; i < showItems.length; i++) {
      const it = showItems[i];
      if (!it.city || !it.numberOfDrums || !it.duration || !it.eventDate || !it.amount) {
        toast({ title: `Please fill all fields for Show ${i + 1}`, variant: "destructive" });
        return;
      }
    }

    const payload = {
      type: formType,
      billTo,
      taxMode,
      items: showItems.map(it => ({
        city: it.city,
        numberOfDrums: parseInt(it.numberOfDrums),
        duration: it.duration,
        eventDate: it.eventDate!.toISOString(),
        amount: parseInt(it.amount),
      })),
    };

    if (editingInvoice) {
      updateMutation.mutate({ id: editingInvoice.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function buildPreviewInvoice(): Invoice {
    const items = showItems.map(it => ({
      city: it.city || "City",
      numberOfDrums: parseInt(it.numberOfDrums) || 0,
      duration: it.duration || "TBD",
      eventDate: it.eventDate ? it.eventDate.toISOString() : new Date().toISOString(),
      amount: parseInt(it.amount) || 0,
    }));
    const totalAmount = items.reduce((s, it) => s + it.amount, 0);
    return {
      ...(editingInvoice || {
        id: "preview",
        number: 0,
        displayNumber: "DCP-XXXX",
        createdAt: new Date(),
        userId: "",
      }),
      type: formType,
      billTo: billTo || "Client Name",
      city: items[0].city,
      numberOfDrums: items[0].numberOfDrums,
      duration: items[0].duration,
      eventDate: new Date(items[0].eventDate),
      amount: totalAmount,
      taxMode,
      items: JSON.stringify(items),
    } as Invoice;
  }

  const filtered = useMemo(() => {
    if (!invoicesList) return [];
    if (!search) return invoicesList;
    const q = search.toLowerCase();
    return invoicesList.filter((inv) => {
      if (inv.billTo.toLowerCase().includes(q) || inv.displayNumber.toLowerCase().includes(q) || inv.city.toLowerCase().includes(q)) return true;
      const items = getInvoiceItems(inv);
      return items.some(it => it.city.toLowerCase().includes(q));
    });
  }, [invoicesList, search]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const formTotal = showItems.reduce((sum, it) => sum + (parseInt(it.amount) || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-invoice-page-title">Invoice Generator</h1>
          <p className="text-sm text-muted-foreground">
            {canCreate ? "Create and manage invoices & quotations" : "View shared invoices & quotations"}
          </p>
        </div>
        {!showForm && canCreate && (
          <Button onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-create-invoice">
            <Plus className="w-4 h-4 mr-1" />
            Create New
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <h2 className="text-base font-semibold">
              {editingInvoice
                ? `Edit ${editingInvoice.displayNumber}`
                : `New ${formType === "invoice" ? "Invoice" : "Quotation"}`}
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as any)}>
                  <SelectTrigger data-testid="select-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="quotation">Quotation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tax Mode</Label>
                <Select value={taxMode} onValueChange={(v) => setTaxMode(v as any)}>
                  <SelectTrigger data-testid="select-tax-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">Exclusive of Taxes</SelectItem>
                    <SelectItem value="inclusive">Inclusive of Taxes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Bill To / Client Name</Label>
                <Input
                  value={billTo}
                  onChange={(e) => setBillTo(e.target.value)}
                  placeholder="e.g. Unilever Pakistan"
                  data-testid="input-bill-to"
                />
              </div>
            </div>

            <div className="space-y-3">
              {showItems.map((item, idx) => (
                <div key={idx} className="border rounded-md p-3 space-y-2 relative">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Show {idx + 1}
                    </span>
                    {showItems.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeItem(idx)}
                        data-testid={`button-remove-item-${idx}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">City</Label>
                      <Input
                        value={item.city}
                        onChange={(e) => updateItem(idx, "city", e.target.value)}
                        placeholder="e.g. Lahore"
                        data-testid={`input-city-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Drums</Label>
                      <Input
                        type="number"
                        value={item.numberOfDrums}
                        onChange={(e) => updateItem(idx, "numberOfDrums", e.target.value)}
                        placeholder="e.g. 60"
                        data-testid={`input-drums-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Duration</Label>
                      <Input
                        value={item.duration}
                        onChange={(e) => updateItem(idx, "duration", e.target.value)}
                        placeholder="e.g. 45 to 60 Mins"
                        data-testid={`input-duration-${idx}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Event Date</Label>
                      <ItemDatePicker
                        date={item.eventDate}
                        onSelect={(d) => updateItem(idx, "eventDate", d)}
                        testId={`button-event-date-${idx}`}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Amount (Rs)</Label>
                      <Input
                        type="number"
                        value={item.amount}
                        onChange={(e) => updateItem(idx, "amount", e.target.value)}
                        placeholder="e.g. 500000"
                        data-testid={`input-amount-${idx}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={addItem} data-testid="button-add-show">
                <Plus className="w-4 h-4 mr-1" />
                Add Another Show
              </Button>
            </div>

            {formTotal > 0 && (
              <div className="text-sm font-medium text-right">
                Total: Rs {formTotal.toLocaleString()}
                {showItems.length > 1 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({showItems.length} shows)
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 justify-end flex-wrap">
              <Button variant="outline" onClick={resetForm} data-testid="button-cancel-form">
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadInvoicePDF(buildPreviewInvoice())}
                data-testid="button-preview-pdf"
              >
                <Download className="w-4 h-4 mr-1" />
                Preview PDF
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isPending}
                data-testid="button-generate"
              >
                <FileText className="w-4 h-4 mr-1" />
                {isPending
                  ? (editingInvoice ? "Saving..." : "Generating...")
                  : editingInvoice
                    ? "Save Changes"
                    : "Generate & Download"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by client, city, or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              data-testid="input-search-invoices"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-filter-type">
              <Filter className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="invoice">Invoices</SelectItem>
              <SelectItem value="quotation">Quotations</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-4 pb-4">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground" data-testid="text-empty-state">
                {search ? "No results found" : "No invoices or quotations yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((inv) => {
              const items = getInvoiceItems(inv);
              const totalAmount = items.reduce((s, it) => s + it.amount, 0);
              const cities = Array.from(new Set(items.map(it => it.city))).join(", ");
              const isOwn = inv.userId === user?.id;
              const isSharedWithMe = isMember && !isOwn && inv.sharedWithMemberId === user?.bandMemberId;
              const sharedMember = isAdmin && inv.sharedWithMemberId ? bandMembersList?.find(m => m.id === inv.sharedWithMemberId) : null;

              return (
                <Card key={inv.id} data-testid={`card-invoice-${inv.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm" data-testid={`text-invoice-number-${inv.id}`}>
                            {inv.displayNumber}
                          </span>
                          <Badge variant={inv.type === "invoice" ? "default" : "secondary"}>
                            {inv.type === "invoice" ? "Invoice" : "Quotation"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {inv.taxMode === "inclusive" ? "Taxes Inclusive" : "Taxes Exclusive"}
                          </Badge>
                          {items.length > 1 && (
                            <Badge variant="outline" className="text-[10px]">
                              {items.length} shows
                            </Badge>
                          )}
                          {isSharedWithMe && (
                            <Badge variant="outline" className="text-[10px]" data-testid={`badge-shared-${inv.id}`}>
                              <Eye className="w-3 h-3 mr-0.5" />
                              Shared with you
                            </Badge>
                          )}
                          {isAdmin && sharedMember && (
                            <Badge variant="outline" className="text-[10px]" data-testid={`badge-shared-with-${inv.id}`}>
                              <Share2 className="w-3 h-3 mr-0.5" />
                              Shared: {sharedMember.name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mt-0.5" data-testid={`text-invoice-client-${inv.id}`}>
                          {inv.billTo}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{cities}</span>
                          {items.length === 1 && (
                            <>
                              <span className="text-xs text-muted-foreground">
                                Event: {format(new Date(items[0].eventDate), "dd MMM yyyy")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {items[0].numberOfDrums} drums
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Created: {format(new Date(inv.createdAt), "dd MMM yyyy")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-sm font-semibold" data-testid={`text-invoice-amount-${inv.id}`}>
                          Rs {totalAmount.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1">
                          {(isAdmin || isOwn) && (
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => startEdit(inv)}
                              data-testid={`button-edit-${inv.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadInvoicePDF(inv)}
                            data-testid={`button-download-${inv.id}`}
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            PDF
                          </Button>
                          {isAdmin && (
                            <Dialog open={shareInvoiceId === inv.id} onOpenChange={(open) => !open && setShareInvoiceId(null)}>
                              <DialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => setShareInvoiceId(inv.id)}
                                  data-testid={`button-share-${inv.id}`}
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-sm">
                                <DialogHeader>
                                  <DialogTitle>Share {inv.displayNumber}</DialogTitle>
                                </DialogHeader>
                                <p className="text-sm text-muted-foreground">
                                  Select a band member to share this {inv.type} with, or remove sharing.
                                </p>
                                <div className="space-y-2">
                                  {inv.sharedWithMemberId && (
                                    <Button
                                      variant="outline"
                                      className="w-full"
                                      onClick={() => shareMutation.mutate({ id: inv.id, memberId: null })}
                                      disabled={shareMutation.isPending}
                                      data-testid="button-remove-share"
                                    >
                                      Remove Sharing
                                    </Button>
                                  )}
                                  {bandMembersList?.filter(m => m.userId).map((m) => (
                                    <Button
                                      key={m.id}
                                      variant={inv.sharedWithMemberId === m.id ? "default" : "outline"}
                                      className="w-full justify-start"
                                      onClick={() => shareMutation.mutate({ id: inv.id, memberId: m.id })}
                                      disabled={shareMutation.isPending}
                                      data-testid={`button-share-member-${m.id}`}
                                    >
                                      {m.name}
                                      {inv.sharedWithMemberId === m.id && (
                                        <Badge variant="secondary" className="ml-auto text-[10px]">Shared</Badge>
                                      )}
                                    </Button>
                                  ))}
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                          {(isAdmin || isOwn) && (
                            <Dialog open={deleteId === inv.id} onOpenChange={(open) => !open && setDeleteId(null)}>
                              <DialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => setDeleteId(inv.id)}
                                  data-testid={`button-delete-${inv.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-sm">
                                <DialogHeader>
                                  <DialogTitle>Delete {inv.type === "invoice" ? "Invoice" : "Quotation"}?</DialogTitle>
                                </DialogHeader>
                                <p className="text-sm text-muted-foreground">
                                  This will permanently delete {inv.displayNumber} for {inv.billTo}.
                                </p>
                                <DialogFooter className="gap-2">
                                  <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                  </DialogClose>
                                  <Button
                                    variant="destructive"
                                    onClick={() => deleteMutation.mutate(inv.id)}
                                    disabled={deleteMutation.isPending}
                                    data-testid="button-confirm-delete"
                                  >
                                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemDatePicker({ date, onSelect, testId }: { date: Date | undefined; onSelect: (d: Date | undefined) => void; testId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal"
          data-testid={testId}
        >
          <CalendarIcon className="w-4 h-4 mr-2" />
          {date ? format(date, "dd MMM yyyy") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => { onSelect(d); setOpen(false); }}
        />
      </PopoverContent>
    </Popover>
  );
}

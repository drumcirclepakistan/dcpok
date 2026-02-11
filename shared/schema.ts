import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("founder"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const showStatusEnum = pgEnum("show_status", ["upcoming", "completed", "cancelled"]);

export const shows = pgTable("shows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  city: text("city").notNull(),
  showType: text("show_type").notNull(),
  organizationName: text("organization_name"),
  publicShowFor: text("public_show_for"),
  totalAmount: integer("total_amount").notNull(),
  advancePayment: integer("advance_payment").notNull().default(0),
  showDate: timestamp("show_date").notNull(),
  status: showStatusEnum("status").notNull().default("upcoming"),
  notes: text("notes"),
  pocName: text("poc_name"),
  pocPhone: text("poc_phone"),
  pocEmail: text("poc_email"),
  isPaid: boolean("is_paid").notNull().default(false),
  numberOfDrums: integer("number_of_drums"),
  location: text("location"),
  cancellationReason: text("cancellation_reason"),
  refundType: text("refund_type"),
  refundAmount: integer("refund_amount").default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  userId: varchar("user_id").notNull(),
});

export const insertShowSchema = createInsertSchema(shows).omit({
  id: true,
  createdAt: true,
  userId: true,
}).extend({
  title: z.string().min(1, "Title is required"),
  city: z.string().min(1, "City is required"),
  totalAmount: z.coerce.number().min(0, "Amount must be positive"),
  advancePayment: z.coerce.number().min(0, "Advance must be positive"),
  showDate: z.coerce.date(),
  pocName: z.string().optional().nullable(),
  pocPhone: z.string().optional().nullable(),
  pocEmail: z.string().optional().nullable(),
  publicShowFor: z.string().optional().nullable(),
  isPaid: z.boolean().optional(),
  numberOfDrums: z.coerce.number().min(0).optional().nullable(),
  location: z.string().optional().nullable(),
  cancellationReason: z.string().optional().nullable(),
  refundType: z.string().optional().nullable(),
  refundAmount: z.coerce.number().min(0).optional().nullable(),
});

export type InsertShow = z.infer<typeof insertShowSchema>;
export type Show = typeof shows.$inferSelect;

export const defaultShowTypes = ["Corporate", "Private", "Public", "University"];

export const showTypesTable = pgTable("show_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  userId: varchar("user_id").notNull(),
  showOrgField: boolean("show_org_field").default(false).notNull(),
  showPublicField: boolean("show_public_field").default(false).notNull(),
});

export const memberRoleEnum = pgEnum("member_role", ["session_player", "manager", "other"]);
export const paymentTypeEnum = pgEnum("payment_type", ["percentage", "fixed", "manual"]);

export const showExpenses = pgTable("show_expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  showId: varchar("show_id").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
});

export const insertExpenseSchema = createInsertSchema(showExpenses).omit({
  id: true,
}).extend({
  description: z.string().min(1, "Description is required"),
  amount: z.coerce.number().min(0, "Amount must be positive"),
});

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type ShowExpense = typeof showExpenses.$inferSelect;

export const showMembers = pgTable("show_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  showId: varchar("show_id").notNull(),
  name: text("name").notNull(),
  role: memberRoleEnum("role").notNull(),
  paymentType: paymentTypeEnum("payment_type").notNull(),
  paymentValue: integer("payment_value").notNull(),
  isReferrer: boolean("is_referrer").notNull().default(false),
  calculatedAmount: integer("calculated_amount").notNull().default(0),
  referralRate: integer("referral_rate"),
  hasMinLogic: boolean("has_min_logic").notNull().default(false),
  minThreshold: integer("min_threshold"),
  minFlatRate: integer("min_flat_rate"),
});

export const insertMemberSchema = createInsertSchema(showMembers).omit({
  id: true,
}).extend({
  name: z.string().min(1, "Name is required"),
  paymentValue: z.coerce.number().min(0),
  calculatedAmount: z.coerce.number().min(0).optional(),
  referralRate: z.coerce.number().min(0).optional().nullable(),
  hasMinLogic: z.boolean().optional(),
  minThreshold: z.coerce.number().min(0).optional().nullable(),
  minFlatRate: z.coerce.number().min(0).optional().nullable(),
});

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type ShowMember = typeof showMembers.$inferSelect;

export const bandMembers = pgTable("band_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  role: text("role").notNull().default("session_player"),
  customRole: text("custom_role"),
  userId: varchar("user_id"),
  paymentType: text("payment_type").notNull().default("fixed"),
  normalRate: integer("normal_rate").notNull().default(0),
  referralRate: integer("referral_rate"),
  hasMinLogic: boolean("has_min_logic").notNull().default(false),
  minThreshold: integer("min_threshold"),
  minFlatRate: integer("min_flat_rate"),
  canAddShows: boolean("can_add_shows").notNull().default(false),
  canEditName: boolean("can_edit_name").notNull().default(false),
  canViewAmounts: boolean("can_view_amounts").notNull().default(false),
  canShowContacts: boolean("can_show_contacts").notNull().default(false),
  canGenerateInvoice: boolean("can_generate_invoice").notNull().default(false),
  email: text("email"),
});

export const insertBandMemberSchema = createInsertSchema(bandMembers).omit({
  id: true,
}).extend({
  name: z.string().min(1, "Name is required"),
  role: z.string().min(1, "Role is required"),
  customRole: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  paymentType: z.string().optional(),
  normalRate: z.coerce.number().min(0).optional(),
  referralRate: z.coerce.number().min(0).optional().nullable(),
  hasMinLogic: z.boolean().optional(),
  minThreshold: z.coerce.number().min(0).optional().nullable(),
  minFlatRate: z.coerce.number().min(0).optional().nullable(),
  canAddShows: z.boolean().optional(),
  canEditName: z.boolean().optional(),
  canViewAmounts: z.boolean().optional(),
  canShowContacts: z.boolean().optional(),
  canGenerateInvoice: z.boolean().optional(),
  email: z.string().email().optional().nullable(),
});

export type InsertBandMember = z.infer<typeof insertBandMemberSchema>;
export type BandMember = typeof bandMembers.$inferSelect;

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
});

export type Setting = typeof settings.$inferSelect;

export const defaultSettings: Record<string, string> = {};

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  relatedShowId: varchar("related_show_id"),
  relatedShowTitle: text("related_show_title"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

export const retainedFundAllocations = pgTable("retained_fund_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  showId: varchar("show_id").notNull(),
  bandMemberId: varchar("band_member_id").notNull(),
  memberName: text("member_name").notNull(),
  amount: integer("amount").notNull(),
});

export const insertRetainedFundAllocationSchema = createInsertSchema(retainedFundAllocations).omit({
  id: true,
}).extend({
  amount: z.coerce.number().min(0, "Amount must be positive"),
});

export type InsertRetainedFundAllocation = z.infer<typeof insertRetainedFundAllocationSchema>;
export type RetainedFundAllocation = typeof retainedFundAllocations.$inferSelect;

export interface PayoutConfig {
  referralRate?: number | null;
  hasMinLogic?: boolean;
  minThreshold?: number | null;
  minFlatRate?: number | null;
}

export const invoiceTypeEnum = pgEnum("invoice_type", ["invoice", "quotation"]);
export const taxModeEnum = pgEnum("tax_mode", ["inclusive", "exclusive"]);

export const invoiceItemSchema = z.object({
  city: z.string().min(1),
  numberOfDrums: z.union([z.number(), z.string()]).transform((val) => (typeof val === "string" ? parseInt(val, 10) : val)),
  duration: z.string().min(1),
  eventDate: z.union([z.date(), z.string()]).transform((val) => (typeof val === "string" ? new Date(val) : val)),
  amount: z.union([z.number(), z.string()]).transform((val) => (typeof val === "string" ? parseInt(val, 10) : val)),
});

export type InvoiceItem = {
  city: string;
  numberOfDrums: number;
  duration: string;
  eventDate: string;
  amount: number;
};

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: invoiceTypeEnum("type").notNull(),
  number: integer("number").notNull(),
  displayNumber: text("display_number").notNull(),
  billTo: text("bill_to").notNull(),
  city: text("city").notNull(),
  numberOfDrums: integer("number_of_drums").notNull(),
  duration: text("duration").notNull(),
  eventDate: timestamp("event_date").notNull(),
  amount: integer("amount").notNull(),
  taxMode: taxModeEnum("tax_mode").notNull().default("exclusive"),
  items: text("items"),
  sharedWithMemberId: varchar("shared_with_member_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  userId: varchar("user_id").notNull(),
});

export const insertInvoiceSchema = z.object({
  type: z.enum(["invoice", "quotation"]),
  billTo: z.string().min(1),
  taxMode: z.enum(["inclusive", "exclusive"]).default("exclusive"),
  items: z.array(invoiceItemSchema).min(1),
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

export function calculateDynamicPayout(
  config: PayoutConfig | undefined,
  paymentValue: number,
  isReferrer: boolean,
  showTotal: number,
  netAmount: number,
  totalExpenses: number,
  paymentType: string
): number {
  if (paymentType === "percentage") {
    if (isReferrer && config?.referralRate) {
      return Math.round((config.referralRate / 100) * netAmount);
    }
    if (config?.hasMinLogic && config.minThreshold && config.minFlatRate && showTotal < config.minThreshold) {
      if (totalExpenses === 0) return config.minFlatRate;
      const deduction = Math.round((paymentValue / 100) * totalExpenses);
      return Math.max(0, config.minFlatRate - deduction);
    }
    return Math.round((paymentValue / 100) * netAmount);
  }
  return paymentValue;
}

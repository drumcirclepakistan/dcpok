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

export const showTypeEnum = pgEnum("show_type", ["Corporate", "Private", "Public", "University"]);
export const showStatusEnum = pgEnum("show_status", ["upcoming", "completed", "cancelled"]);

export const shows = pgTable("shows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  city: text("city").notNull(),
  showType: showTypeEnum("show_type").notNull(),
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
});

export type InsertShow = z.infer<typeof insertShowSchema>;
export type Show = typeof shows.$inferSelect;

export const showTypes = ["Corporate", "Private", "Public", "University"] as const;
export type ShowType = typeof showTypes[number];

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
});

export const insertMemberSchema = createInsertSchema(showMembers).omit({
  id: true,
}).extend({
  name: z.string().min(1, "Name is required"),
  paymentValue: z.coerce.number().min(0),
  calculatedAmount: z.coerce.number().min(0).optional(),
});

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type ShowMember = typeof showMembers.$inferSelect;

export const bandMembers = pgTable("band_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  role: text("role").notNull().default("session_player"),
  customRole: text("custom_role"),
  userId: varchar("user_id"),
});

export const insertBandMemberSchema = createInsertSchema(bandMembers).omit({
  id: true,
}).extend({
  name: z.string().min(1, "Name is required"),
  role: z.string().min(1, "Role is required"),
  customRole: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
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

export const defaultSettings: Record<string, string> = {
  session_player_percentage: "15",
  referral_percentage: "33",
  wahab_fixed_rate: "15000",
  manager_default_rate: "3000",
};

export const memberPresets = [
  { name: "Zain Shahid", role: "session_player" as const, paymentType: "percentage" as const, settingsKey: "session_player_percentage" },
  { name: "Wahab", role: "session_player" as const, paymentType: "fixed" as const, settingsKey: "wahab_fixed_rate" },
  { name: "Hassan", role: "manager" as const, paymentType: "fixed" as const, settingsKey: "manager_default_rate" },
] as const;

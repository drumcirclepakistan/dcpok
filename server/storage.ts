import { eq, or } from "drizzle-orm";
import { db } from "./db";
import { desc } from "drizzle-orm";
import {
  users, shows, showExpenses, showMembers, settings, bandMembers, showTypesTable,
  notifications, activityLogs, retainedFundAllocations, invoices,
  type User, type InsertUser, type Show, type InsertShow,
  type ShowExpense, type InsertExpense,
  type ShowMember, type InsertMember,
  type Setting,
  type BandMember, type InsertBandMember,
  type Notification, type InsertNotification,
  type ActivityLog, type InsertActivityLog,
  type RetainedFundAllocation, type InsertRetainedFundAllocation,
  type Invoice, type InsertInvoice,
} from "@shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePassword(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return buf.toString("hex") === hashed;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyPassword(supplied: string, stored: string): Promise<boolean>;

  getShows(userId: string): Promise<Show[]>;
  getShow(id: string): Promise<Show | undefined>;
  createShow(show: InsertShow & { userId: string }): Promise<Show>;
  updateShow(id: string, show: Partial<InsertShow>): Promise<Show | undefined>;
  deleteShow(id: string): Promise<boolean>;

  getShowExpenses(showId: string): Promise<ShowExpense[]>;
  createExpense(expense: InsertExpense): Promise<ShowExpense>;
  updateExpense(id: string, data: Partial<InsertExpense>): Promise<ShowExpense | undefined>;
  deleteExpense(id: string): Promise<boolean>;

  getShowMembers(showId: string): Promise<ShowMember[]>;
  createMember(member: InsertMember): Promise<ShowMember>;
  updateMember(id: string, data: Partial<InsertMember>): Promise<ShowMember | undefined>;
  deleteMember(id: string): Promise<boolean>;
  deleteShowMembers(showId: string): Promise<void>;

  getSettings(userId: string): Promise<Setting[]>;
  upsertSetting(userId: string, key: string, value: string): Promise<Setting>;

  getBandMembers(): Promise<BandMember[]>;
  getBandMember(id: string): Promise<BandMember | undefined>;
  getBandMemberByUserId(userId: string): Promise<BandMember | undefined>;
  createBandMember(member: InsertBandMember): Promise<BandMember>;
  updateBandMember(id: string, data: Partial<InsertBandMember>): Promise<BandMember | undefined>;
  deleteBandMember(id: string): Promise<boolean>;

  getAllUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<{ password: string; displayName: string; role: string }>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;

  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(limit?: number, offset?: number): Promise<ActivityLog[]>;
  getActivityLogCount(): Promise<number>;

  getRetainedFundAllocations(showId: string): Promise<RetainedFundAllocation[]>;
  replaceRetainedFundAllocations(showId: string, allocations: InsertRetainedFundAllocation[]): Promise<RetainedFundAllocation[]>;
  deleteRetainedFundAllocations(showId: string): Promise<void>;
  getAllRetainedFundAllocations(): Promise<RetainedFundAllocation[]>;

  getShowTypes(userId: string): Promise<{ id: string; name: string; userId: string; showOrgField: boolean; showPublicField: boolean }[]>;
  getShowType(id: string): Promise<{ id: string; name: string; userId: string; showOrgField: boolean; showPublicField: boolean } | undefined>;
  createShowType(name: string, userId: string, showOrgField?: boolean, showPublicField?: boolean): Promise<{ id: string; name: string; userId: string; showOrgField: boolean; showPublicField: boolean }>;
  updateShowType(id: string, name: string, showOrgField?: boolean, showPublicField?: boolean): Promise<{ id: string; name: string; userId: string; showOrgField: boolean; showPublicField: boolean } | undefined>;
  renameShowTypeInShows(oldName: string, newName: string): Promise<void>;
  deleteShowType(id: string): Promise<boolean>;

  getInvoices(userId: string): Promise<Invoice[]>;
  getAllInvoices(): Promise<Invoice[]>;
  getInvoicesForMember(userId: string, bandMemberId: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getNextInvoiceNumber(): Promise<number>;
  createInvoice(invoice: Omit<Invoice, "id" | "createdAt"> & { id?: string; createdAt?: Date }): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<Omit<Invoice, "id" | "createdAt">>): Promise<Invoice | undefined>;
  deleteInvoice(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await hashPassword(insertUser.password);
    const [user] = await db
      .insert(users)
      .values({ ...insertUser, password: hashedPassword })
      .returning();
    return user;
  }

  async verifyPassword(supplied: string, stored: string): Promise<boolean> {
    return comparePassword(supplied, stored);
  }

  async getShows(userId: string): Promise<Show[]> {
    return db.select().from(shows).where(eq(shows.userId, userId));
  }

  async getShow(id: string): Promise<Show | undefined> {
    const [show] = await db.select().from(shows).where(eq(shows.id, id));
    return show;
  }

  async createShow(show: InsertShow & { userId: string }): Promise<Show> {
    const [created] = await db.insert(shows).values(show).returning();
    return created;
  }

  async updateShow(id: string, data: Partial<InsertShow>): Promise<Show | undefined> {
    const [updated] = await db.update(shows).set(data).where(eq(shows.id, id)).returning();
    return updated;
  }

  async deleteShow(id: string): Promise<boolean> {
    await db.delete(showExpenses).where(eq(showExpenses.showId, id));
    await db.delete(showMembers).where(eq(showMembers.showId, id));
    const result = await db.delete(shows).where(eq(shows.id, id)).returning();
    return result.length > 0;
  }

  async getShowExpenses(showId: string): Promise<ShowExpense[]> {
    return db.select().from(showExpenses).where(eq(showExpenses.showId, showId));
  }

  async createExpense(expense: InsertExpense): Promise<ShowExpense> {
    const [created] = await db.insert(showExpenses).values(expense).returning();
    return created;
  }

  async updateExpense(id: string, data: Partial<InsertExpense>): Promise<ShowExpense | undefined> {
    const [updated] = await db.update(showExpenses).set(data).where(eq(showExpenses.id, id)).returning();
    return updated;
  }

  async deleteExpense(id: string): Promise<boolean> {
    const result = await db.delete(showExpenses).where(eq(showExpenses.id, id)).returning();
    return result.length > 0;
  }

  async getShowMembers(showId: string): Promise<ShowMember[]> {
    return db.select().from(showMembers).where(eq(showMembers.showId, showId));
  }

  async createMember(member: InsertMember): Promise<ShowMember> {
    const [created] = await db.insert(showMembers).values(member).returning();
    return created;
  }

  async updateMember(id: string, data: Partial<InsertMember>): Promise<ShowMember | undefined> {
    const [updated] = await db.update(showMembers).set(data).where(eq(showMembers.id, id)).returning();
    return updated;
  }

  async deleteMember(id: string): Promise<boolean> {
    const result = await db.delete(showMembers).where(eq(showMembers.id, id)).returning();
    return result.length > 0;
  }

  async deleteShowMembers(showId: string): Promise<void> {
    await db.delete(showMembers).where(eq(showMembers.showId, showId));
  }

  async getSettings(userId: string): Promise<Setting[]> {
    return db.select().from(settings).where(eq(settings.userId, userId));
  }

  async upsertSetting(userId: string, key: string, value: string): Promise<Setting> {
    const existing = await db.select().from(settings)
      .where(eq(settings.userId, userId))
      .then(rows => rows.find(r => r.key === key));

    if (existing) {
      const [updated] = await db.update(settings)
        .set({ value })
        .where(eq(settings.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(settings)
      .values({ userId, key, value })
      .returning();
    return created;
  }

  async getBandMembers(): Promise<BandMember[]> {
    return db.select().from(bandMembers);
  }

  async getBandMember(id: string): Promise<BandMember | undefined> {
    const [member] = await db.select().from(bandMembers).where(eq(bandMembers.id, id));
    return member;
  }

  async getBandMemberByUserId(userId: string): Promise<BandMember | undefined> {
    const [member] = await db.select().from(bandMembers).where(eq(bandMembers.userId, userId));
    return member;
  }

  async createBandMember(member: InsertBandMember): Promise<BandMember> {
    const [created] = await db.insert(bandMembers).values(member).returning();
    return created;
  }

  async updateBandMember(id: string, data: Partial<InsertBandMember>): Promise<BandMember | undefined> {
    const [updated] = await db.update(bandMembers).set(data).where(eq(bandMembers.id, id)).returning();
    return updated;
  }

  async deleteBandMember(id: string): Promise<boolean> {
    const result = await db.delete(bandMembers).where(eq(bandMembers.id, id)).returning();
    return result.length > 0;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async updateUser(id: string, data: Partial<{ password: string; displayName: string; role: string }>): Promise<User | undefined> {
    const updateData: any = {};
    if (data.displayName) updateData.displayName = data.displayName;
    if (data.role) updateData.role = data.role;
    if (data.password) updateData.password = await hashPassword(data.password);
    const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async getShowTypes(userId: string): Promise<{ id: string; name: string; userId: string; showOrgField: boolean; showPublicField: boolean }[]> {
    return db.select().from(showTypesTable).where(eq(showTypesTable.userId, userId));
  }

  async getShowType(id: string): Promise<{ id: string; name: string; userId: string; showOrgField: boolean; showPublicField: boolean } | undefined> {
    const [found] = await db.select().from(showTypesTable).where(eq(showTypesTable.id, id));
    return found;
  }

  async createShowType(name: string, userId: string, showOrgField = false, showPublicField = false): Promise<{ id: string; name: string; userId: string; showOrgField: boolean; showPublicField: boolean }> {
    const [created] = await db.insert(showTypesTable).values({ name, userId, showOrgField, showPublicField }).returning();
    return created;
  }

  async updateShowType(id: string, name: string, showOrgField?: boolean, showPublicField?: boolean): Promise<{ id: string; name: string; userId: string; showOrgField: boolean; showPublicField: boolean } | undefined> {
    const setData: Record<string, any> = { name };
    if (showOrgField !== undefined) setData.showOrgField = showOrgField;
    if (showPublicField !== undefined) setData.showPublicField = showPublicField;
    const [updated] = await db.update(showTypesTable).set(setData).where(eq(showTypesTable.id, id)).returning();
    return updated;
  }

  async renameShowTypeInShows(oldName: string, newName: string): Promise<void> {
    await db.update(shows).set({ showType: newName }).where(eq(shows.showType, oldName));
  }

  async deleteShowType(id: string): Promise<boolean> {
    const result = await db.delete(showTypesTable).where(eq(showTypesTable.id, id)).returning();
    return result.length > 0;
  }

  async getRetainedFundAllocations(showId: string): Promise<RetainedFundAllocation[]> {
    return db.select().from(retainedFundAllocations).where(eq(retainedFundAllocations.showId, showId));
  }

  async replaceRetainedFundAllocations(showId: string, allocations: InsertRetainedFundAllocation[]): Promise<RetainedFundAllocation[]> {
    await db.delete(retainedFundAllocations).where(eq(retainedFundAllocations.showId, showId));
    if (allocations.length === 0) return [];
    const created = await db.insert(retainedFundAllocations).values(allocations).returning();
    return created;
  }

  async deleteRetainedFundAllocations(showId: string): Promise<void> {
    await db.delete(retainedFundAllocations).where(eq(retainedFundAllocations.showId, showId));
  }

  async getAllRetainedFundAllocations(): Promise<RetainedFundAllocation[]> {
    return db.select().from(retainedFundAllocations);
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const rows = await db.select().from(notifications).where(eq(notifications.userId, userId));
    return rows.filter(r => !r.isRead).length;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [created] = await db.insert(activityLogs).values(log).returning();
    return created;
  }

  async getActivityLogs(limit = 100, offset = 0): Promise<ActivityLog[]> {
    return db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit).offset(offset);
  }

  async getActivityLogCount(): Promise<number> {
    const rows = await db.select().from(activityLogs);
    return rows.length;
  }

  async getInvoices(userId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.createdAt));
  }

  async getAllInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getInvoicesForMember(userId: string, bandMemberId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(
      or(eq(invoices.userId, userId), eq(invoices.sharedWithMemberId, bandMemberId))
    ).orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getNextInvoiceNumber(): Promise<number> {
    const rows = await db.select({ number: invoices.number }).from(invoices).orderBy(desc(invoices.number)).limit(1);
    if (rows.length === 0) return 4848;
    return rows[0].number + 1;
  }

  async createInvoice(invoice: Omit<Invoice, "id" | "createdAt"> & { id?: string; createdAt?: Date }): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice as any).returning();
    return created;
  }

  async updateInvoice(id: string, data: Partial<Omit<Invoice, "id" | "createdAt">>): Promise<Invoice | undefined> {
    const [updated] = await db.update(invoices).set(data as any).where(eq(invoices.id, id)).returning();
    return updated;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    const result = await db.delete(invoices).where(eq(invoices.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();

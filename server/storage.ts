import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  users, shows, showExpenses, showMembers, settings,
  type User, type InsertUser, type Show, type InsertShow,
  type ShowExpense, type InsertExpense,
  type ShowMember, type InsertMember,
  type Setting,
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
}

export const storage = new DatabaseStorage();

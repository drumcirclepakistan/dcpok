import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage } from "./storage";
import { insertShowSchema, insertExpenseSchema, insertMemberSchema, insertInvoiceSchema, defaultSettings, calculateDynamicPayout } from "@shared/schema";
import { seedDatabase } from "./seed";
import { sendBulkShowAssignment, isEmailConfigured } from "./email";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "founder") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "drum-circle-pk-secret-2024",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      },
    })
  );

  const { db } = await import("./db");
  const { sql } = await import("drizzle-orm");

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE show_type AS ENUM ('Corporate', 'Private', 'Public', 'University');
  EXCEPTION WHEN duplicate_object THEN null; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE show_status AS ENUM ('upcoming', 'completed', 'cancelled');
  EXCEPTION WHEN duplicate_object THEN null; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE member_role AS ENUM ('session_player', 'manager', 'other');
  EXCEPTION WHEN duplicate_object THEN null; END $$`);

  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE payment_type AS ENUM ('percentage', 'fixed', 'manual');
  EXCEPTION WHEN duplicate_object THEN null; END $$`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'founder'
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shows (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      show_type TEXT NOT NULL DEFAULT 'Corporate',
      organization_name TEXT,
      total_amount INTEGER NOT NULL,
      advance_payment INTEGER NOT NULL DEFAULT 0,
      show_date TIMESTAMP NOT NULL,
      status show_status NOT NULL DEFAULT 'upcoming',
      notes TEXT,
      poc_name TEXT,
      poc_phone TEXT,
      poc_email TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      user_id VARCHAR NOT NULL
    )
  `);

  // Migrate show_type from enum to text if needed
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE shows ALTER COLUMN show_type TYPE TEXT;
    EXCEPTION WHEN others THEN null; END $$
  `);

  // Add columns if they don't exist (migration for existing tables)
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_name TEXT`);
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_phone TEXT`);
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_email TEXT`);
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS public_show_for TEXT`);
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS show_expenses (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      show_id VARCHAR NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS show_members (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      show_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      role member_role NOT NULL,
      payment_type payment_type NOT NULL,
      payment_value INTEGER NOT NULL,
      is_referrer BOOLEAN NOT NULL DEFAULT false,
      calculated_amount INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS settings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS band_members (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'session_player',
      custom_role TEXT,
      user_id VARCHAR
    )
  `);

  // Add payment config snapshot columns to show_members
  await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS referral_rate INTEGER`);
  await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS min_threshold INTEGER`);
  await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER`);

  // Add payment config columns to band_members
  await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'fixed'`);
  await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS normal_rate INTEGER`);
  await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS referral_rate INTEGER`);
  await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS min_threshold INTEGER`);
  await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER`);
  await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS can_add_shows BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS can_edit_name BOOLEAN NOT NULL DEFAULT false`);

  // Show types table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS show_types (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      user_id VARCHAR NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      related_show_id VARCHAR,
      related_show_title TEXT,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE invoice_type AS ENUM ('invoice', 'quotation');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE tax_mode AS ENUM ('inclusive', 'exclusive');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      type invoice_type NOT NULL,
      number INTEGER NOT NULL,
      display_number TEXT NOT NULL,
      bill_to TEXT NOT NULL,
      city TEXT NOT NULL,
      number_of_drums INTEGER NOT NULL,
      duration TEXT NOT NULL,
      event_date TIMESTAMP NOT NULL,
      amount INTEGER NOT NULL,
      tax_mode tax_mode NOT NULL DEFAULT 'exclusive',
      items TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      user_id VARCHAR NOT NULL
    )
  `);

  await seedDatabase();

  async function logActivity(userId: string, userName: string, action: string, details?: string) {
    try {
      await storage.createActivityLog({ userId, userName, action, details: details || null });
    } catch (e) {}
  }

  async function notifyUser(userId: string, type: string, message: string, showId?: string, showTitle?: string) {
    try {
      await storage.createNotification({ userId, type, message, relatedShowId: showId || null, relatedShowTitle: showTitle || null, isRead: false });
    } catch (e) {}
  }

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await storage.verifyPassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.userId = user.id;
      logActivity(user.id, user.displayName, "login", `${user.displayName} logged in`);
      const { password: _, ...safeUser } = user;
      if (user.role === "member") {
        const bandMember = await storage.getBandMemberByUserId(user.id);
        return res.json({
          ...safeUser,
          bandMemberId: bandMember?.id || null,
          bandMemberName: bandMember?.name || null,
          canAddShows: bandMember?.canAddShows || false,
          canEditName: bandMember?.canEditName || false,
          canViewAmounts: bandMember?.canViewAmounts || false,
        });
      }
      res.json(safeUser);
    } catch (err) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const { password: _, ...safeUser } = user;
    if (user.role === "member") {
      const bandMember = await storage.getBandMemberByUserId(user.id);
      return res.json({
        ...safeUser,
        bandMemberId: bandMember?.id || null,
        bandMemberName: bandMember?.name || null,
        canAddShows: bandMember?.canAddShows || false,
        canEditName: bandMember?.canEditName || false,
        canViewAmounts: bandMember?.canViewAmounts || false,
        canShowContacts: bandMember?.canShowContacts || false,
      });
    }
    res.json(safeUser);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.post("/api/auth/emergency-reset", async (req, res) => {
    try {
      const { recoveryKey, newPassword } = req.body;
      if (!recoveryKey || !newPassword) {
        return res.status(400).json({ message: "Recovery key and new password required" });
      }
      const envKey = process.env.ADMIN_RECOVERY_KEY;
      if (!envKey) {
        return res.status(503).json({ message: "Recovery not configured" });
      }
      if (recoveryKey !== envKey) {
        return res.status(401).json({ message: "Invalid recovery key" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const allUsers = await storage.getAllUsers();
      const founder = allUsers.find(u => u.role === "founder");
      if (!founder) {
        return res.status(404).json({ message: "Admin account not found" });
      }
      await storage.updateUser(founder.id, { password: newPassword });
      logActivity(founder.id, founder.displayName, "emergency_password_reset", "Admin password reset via recovery key");
      res.json({ message: "Password reset successfully. You can now log in with your new password." });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to reset password" });
    }
  });

  app.patch("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const valid = await storage.verifyPassword(currentPassword, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      await storage.updateUser(user.id, { password: newPassword });
      logActivity(user.id, user.displayName, "password_changed", `${user.displayName} changed their password`);
      res.json({ message: "Password changed successfully" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to change password" });
    }
  });

  // Shows CRUD (admin only)
  app.get("/api/shows", requireAdmin, async (req, res) => {
    const showsList = await storage.getShows(req.session.userId!);
    res.json(showsList);
  });

  // Duplicate date check (must be before :id route) - accessible to members with canAddShows
  app.get("/api/shows/check-date", requireAuth, async (req, res) => {
    try {
      const { date, excludeId } = req.query as { date?: string; excludeId?: string };
      if (!date) return res.json({ conflicts: [] });

      const user = await storage.getUser(req.session.userId!);
      let allShows;
      if (user && user.role === "member") {
        allShows = await getAllShowsForMember();
      } else {
        allShows = await storage.getShows(req.session.userId!);
      }
      const targetDate = new Date(date);
      const conflicts = allShows.filter((s) => {
        if (excludeId && s.id === excludeId) return false;
        const showDate = new Date(s.showDate);
        return showDate.getFullYear() === targetDate.getFullYear() &&
               showDate.getMonth() === targetDate.getMonth() &&
               showDate.getDate() === targetDate.getDate();
      }).map((s) => ({
        id: s.id,
        title: s.title,
        city: s.city,
        showType: s.showType,
        showDate: s.showDate.toISOString(),
      }));

      res.json({ conflicts });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to check date" });
    }
  });

  app.get("/api/shows/:id", requireAdmin, async (req, res) => {
    const show = await storage.getShow(req.params.id as string);
    if (!show || show.userId !== req.session.userId) {
      return res.status(404).json({ message: "Show not found" });
    }
    res.json(show);
  });

  app.post("/api/shows", requireAdmin, async (req, res) => {
    try {
      const parsed = insertShowSchema.parse(req.body);
      const show = await storage.createShow({
        ...parsed,
        userId: req.session.userId!,
      });
      const user = await storage.getUser(req.session.userId!);
      logActivity(req.session.userId!, user?.displayName || "Admin", "show_created", `Created "${show.title}" in ${show.city}`);
      res.status(201).json(show);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid show data" });
    }
  });

  app.patch("/api/shows/:id", requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getShow(req.params.id as string);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Show not found" });
      }
      const parsed = insertShowSchema.partial().parse(req.body);
      const updated = await storage.updateShow(req.params.id as string, parsed);

      const changes: string[] = [];
      const fieldLabels: Record<string, string> = {
        title: "Title", city: "City", showType: "Show Type", totalAmount: "Total Amount",
        advancePayment: "Advance Payment", status: "Status", notes: "Notes",
        pocName: "Contact Name", pocPhone: "Contact Phone", pocEmail: "Contact Email",
        organizationName: "Organization", publicShowFor: "Public Show For",
        numberOfDrums: "Number of Drums", location: "Location", isPaid: "Paid Status",
        cancellationReason: "Cancellation Reason",
        refundType: "Refund Type", refundAmount: "Refund Amount",
      };
      for (const [key, label] of Object.entries(fieldLabels)) {
        const oldVal = (existing as any)[key];
        const newVal = (updated as any)[key];
        if (oldVal instanceof Date && newVal instanceof Date) {
          if (oldVal.getTime() !== newVal.getTime()) changes.push(`${label}`);
        } else if (String(oldVal ?? "") !== String(newVal ?? "")) {
          if (key === "totalAmount" || key === "advancePayment" || key === "refundAmount") {
            changes.push(`${label}: Rs ${oldVal ?? 0} → Rs ${newVal ?? 0}`);
          } else if (key === "status") {
            changes.push(`Status: ${oldVal} → ${newVal}`);
          } else {
            changes.push(label);
          }
        }
      }
      if (changes.length > 0) {
        const user = await storage.getUser(req.session.userId!);
        logActivity(req.session.userId!, user?.displayName || "Admin", "show_updated", `Updated "${existing.title}": ${changes.join(", ")}`);
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  app.delete("/api/shows/:id", requireAdmin, async (req, res) => {
    const existing = await storage.getShow(req.params.id as string);
    if (!existing || existing.userId !== req.session.userId) {
      return res.status(404).json({ message: "Show not found" });
    }
    const user = await storage.getUser(req.session.userId!);
    logActivity(req.session.userId!, user?.displayName || "Admin", "show_deleted", `Deleted "${existing.title}" in ${existing.city}`);
    await storage.deleteShow(req.params.id as string);
    res.json({ message: "Deleted" });
  });

  // Show Expenses (admin only)
  app.get("/api/shows/:id/expenses", requireAdmin, async (req, res) => {
    const show = await storage.getShow(req.params.id as string);
    if (!show || show.userId !== req.session.userId) {
      return res.status(404).json({ message: "Show not found" });
    }
    const expenses = await storage.getShowExpenses(req.params.id as string);
    res.json(expenses);
  });

  app.post("/api/shows/:id/expenses", requireAdmin, async (req, res) => {
    try {
      const show = await storage.getShow(req.params.id as string);
      if (!show || show.userId !== req.session.userId) {
        return res.status(404).json({ message: "Show not found" });
      }
      const parsed = insertExpenseSchema.parse({ ...req.body, showId: req.params.id });
      const expense = await storage.createExpense(parsed);
      res.status(201).json(expense);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid expense data" });
    }
  });

  app.delete("/api/shows/:id/expenses/:expenseId", requireAdmin, async (req, res) => {
    await storage.deleteExpense(req.params.expenseId as string);
    res.json({ message: "Deleted" });
  });

  // Show Members (admin only)
  app.get("/api/shows/:id/members", requireAdmin, async (req, res) => {
    const show = await storage.getShow(req.params.id as string);
    if (!show || show.userId !== req.session.userId) {
      return res.status(404).json({ message: "Show not found" });
    }
    const members = await storage.getShowMembers(req.params.id as string);
    res.json(members);
  });

  app.post("/api/shows/:id/members", requireAdmin, async (req, res) => {
    try {
      const show = await storage.getShow(req.params.id as string);
      if (!show || show.userId !== req.session.userId) {
        return res.status(404).json({ message: "Show not found" });
      }
      const parsed = insertMemberSchema.parse({ ...req.body, showId: req.params.id });
      const member = await storage.createMember(parsed);
      res.status(201).json(member);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid member data" });
    }
  });

  app.patch("/api/shows/:id/members/:memberId", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.updateMember(req.params.memberId as string, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  app.delete("/api/shows/:id/members/:memberId", requireAdmin, async (req, res) => {
    await storage.deleteMember(req.params.memberId as string);
    res.json({ message: "Deleted" });
  });

  app.get("/api/shows/:id/retained-allocations", requireAdmin, async (req, res) => {
    const allocations = await storage.getRetainedFundAllocations(req.params.id as string);
    res.json(allocations);
  });

  app.put("/api/shows/:id/retained-allocations", requireAdmin, async (req, res) => {
    try {
      const show = await storage.getShow(req.params.id as string);
      if (!show || show.userId !== req.session.userId) {
        return res.status(404).json({ message: "Show not found" });
      }
      if (show.status !== "cancelled") {
        return res.status(400).json({ message: "Show is not cancelled" });
      }
      const expenses = await storage.getShowExpenses(show.id);
      const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
      const fundsReceived = show.isPaid ? show.totalAmount : show.advancePayment;
      const afterExpenses = Math.max(0, fundsReceived - totalExp);
      const retainedAmount = Math.max(0, afterExpenses - (show.refundAmount || 0));

      if (retainedAmount <= 0) {
        return res.status(400).json({ message: "No retained funds to allocate" });
      }

      const allocations = req.body.allocations || [];
      const totalAllocated = allocations.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);
      if (totalAllocated > retainedAmount) {
        return res.status(400).json({ message: `Total allocated (Rs ${totalAllocated}) exceeds retained amount (Rs ${retainedAmount})` });
      }

      const previousAllocations = await storage.getRetainedFundAllocations(show.id);
      const prevAllocMap: Record<string, number> = {};
      for (const a of previousAllocations) {
        prevAllocMap[a.bandMemberId] = a.amount;
      }

      const parsed = allocations.map((a: any) => ({
        showId: show.id,
        bandMemberId: a.bandMemberId,
        memberName: a.memberName,
        amount: Number(a.amount),
      }));

      const created = await storage.replaceRetainedFundAllocations(show.id, parsed);

      const allBandMembers = await storage.getBandMembers();
      const bandMemberUserMap: Record<string, string> = {};
      for (const bm of allBandMembers) {
        if (bm.userId) bandMemberUserMap[bm.id] = bm.userId;
      }

      for (const alloc of parsed) {
        const userId = bandMemberUserMap[alloc.bandMemberId];
        if (!userId) continue;
        const prevAmount = prevAllocMap[alloc.bandMemberId];
        if (prevAmount === undefined) {
          notifyUser(userId, "cancelled_allocation", `Rs ${alloc.amount.toLocaleString()} allocated to you from cancelled show "${show.title}"`, show.id, show.title);
        } else if (prevAmount !== alloc.amount) {
          notifyUser(userId, "cancelled_allocation_changed", `Cancelled show allocation from "${show.title}" changed from Rs ${prevAmount.toLocaleString()} to Rs ${alloc.amount.toLocaleString()}`, show.id, show.title);
        }
      }

      const newAllocMap: Record<string, number> = {};
      for (const a of parsed) {
        newAllocMap[a.bandMemberId] = a.amount;
      }
      for (const prev of previousAllocations) {
        if (!(prev.bandMemberId in newAllocMap)) {
          const userId = bandMemberUserMap[prev.bandMemberId];
          if (userId) {
            notifyUser(userId, "cancelled_allocation_revoked", `Cancelled show allocation of Rs ${prev.amount.toLocaleString()} from "${show.title}" has been revoked`, show.id, show.title);
          }
        }
      }

      res.json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to save allocations" });
    }
  });

  app.delete("/api/shows/:id/retained-allocations", requireAdmin, async (req, res) => {
    try {
      const show = await storage.getShow(req.params.id as string);
      const previousAllocations = await storage.getRetainedFundAllocations(req.params.id as string);

      if (previousAllocations.length > 0) {
        const allBandMembers = await storage.getBandMembers();
        const bandMemberUserMap: Record<string, string> = {};
        for (const bm of allBandMembers) {
          if (bm.userId) bandMemberUserMap[bm.id] = bm.userId;
        }
        const showTitle = show?.title || "Unknown Show";
        for (const alloc of previousAllocations) {
          const userId = bandMemberUserMap[alloc.bandMemberId];
          if (userId) {
            notifyUser(userId, "cancelled_allocation_revoked", `Cancelled show allocation of Rs ${alloc.amount.toLocaleString()} from "${showTitle}" has been revoked`, req.params.id as string, showTitle);
          }
        }
      }

      await storage.deleteRetainedFundAllocations(req.params.id as string);
      res.json({ message: "Allocations cleared" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to clear allocations" });
    }
  });

  app.put("/api/shows/:id/members", requireAdmin, async (req, res) => {
    try {
      const show = await storage.getShow(req.params.id as string);
      if (!show || show.userId !== req.session.userId) {
        return res.status(404).json({ message: "Show not found" });
      }
      const existingMembers = await storage.getShowMembers(req.params.id as string);
      const existingNames = new Set(existingMembers.map(m => m.name));

      await storage.deleteShowMembers(req.params.id as string);
      const members = req.body.members || [];
      const created = [];
      for (const m of members) {
        const parsed = insertMemberSchema.parse({ ...m, showId: req.params.id });
        const member = await storage.createMember(parsed);
        created.push(member);
      }

      const allBandMembers = await storage.getBandMembers();
      const bandEmailMap: Record<string, string> = {};
      const bandUserIdMap: Record<string, string> = {};
      for (const bm of allBandMembers) {
        if (bm.email) bandEmailMap[bm.name] = bm.email;
        if (bm.userId) bandUserIdMap[bm.name] = bm.userId;
      }

      const newMemberNames = created.filter(m => !existingNames.has(m.name)).map(m => m.name);
      const removedMemberNames = [...existingNames].filter(n => !created.find(c => c.name === n));
      const adminUser = await storage.getUser(req.session.userId!);
      const adminName = adminUser?.displayName || "Admin";

      for (const name of newMemberNames) {
        if (bandUserIdMap[name]) {
          notifyUser(bandUserIdMap[name], "added_to_show", `${adminName} added you to "${show.title}"`, show.id, show.title);
        }
      }
      for (const name of removedMemberNames) {
        if (bandUserIdMap[name]) {
          notifyUser(bandUserIdMap[name], "removed_from_show", `${adminName} removed you from "${show.title}"`, show.id, show.title);
        }
      }

      if (newMemberNames.length > 0) {
        logActivity(req.session.userId!, adminName, "members_updated", `Updated band for "${show.title}" — added: ${newMemberNames.join(", ")}${removedMemberNames.length ? `, removed: ${removedMemberNames.join(", ")}` : ""}`);
      }

      if (isEmailConfigured()) {
        const emailMembers = created
          .filter(m => !existingNames.has(m.name) && bandEmailMap[m.name])
          .map(m => ({ email: bandEmailMap[m.name], name: m.name }));

        if (emailMembers.length > 0) {
          sendBulkShowAssignment(emailMembers, {
            showTitle: show.title,
            showDate: show.showDate.toISOString(),
            city: show.city,
            showType: show.showType,
            location: show.location,
            numberOfDrums: show.numberOfDrums,
          }).catch(err => console.error("[Email] Bulk send error:", err));
        }
      }

      res.json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid member data" });
    }
  });

  // Toggle paid status (admin only)
  app.patch("/api/shows/:id/toggle-paid", requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getShow(req.params.id as string);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Show not found" });
      }
      const newPaid = !existing.isPaid;
      const updateData: any = { isPaid: newPaid };
      if (newPaid && existing.advancePayment === 0) {
        updateData.advancePayment = existing.totalAmount;
      }
      const updated = await storage.updateShow(req.params.id as string, updateData);
      const user = await storage.getUser(req.session.userId!);
      logActivity(req.session.userId!, user?.displayName || "Admin", newPaid ? "show_marked_paid" : "show_marked_unpaid", `${existing.title}`);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  // Dashboard stats with time range (admin only)
  app.get("/api/dashboard/stats", requireAdmin, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { from, to } = req.query as { from?: string; to?: string };

      let filteredShows = allShows.filter(s => s.status !== "cancelled");
      if (from) {
        const fromDate = new Date(from as string);
        filteredShows = filteredShows.filter((s) => new Date(s.showDate) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to as string);
        filteredShows = filteredShows.filter((s) => new Date(s.showDate) <= toDate);
      }

      let totalExpenses = 0;
      let totalMemberPayouts = 0;

      for (const show of filteredShows) {
        const expenses = await storage.getShowExpenses(show.id);
        const expenseSum = expenses.reduce((s, e) => s + e.amount, 0);
        totalExpenses += expenseSum;

        const members = await storage.getShowMembers(show.id);
        let memberPayout = 0;
        for (const m of members) {
          memberPayout += m.calculatedAmount;
        }
        totalMemberPayouts += memberPayout;
      }

      const totalRevenue = filteredShows.reduce((s, sh) => s + sh.totalAmount, 0);
      const revenueAfterExpenses = totalRevenue - totalExpenses;

      const paidCompletedShows = filteredShows.filter(s => new Date(s.showDate) <= new Date() && s.isPaid);
      let paidShowExpenses = 0;
      let paidShowMemberPayouts = 0;
      for (const show of paidCompletedShows) {
        const expenses = await storage.getShowExpenses(show.id);
        paidShowExpenses += expenses.reduce((s, e) => s + e.amount, 0);
        const members = await storage.getShowMembers(show.id);
        for (const m of members) {
          paidShowMemberPayouts += m.calculatedAmount;
        }
      }
      const paidShowRevenue = paidCompletedShows.reduce((s, sh) => s + sh.totalAmount, 0);
      const founderEarningsFromPaidShows = paidShowRevenue - paidShowExpenses - paidShowMemberPayouts;

      const now = new Date();
      const completedFilteredShows = filteredShows.filter((s) => new Date(s.showDate) <= now);
      const cityCount: Record<string, number> = {};
      const typeCount: Record<string, number> = {};
      for (const show of completedFilteredShows) {
        cityCount[show.city] = (cityCount[show.city] || 0) + 1;
        typeCount[show.showType] = (typeCount[show.showType] || 0) + 1;
      }

      const topCities = Object.entries(cityCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([city, count]) => ({ city, count }));

      const topTypes = Object.entries(typeCount)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count }));

      const activeShows = allShows.filter(s => s.status !== "cancelled");
      const upcomingCount = activeShows.filter((s) => new Date(s.showDate) > now).length;
      const pendingAmount = activeShows
        .filter((s) => !s.isPaid)
        .reduce((s, sh) => s + (sh.totalAmount - sh.advancePayment), 0);
      const noAdvanceCount = activeShows.filter((s) => new Date(s.showDate) > now && s.advancePayment === 0).length;

      let cancelledShows = allShows.filter(s => s.status === "cancelled");
      if (from) {
        const fromDate = new Date(from as string);
        cancelledShows = cancelledShows.filter((s) => new Date(s.showDate) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to as string);
        cancelledShows = cancelledShows.filter((s) => new Date(s.showDate) <= toDate);
      }
      let cancelledShowAmount = 0;
      for (const cs of cancelledShows) {
        const csExpenses = await storage.getShowExpenses(cs.id);
        const csExpenseTotal = csExpenses.reduce((s, e) => s + e.amount, 0);
        const fundsReceived = cs.isPaid ? cs.totalAmount : cs.advancePayment;
        const afterExpenses = Math.max(0, fundsReceived - csExpenseTotal);
        const retained = Math.max(0, afterExpenses - (cs.refundAmount || 0));
        cancelledShowAmount += retained;
      }

      const allRetainedAllocs = await storage.getAllRetainedFundAllocations();
      const cancelledShowIds = new Set(cancelledShows.map(s => s.id));
      let cancelledAllocated = 0;
      for (const a of allRetainedAllocs) {
        if (cancelledShowIds.has(a.showId)) {
          cancelledAllocated += a.amount;
        }
      }
      const cancelledUnallocated = Math.max(0, cancelledShowAmount - cancelledAllocated);

      const founderCancelledEarnings = cancelledUnallocated;
      const founderTotalEarnings = founderEarningsFromPaidShows + founderCancelledEarnings;

      res.json({
        showsPerformed: completedFilteredShows.length,
        totalRevenue,
        totalExpenses,
        revenueAfterExpenses,
        founderEarningsFromPaidShows,
        founderCancelledEarnings,
        founderTotalEarnings,
        cancelledShowAmount,
        cancelledAllocated,
        cancelledUnallocated,
        upcomingCount,
        pendingAmount,
        noAdvanceCount,
        topCities,
        topTypes,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to compute stats" });
    }
  });

  // Financials per-member stats (admin only)
  app.get("/api/financials", requireAdmin, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { from, to, member } = req.query as { from?: string; to?: string; member?: string };

      let filteredShows = allShows.filter(s => s.status !== "cancelled");
      if (from) {
        const fromDate = new Date(from);
        filteredShows = filteredShows.filter((s) => new Date(s.showDate) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to);
        filteredShows = filteredShows.filter((s) => new Date(s.showDate) <= toDate);
      }

      interface ShowDetail {
        id: string;
        title: string;
        city: string;
        showDate: string;
        showType: string;
        totalAmount: number;
        memberEarning: number;
        isPaid: boolean;
      }

      const now = new Date();
      const pastShows: ShowDetail[] = [];
      const upcomingShows: ShowDetail[] = [];
      let totalEarnings = 0;
      let totalShowsPerformed = 0;
      const citySet: Record<string, number> = {};

      for (const show of filteredShows) {
        const expenses = await storage.getShowExpenses(show.id);
        const expenseSum = expenses.reduce((s, e) => s + e.amount, 0);
        const net = show.totalAmount - expenseSum;
        const members = await storage.getShowMembers(show.id);

        let memberEarning = 0;
        let participated = false;

        if (member === "Haider Jamil") {
          let totalMemberPayouts = 0;
          for (const m of members) {
            totalMemberPayouts += m.calculatedAmount;
          }
          memberEarning = net - totalMemberPayouts;
          participated = true;
        } else {
          const found = members.find((m) => m.name === member);
          if (found) {
            participated = true;
            memberEarning = found.calculatedAmount;
          }
        }

        if (participated) {
          const showDate = new Date(show.showDate);
          const isUpcoming = showDate > now;
          const detail: ShowDetail = {
            id: show.id,
            title: show.title,
            city: show.city,
            showDate: show.showDate.toISOString(),
            showType: show.showType,
            totalAmount: show.totalAmount,
            memberEarning,
            isPaid: show.isPaid,
          };

          if (isUpcoming) {
            upcomingShows.push(detail);
          } else {
            pastShows.push(detail);
            totalShowsPerformed++;
            if (show.isPaid) {
              totalEarnings += memberEarning;
            }
            citySet[show.city] = (citySet[show.city] || 0) + 1;
          }
        }
      }

      const cities = Object.entries(citySet)
        .sort((a, b) => b[1] - a[1])
        .map(([city, count]) => ({ city, count }));

      const allAllocations = await storage.getAllRetainedFundAllocations();
      const allBandMembersForAlloc = await storage.getBandMembers();
      const memberNameById: Record<string, string> = {};
      for (const bm of allBandMembersForAlloc) {
        memberNameById[bm.id] = bm.name;
      }

      let retainedFundsEarnings = 0;
      const retainedAllocDetails: { showId: string; showTitle: string; amount: number }[] = [];

      if (member) {
        let targetBandMemberIds: string[] = [];
        if (member === "Haider Jamil") {
          targetBandMemberIds = ["founder"];
        } else {
          const targetBandMember = allBandMembersForAlloc.find(bm => bm.name === member);
          if (targetBandMember) {
            targetBandMemberIds = [targetBandMember.id];
          }
        }
        const memberAllocations = allAllocations.filter(a => targetBandMemberIds.includes(a.bandMemberId));
        for (const alloc of memberAllocations) {
          const cancelledShow = allShows.find(s => s.id === alloc.showId && s.status === "cancelled");
          if (cancelledShow) {
            const showDate = new Date(cancelledShow.showDate);
            if (from && showDate < new Date(from)) continue;
            if (to && showDate > new Date(to)) continue;
            retainedFundsEarnings += alloc.amount;
            retainedAllocDetails.push({
              showId: cancelledShow.id,
              showTitle: cancelledShow.title,
              amount: alloc.amount,
            });
          }
        }
      }

      totalEarnings += retainedFundsEarnings;

      const avgPerShow = totalShowsPerformed > 0 ? Math.round(totalEarnings / totalShowsPerformed) : 0;

      const paidShows = pastShows.filter((s) => s.isPaid).length;
      const unpaidPastShows = pastShows.filter((s) => !s.isPaid);
      const unpaidShows = unpaidPastShows.length;
      const unpaidAmount = unpaidPastShows.reduce((s, sh) => s + sh.memberEarning, 0);
      const pendingAmount = upcomingShows.reduce((s, sh) => s + sh.memberEarning, 0);

      res.json({
        member: member || "Haider Jamil",
        totalEarnings,
        totalShows: totalShowsPerformed,
        avgPerShow,
        paidShows,
        unpaidShows,
        unpaidAmount,
        pendingAmount,
        upcomingShowsCount: upcomingShows.length,
        cities,
        shows: pastShows.sort((a, b) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime()),
        upcomingShows: upcomingShows.sort((a, b) => new Date(a.showDate).getTime() - new Date(b.showDate).getTime()),
        retainedFundsEarnings,
        retainedAllocDetails,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to compute financials" });
    }
  });

  // Helper: get the band member for a member-role user
  async function getMemberContext(req: Request) {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.role !== "member") return null;
    const bandMember = await storage.getBandMemberByUserId(user.id);
    return bandMember || null;
  }

  // Helper: get all shows (from all founders/users)
  async function getAllShowsForMember() {
    const allUsers = await storage.getAllUsers();
    const founderUser = allUsers.find(u => u.role === "founder");
    if (!founderUser) return [];
    return storage.getShows(founderUser.id);
  }

  // Member-scoped: get shows they are assigned to
  app.get("/api/member/shows", requireAuth, async (req, res) => {
    try {
      const member = await getMemberContext(req);
      if (!member) return res.status(403).json({ message: "Member access only" });

      const allShows = await getAllShowsForMember();
      const memberShows = [];

      for (const show of allShows) {
        if (show.status === "cancelled") continue;
        const members = await storage.getShowMembers(show.id);
        const found = members.find(m => m.name === member.name);
        if (found) {
          const myEarning = found.calculatedAmount;
          const isUpcoming = new Date(show.showDate) > new Date();

          memberShows.push({
            id: show.id,
            title: show.title,
            city: show.city,
            showType: show.showType,
            showDate: show.showDate.toISOString(),
            totalAmount: member.canViewAmounts ? show.totalAmount : undefined,
            myEarning,
            isPaid: show.isPaid,
            status: show.status,
            isUpcoming,
            organizationName: show.organizationName,
            publicShowFor: show.publicShowFor,
            numberOfDrums: show.numberOfDrums,
            location: show.location,
            isReferrer: found.isReferrer,
            ...(member.canShowContacts ? {
              pocName: show.pocName,
              pocPhone: show.pocPhone,
              pocEmail: show.pocEmail,
            } : {}),
          });
        }
      }

      const cancelledShows = allShows.filter(s => s.status === "cancelled");
      for (const show of cancelledShows) {
        const members = await storage.getShowMembers(show.id);
        const found = members.find(m => m.name === member.name);
        if (found) {
          const allocs = await storage.getRetainedFundAllocations(show.id);
          const myAlloc = allocs.find(a => a.bandMemberId === member.id);
          memberShows.push({
            id: show.id,
            title: show.title,
            city: show.city,
            showType: show.showType,
            showDate: show.showDate.toISOString(),
            totalAmount: member.canViewAmounts ? show.totalAmount : undefined,
            myEarning: myAlloc ? myAlloc.amount : 0,
            isPaid: false,
            status: "cancelled",
            isUpcoming: false,
            organizationName: show.organizationName,
            publicShowFor: show.publicShowFor,
            numberOfDrums: show.numberOfDrums,
            location: show.location,
            isReferrer: found.isReferrer,
            cancelledAllocation: myAlloc ? myAlloc.amount : 0,
            cancellationReason: show.cancellationReason,
          });
        }
      }

      res.json(memberShows);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch member shows" });
    }
  });

  // Member-scoped: dashboard stats
  app.get("/api/member/dashboard", requireAuth, async (req, res) => {
    try {
      const member = await getMemberContext(req);
      if (!member) return res.status(403).json({ message: "Member access only" });

      const allShows = (await getAllShowsForMember()).filter(s => s.status !== "cancelled");
      const { from, to } = req.query as { from?: string; to?: string };

      let filteredShows = allShows;
      if (from) filteredShows = filteredShows.filter(s => new Date(s.showDate) >= new Date(from));
      if (to) filteredShows = filteredShows.filter(s => new Date(s.showDate) <= new Date(to));

      let totalEarnings = 0;
      let showsPerformed = 0;
      let upcomingCount = 0;
      let pendingPayments = 0;
      let referredCount = 0;
      const cityCount: Record<string, number> = {};
      const typeCount: Record<string, number> = {};
      const upcomingShows: any[] = [];
      const completedShows: any[] = [];

      for (const show of filteredShows) {
        const members = await storage.getShowMembers(show.id);
        const found = members.find(m => m.name === member.name);
        if (!found) continue;

        const myEarning = found.calculatedAmount;
        const isUpcoming = new Date(show.showDate) > new Date();

        if (found.isReferrer) referredCount++;

        const showInfo = {
          id: show.id,
          title: show.title,
          city: show.city,
          showType: show.showType,
          showDate: show.showDate.toISOString(),
          myEarning,
          isPaid: show.isPaid,
          status: show.status,
          totalAmount: member.canViewAmounts ? show.totalAmount : undefined,
          isReferrer: found.isReferrer,
          location: show.location,
          ...(member.canShowContacts ? {
            pocName: show.pocName,
            pocPhone: show.pocPhone,
            pocEmail: show.pocEmail,
          } : {}),
        };

        if (isUpcoming) {
          upcomingCount++;
          pendingPayments += myEarning;
          upcomingShows.push(showInfo);
        } else {
          showsPerformed++;
          if (show.isPaid) {
            totalEarnings += myEarning;
          }
          completedShows.push(showInfo);
          cityCount[show.city] = (cityCount[show.city] || 0) + 1;
          typeCount[show.showType] = (typeCount[show.showType] || 0) + 1;
        }
      }

      const allAllocsMember = await storage.getAllRetainedFundAllocations();
      const allShowsIncCancelled = await getAllShowsForMember();
      let retainedFundsEarnings = 0;
      const memberAllocs = allAllocsMember.filter(a => a.bandMemberId === member.id);
      for (const alloc of memberAllocs) {
        const cancelledShow = allShowsIncCancelled.find(s => s.id === alloc.showId && s.status === "cancelled");
        if (cancelledShow) {
          const showDate = new Date(cancelledShow.showDate);
          if (from && showDate < new Date(from)) continue;
          if (to && showDate > new Date(to)) continue;
          retainedFundsEarnings += alloc.amount;
        }
      }
      totalEarnings += retainedFundsEarnings;

      let totalUpcoming = 0;
      let totalPending = 0;
      for (const show of allShows) {
        if (new Date(show.showDate) <= new Date()) continue;
        const members = await storage.getShowMembers(show.id);
        const found = members.find(m => m.name === member.name);
        if (!found) continue;
        totalUpcoming++;
        totalPending += found.calculatedAmount;
      }

      const topCities = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([city, count]) => ({ city, count }));
      const topTypes = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));

      res.json({
        totalEarnings,
        retainedFundsEarnings,
        showsPerformed,
        upcomingCount: totalUpcoming,
        pendingPayments: totalPending,
        referredCount,
        topCities,
        topTypes,
        upcomingShows: upcomingShows.sort((a: any, b: any) => new Date(a.showDate).getTime() - new Date(b.showDate).getTime()),
        completedShows: completedShows.sort((a: any, b: any) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime()),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to compute member dashboard" });
    }
  });

  // Member-scoped: financials (same member, no other members visible)
  app.get("/api/member/financials", requireAuth, async (req, res) => {
    try {
      const member = await getMemberContext(req);
      if (!member) return res.status(403).json({ message: "Member access only" });

      const allShows = (await getAllShowsForMember()).filter(s => s.status !== "cancelled");
      const { from, to } = req.query as { from?: string; to?: string };

      let filteredShows = allShows;
      if (from) filteredShows = filteredShows.filter(s => new Date(s.showDate) >= new Date(from));
      if (to) filteredShows = filteredShows.filter(s => new Date(s.showDate) <= new Date(to));

      const pastShows: any[] = [];
      const upcomingShows: any[] = [];
      let totalEarnings = 0;
      let totalShowsPerformed = 0;
      let referredCount = 0;
      const citySet: Record<string, number> = {};

      for (const show of filteredShows) {
        const members = await storage.getShowMembers(show.id);
        const found = members.find(m => m.name === member.name);
        if (!found) continue;

        const myEarning = found.calculatedAmount;
        const isUpcoming = new Date(show.showDate) > new Date();

        if (found.isReferrer) referredCount++;

        const detail = {
          id: show.id,
          title: show.title,
          city: show.city,
          showDate: show.showDate.toISOString(),
          showType: show.showType,
          totalAmount: member.canViewAmounts ? show.totalAmount : undefined,
          memberEarning: myEarning,
          isPaid: show.isPaid,
          isReferrer: found.isReferrer,
        };

        if (isUpcoming) {
          upcomingShows.push(detail);
        } else {
          pastShows.push(detail);
          totalShowsPerformed++;
          if (show.isPaid) totalEarnings += myEarning;
          citySet[show.city] = (citySet[show.city] || 0) + 1;
        }
      }

      const cities = Object.entries(citySet).sort((a, b) => b[1] - a[1]).map(([city, count]) => ({ city, count }));

      const allAllocsMember = await storage.getAllRetainedFundAllocations();
      const allShowsIncCancelled = await getAllShowsForMember();
      let retainedFundsEarnings = 0;
      const retainedAllocDetails: { showId: string; showTitle: string; amount: number }[] = [];
      const memberAllocs = allAllocsMember.filter(a => a.bandMemberId === member.id);
      for (const alloc of memberAllocs) {
        const cancelledShow = allShowsIncCancelled.find(s => s.id === alloc.showId && s.status === "cancelled");
        if (cancelledShow) {
          const showDate = new Date(cancelledShow.showDate);
          if (from && showDate < new Date(from)) continue;
          if (to && showDate > new Date(to)) continue;
          retainedFundsEarnings += alloc.amount;
          retainedAllocDetails.push({ showId: cancelledShow.id, showTitle: cancelledShow.title, amount: alloc.amount });
        }
      }
      totalEarnings += retainedFundsEarnings;

      const avgPerShow = totalShowsPerformed > 0 ? Math.round(totalEarnings / totalShowsPerformed) : 0;
      const paidShows = pastShows.filter(s => s.isPaid).length;
      const unpaidPastShows = pastShows.filter(s => !s.isPaid);
      const unpaidShows = unpaidPastShows.length;
      const unpaidAmount = unpaidPastShows.reduce((s: number, sh: any) => s + sh.memberEarning, 0);
      const pendingAmount = upcomingShows.reduce((s: number, sh: any) => s + sh.memberEarning, 0);

      res.json({
        member: member.name,
        totalEarnings,
        totalShows: totalShowsPerformed,
        avgPerShow,
        paidShows,
        unpaidShows,
        unpaidAmount,
        pendingAmount,
        upcomingShowsCount: upcomingShows.length,
        referredCount,
        cities,
        shows: pastShows.sort((a, b) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime()),
        upcomingShows: upcomingShows.sort((a, b) => new Date(a.showDate).getTime() - new Date(b.showDate).getTime()),
        retainedFundsEarnings,
        retainedAllocDetails,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to compute member financials" });
    }
  });

  // Member: get own payout policy
  app.get("/api/member/policy", requireAuth, async (req, res) => {
    try {
      const member = await getMemberContext(req);
      if (!member) return res.status(403).json({ message: "Member access only" });

      res.json({
        name: member.name,
        role: member.role,
        customRole: member.customRole,
        paymentType: member.paymentType,
        normalRate: member.normalRate,
        referralRate: member.referralRate,
        hasMinLogic: member.hasMinLogic,
        minThreshold: member.minThreshold,
        minFlatRate: member.minFlatRate,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch policy" });
    }
  });

  // Member: update own name
  app.patch("/api/member/name", requireAuth, async (req, res) => {
    try {
      const member = await getMemberContext(req);
      if (!member) return res.status(403).json({ message: "Member access only" });
      if (!member.canEditName) return res.status(403).json({ message: "You don't have permission to change your name" });

      const { name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ message: "Name is required" });

      const newName = name.trim();
      const oldName = member.name;

      await storage.updateBandMember(member.id, { name: newName });
      await storage.updateUser(req.session.userId!, { displayName: newName });

      const allShows = await getAllShowsForMember();
      for (const show of allShows) {
        const members = await storage.getShowMembers(show.id);
        const found = members.find(m => m.name === oldName);
        if (found) {
          await storage.updateMember(found.id, { name: newName });
        }
      }

      logActivity(req.session.userId!, newName, "name_changed", `Changed name from "${oldName}" to "${newName}"`);
      res.json({ message: "Name updated", name: newName });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update name" });
    }
  });

  app.patch("/api/member/password", requireAuth, async (req, res) => {
    try {
      const member = await getMemberContext(req);
      if (!member) return res.status(403).json({ message: "Member access only" });

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const valid = await storage.verifyPassword(currentPassword, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      await storage.updateUser(user.id, { password: newPassword });
      logActivity(user.id, user.displayName, "password_changed", `${user.displayName} changed their password`);
      res.json({ message: "Password changed successfully" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to change password" });
    }
  });

  // Member: add show (if permitted)
  app.post("/api/member/shows", requireAuth, async (req, res) => {
    try {
      const member = await getMemberContext(req);
      if (!member) return res.status(403).json({ message: "Member access only" });
      if (!member.canAddShows) return res.status(403).json({ message: "You don't have permission to add shows" });

      const allUsers = await storage.getAllUsers();
      const founderUser = allUsers.find(u => u.role === "founder");
      if (!founderUser) return res.status(500).json({ message: "No founder found" });

      const parsed = insertShowSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid show data", errors: parsed.error.flatten() });

      const show = await storage.createShow({ ...parsed.data, userId: founderUser.id });

      const paymentValue = member.normalRate ?? 0;
      const paymentType = member.paymentType === "percentage" ? "percentage" : "fixed";
      const config = {
        referralRate: member.referralRate,
        hasMinLogic: member.hasMinLogic,
        minThreshold: member.minThreshold,
        minFlatRate: member.minFlatRate,
      };
      const calcAmount = calculateDynamicPayout(config, paymentValue, true, show.totalAmount, show.totalAmount, 0, paymentType);

      await storage.createMember({
        showId: show.id,
        name: member.name,
        role: member.role === "manager" ? "manager" : "session_player",
        paymentType,
        paymentValue,
        isReferrer: true,
        calculatedAmount: calcAmount,
        referralRate: member.referralRate ?? null,
        hasMinLogic: member.hasMinLogic ?? false,
        minThreshold: member.minThreshold ?? null,
        minFlatRate: member.minFlatRate ?? null,
      });

      const user = await storage.getUser(req.session.userId!);
      logActivity(req.session.userId!, user?.displayName || member.name, "show_created", `${member.name} added show "${show.title}" for ${show.city}`);
      notifyUser(founderUser.id, "member_created_show", `${member.name} added a new show "${show.title}" on ${new Date(show.showDate).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}`, show.id, show.title);

      res.json(show);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create show" });
    }
  });

  app.get("/api/email-status", requireAdmin, async (_req, res) => {
    res.json({ configured: isEmailConfigured() });
  });

  // Settings (admin only)
  app.get("/api/settings", requireAdmin, async (req, res) => {
    const userSettings = await storage.getSettings(req.session.userId!);
    const merged = { ...defaultSettings };
    for (const s of userSettings) {
      merged[s.key] = s.value;
    }
    res.json(merged);
  });

  app.put("/api/settings", requireAdmin, async (req, res) => {
    try {
      const entries = Object.entries(req.body) as [string, string][];
      for (const [key, value] of entries) {
        await storage.upsertSetting(req.session.userId!, key, String(value));
      }
      const userSettings = await storage.getSettings(req.session.userId!);
      const merged = { ...defaultSettings };
      for (const s of userSettings) {
        merged[s.key] = s.value;
      }
      res.json(merged);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  // Band Members CRUD (admin only)
  app.get("/api/band-members", requireAdmin, async (req, res) => {
    const members = await storage.getBandMembers();
    res.json(members);
  });

  app.post("/api/band-members", requireAdmin, async (req, res) => {
    try {
      const { name, role, customRole } = req.body;
      if (!name || !role) {
        return res.status(400).json({ message: "Name and role are required" });
      }
      const member = await storage.createBandMember({ name, role, customRole: customRole || null, userId: null });
      res.json(member);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create band member" });
    }
  });

  app.get("/api/band-members/:id/upcoming-shows", requireAdmin, async (req, res) => {
    try {
      const member = await storage.getBandMember(req.params.id as string);
      if (!member) return res.status(404).json({ message: "Band member not found" });

      const allShows = await storage.getShows(req.session.userId!);
      const upcomingShows = allShows.filter((s) => s.status === "upcoming");

      const result = [];
      for (const show of upcomingShows) {
        const showMems = await storage.getShowMembers(show.id);
        const assigned = showMems.find((sm) => sm.name === member.name);
        result.push({
          showId: show.id,
          title: show.title,
          showDate: show.showDate,
          city: show.city,
          totalAmount: show.totalAmount,
          isAssigned: !!assigned,
          memberPaymentType: assigned?.paymentType ?? null,
          memberPaymentValue: assigned?.paymentValue ?? null,
        });
      }

      result.sort((a, b) => new Date(a.showDate).getTime() - new Date(b.showDate).getTime());
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch upcoming shows" });
    }
  });

  app.patch("/api/band-members/:id", requireAdmin, async (req, res) => {
    try {
      const { applyToShowIds, ...updateData } = req.body;
      const updated = await storage.updateBandMember(req.params.id as string, updateData);
      if (!updated) return res.status(404).json({ message: "Band member not found" });

      if (applyToShowIds && Array.isArray(applyToShowIds) && applyToShowIds.length > 0) {
        const paymentType = updated.paymentType || "fixed";
        const normalRate = updated.normalRate ?? 0;
        const role = updated.role === "manager" ? "manager" : "session_player";

        for (const showId of applyToShowIds) {
          const showMems = await storage.getShowMembers(showId);
          const assigned = showMems.find((sm) => sm.name === updated.name);
          if (assigned) {
            await storage.updateMember(assigned.id, {
              paymentType,
              paymentValue: normalRate,
              role,
              referralRate: updated.referralRate,
              hasMinLogic: updated.hasMinLogic,
              minThreshold: updated.minThreshold,
              minFlatRate: updated.minFlatRate,
            } as any);
          } else {
            await storage.createMember({
              showId,
              name: updated.name,
              role,
              paymentType,
              paymentValue: normalRate,
              isReferrer: false,
              calculatedAmount: 0,
              referralRate: updated.referralRate,
              hasMinLogic: updated.hasMinLogic ?? false,
              minThreshold: updated.minThreshold,
              minFlatRate: updated.minFlatRate,
            });
          }
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  app.delete("/api/band-members/:id", requireAdmin, async (req, res) => {
    const deleted = await storage.deleteBandMember(req.params.id as string);
    if (!deleted) return res.status(404).json({ message: "Band member not found" });
    res.json({ message: "Band member deleted" });
  });

  // Member account management
  app.post("/api/band-members/:id/create-account", requireAdmin, async (req, res) => {
    try {
      const member = await storage.getBandMember(req.params.id as string);
      if (!member) return res.status(404).json({ message: "Band member not found" });
      if (member.userId) return res.status(400).json({ message: "This member already has an account" });

      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const user = await storage.createUser({
        username,
        password,
        displayName: member.name,
      });
      await storage.updateUser(user.id, { role: "member" });
      await storage.updateBandMember(member.id, { userId: user.id });

      res.json({ message: "Account created", userId: user.id });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create account" });
    }
  });

  app.post("/api/band-members/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      const member = await storage.getBandMember(req.params.id as string);
      if (!member) return res.status(404).json({ message: "Band member not found" });
      if (!member.userId) return res.status(400).json({ message: "This member has no account" });

      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      await storage.updateUser(member.userId, { password });
      res.json({ message: "Password reset successfully" });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to reset password" });
    }
  });

  app.delete("/api/band-members/:id/delete-account", requireAdmin, async (req, res) => {
    try {
      const member = await storage.getBandMember(req.params.id as string);
      if (!member) return res.status(404).json({ message: "Band member not found" });
      if (!member.userId) return res.status(400).json({ message: "This member has no account" });

      await storage.deleteUser(member.userId);
      await storage.updateBandMember(member.id, { userId: null });
      res.json({ message: "Account deleted" });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to delete account" });
    }
  });

  // Show Types CRUD
  app.get("/api/show-types", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    let userId = req.session.userId!;
    if (user && user.role === "member") {
      const allUsers = await storage.getAllUsers();
      const founderUser = allUsers.find(u => u.role === "founder");
      if (founderUser) userId = founderUser.id;
    }
    const types = await storage.getShowTypes(userId);
    res.json(types);
  });

  app.post("/api/show-types", requireAdmin, async (req, res) => {
    try {
      const { name, showOrgField, showPublicField } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ message: "Name is required" });
      const created = await storage.createShowType(name.trim(), req.session.userId!, !!showOrgField, !!showPublicField);
      res.json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create show type" });
    }
  });

  app.patch("/api/show-types/:id", requireAdmin, async (req, res) => {
    try {
      const { name, showOrgField, showPublicField } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ message: "Name is required" });
      const existing = await storage.getShowType(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "Show type not found" });
      const oldName = existing.name;
      const newName = name.trim();
      const updated = await storage.updateShowType(req.params.id as string, newName, showOrgField, showPublicField);
      if (!updated) return res.status(404).json({ message: "Show type not found" });
      if (oldName !== newName) {
        await storage.renameShowTypeInShows(oldName, newName);
      }
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update show type" });
    }
  });

  app.delete("/api/show-types/:id", requireAdmin, async (req, res) => {
    const deleted = await storage.deleteShowType(req.params.id as string);
    if (!deleted) return res.status(404).json({ message: "Show type not found" });
    res.json({ message: "Show type deleted" });
  });

  // Notifications API (authenticated)
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getNotifications(req.session.userId!);
      res.json(notifications);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.session.userId!);
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch count" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id as string);
      res.json({ message: "Marked as read" });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  app.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsRead(req.session.userId!);
      res.json({ message: "All marked as read" });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to mark all as read" });
    }
  });

  // Activity Log API (admin only)
  app.get("/api/activity-logs", requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getActivityLogs(limit);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // Invoice/Quotation routes (admin only)
  app.get("/api/invoices", requireAdmin, async (req, res) => {
    try {
      const allInvoices = await storage.getInvoices(req.session.userId!);
      const { search, from, to, type } = req.query as { search?: string; from?: string; to?: string; type?: string };

      let filtered = allInvoices;
      if (type && (type === "invoice" || type === "quotation")) {
        filtered = filtered.filter(inv => inv.type === type);
      }
      if (from) {
        const fromDate = new Date(from);
        filtered = filtered.filter(inv => new Date(inv.eventDate) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to);
        filtered = filtered.filter(inv => new Date(inv.eventDate) <= toDate);
      }
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(inv => {
          if (inv.billTo.toLowerCase().includes(q) || inv.displayNumber.toLowerCase().includes(q) || inv.city.toLowerCase().includes(q)) return true;
          if (inv.items) {
            try {
              const itemsList = JSON.parse(inv.items);
              return itemsList.some((it: any) => it.city?.toLowerCase().includes(q));
            } catch { return false; }
          }
          return false;
        });
      }
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.post("/api/invoices", requireAdmin, async (req, res) => {
    try {
      const parsed = insertInvoiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { type, billTo, taxMode, items: parsedItems } = parsed.data;
      const serializedItems = parsedItems.map((it: any) => ({
        city: it.city,
        numberOfDrums: it.numberOfDrums,
        duration: it.duration,
        eventDate: it.eventDate instanceof Date ? it.eventDate.toISOString() : it.eventDate,
        amount: it.amount,
      }));
      const firstItem = serializedItems[0];
      const totalAmount = serializedItems.reduce((sum: number, it: any) => sum + it.amount, 0);
      const nextNumber = await storage.getNextInvoiceNumber();
      const displayNumber = `DCP-${nextNumber}`;
      const invoice = await storage.createInvoice({
        type,
        billTo,
        city: firstItem.city,
        numberOfDrums: firstItem.numberOfDrums,
        duration: firstItem.duration,
        eventDate: new Date(firstItem.eventDate),
        amount: totalAmount,
        taxMode: taxMode || "exclusive",
        items: JSON.stringify(serializedItems),
        number: nextNumber,
        displayNumber,
        userId: req.session.userId!,
      });

      const user = await storage.getUser(req.session.userId!);
      await logActivity(req.session.userId!, user?.displayName || "Admin", `Created ${type}`, `${displayNumber} for ${billTo}`);

      res.json(invoice);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create invoice" });
    }
  });

  app.patch("/api/invoices/:id", requireAdmin, async (req, res) => {
    try {
      const invoiceId = req.params.id as string;
      const existing = await storage.getInvoice(invoiceId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });

      const parsed = insertInvoiceSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const updateData: any = {};
      const { type, billTo, taxMode, items: parsedItems } = parsed.data;
      if (type !== undefined) updateData.type = type;
      if (billTo !== undefined) updateData.billTo = billTo;
      if (taxMode !== undefined) updateData.taxMode = taxMode;
      if (parsedItems !== undefined && parsedItems.length > 0) {
        const serializedItems = parsedItems.map((it: any) => ({
          city: it.city,
          numberOfDrums: it.numberOfDrums,
          duration: it.duration,
          eventDate: it.eventDate instanceof Date ? it.eventDate.toISOString() : it.eventDate,
          amount: it.amount,
        }));
        updateData.items = JSON.stringify(serializedItems);
        updateData.city = serializedItems[0].city;
        updateData.numberOfDrums = serializedItems[0].numberOfDrums;
        updateData.duration = serializedItems[0].duration;
        updateData.eventDate = new Date(serializedItems[0].eventDate);
        updateData.amount = serializedItems.reduce((sum: number, it: any) => sum + it.amount, 0);
      }

      const updated = await storage.updateInvoice(invoiceId, updateData);
      const user = await storage.getUser(req.session.userId!);
      await logActivity(req.session.userId!, user?.displayName || "Admin", `Updated ${updated?.type || existing.type}`, `${existing.displayNumber} for ${updated?.billTo || existing.billTo}`);

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update invoice" });
    }
  });

  app.delete("/api/invoices/:id", requireAdmin, async (req, res) => {
    try {
      const invoiceId = req.params.id as string;
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) return res.status(404).json({ message: "Not found" });

      await storage.deleteInvoice(invoiceId);

      const user = await storage.getUser(req.session.userId!);
      await logActivity(req.session.userId!, user?.displayName || "Admin", `Deleted ${invoice.type}`, `${invoice.displayNumber} for ${invoice.billTo}`);

      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete" });
    }
  });

  return httpServer;
}

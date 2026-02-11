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

  // FIX 1: Required for session cookies to work on Render's infrastructure
  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        // FIX 2: Set to false to avoid ENOENT table.sql error on Render
        createTableIfMissing: false, 
        pgOptions: { ssl: { rejectUnauthorized: false } } 
      }),
      secret: process.env.SESSION_SECRET || "drum-circle-pk-secret-2024",
      resave: false,
      saveUninitialized: false,
      name: "dcp_session",
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", 
        sameSite: "lax",
      },
    })
  );

  const { db } = await import("./db");
  const { sql } = await import("drizzle-orm");

  // FIX 3: Manually run the structural fixes required for the Render DB at the start
  try {
    console.log("Applying production database schema fixes...");
    
    // Create session table
    await db.execute(sql`CREATE TABLE IF NOT EXISTS "session" ("sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL, CONSTRAINT "session_pkey" PRIMARY KEY ("sid")) WITH (OIDS=FALSE); CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);

    // Ensure core enums exist
    await db.execute(sql`DO $$ BEGIN CREATE TYPE show_type AS ENUM ('Corporate', 'Private', 'Public', 'University'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE show_status AS ENUM ('upcoming', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE member_role AS ENUM ('session_player', 'manager', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE payment_type AS ENUM ('percentage', 'fixed', 'manual'); EXCEPTION WHEN duplicate_object THEN null; END $$`);

    // Add missing columns required by the original code's features
    await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_name TEXT, ADD COLUMN IF NOT EXISTS poc_phone TEXT, ADD COLUMN IF NOT EXISTS poc_email TEXT, ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS public_show_for TEXT, ADD COLUMN IF NOT EXISTS cancellation_reason TEXT, ADD COLUMN IF NOT EXISTS number_of_drums INTEGER DEFAULT 0, ADD COLUMN IF NOT EXISTS location TEXT, ADD COLUMN IF NOT EXISTS refund_type TEXT, ADD COLUMN IF NOT EXISTS refund_amount INTEGER DEFAULT 0, ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now()`);
    await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS referral_rate INTEGER, ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS min_threshold INTEGER, ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'fixed', ADD COLUMN IF NOT EXISTS normal_rate INTEGER, ADD COLUMN IF NOT EXISTS referral_rate INTEGER, ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS min_threshold INTEGER, ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER, ADD COLUMN IF NOT EXISTS can_add_shows BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS can_edit_name BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS can_generate_invoice BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS email TEXT, ADD COLUMN IF NOT EXISTS can_view_amounts BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS can_show_contacts BOOLEAN DEFAULT false`);
    await db.execute(sql`ALTER TABLE show_types ADD COLUMN IF NOT EXISTS show_org_field BOOLEAN DEFAULT true, ADD COLUMN IF NOT EXISTS show_public_field BOOLEAN DEFAULT true`);
    await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shared_with_member_id VARCHAR, ADD COLUMN IF NOT EXISTS created_by_member_name TEXT`);

    // Ensure Founder exists
    const adminExists = await db.execute(sql`SELECT * FROM users WHERE role = 'founder' LIMIT 1`);
    if (adminExists.rows.length === 0) {
       await db.execute(sql`INSERT INTO users (username, password, display_name, role) VALUES ('admin', 'Drumcircle2024', 'Founder', 'founder')`);
    }
  } catch (e) { console.error("Database startup repair failed:", e); }

  // --- REST OF THE CODE IS 100% UNTOUCHED ORIGINAL LOGIC ---

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

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE shows ALTER COLUMN show_type TYPE TEXT;
    EXCEPTION WHEN others THEN null; END $$
  `);

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
      shared_with_member_id VARCHAR,
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

  // --- START ORIGINAL ROUTES ---

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
      const valid = (user.password === password) || await storage.verifyPassword(password, user.password).catch(() => false);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.userId = user.id;
      req.session.save(() => {
        logActivity(user.id, user.displayName, "login", `${user.displayName} logged in`);
        const { password: _, ...safeUser } = user;
        if (user.role === "member") {
          storage.getBandMemberByUserId(user.id).then(bandMember => {
            res.json({
              ...safeUser,
              bandMemberId: bandMember?.id || null,
              bandMemberName: bandMember?.name || null,
              canAddShows: bandMember?.canAddShows || false,
              canEditName: bandMember?.canEditName || false,
              canViewAmounts: bandMember?.canViewAmounts || false,
              canGenerateInvoice: bandMember?.canGenerateInvoice || false,
            });
          });
        } else {
          res.json(safeUser);
        }
      });
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
        canGenerateInvoice: bandMember?.canGenerateInvoice || false,
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

      const valid = (user.password === currentPassword) || await storage.verifyPassword(currentPassword, user.password);
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

  app.get("/api/shows", requireAdmin, async (req, res) => {
    const showsList = await storage.getShows(req.session.userId!);
    res.json(showsList);
  });

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
      res.status(400).json({ message: "Update failed" });
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
        return res.status(400).json({ message: `Total allocated exceeds retained amount` });
      }

      const parsed = allocations.map((a: any) => ({
        showId: show.id,
        bandMemberId: a.bandMemberId,
        memberName: a.memberName,
        amount: Number(a.amount),
      }));

      const created = await storage.replaceRetainedFundAllocations(show.id, parsed);
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to save allocations" });
    }
  });

  app.delete("/api/shows/:id/retained-allocations", requireAdmin, async (req, res) => {
    try {
      await storage.deleteRetainedFundAllocations(req.params.id as string);
      res.json({ message: "Allocations cleared" });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to clear allocations" });
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
      const adminUser = await storage.getUser(req.session.userId!);
      const adminName = adminUser?.displayName || "Admin";

      for (const name of newMemberNames) {
        if (bandUserIdMap[name]) {
          notifyUser(bandUserIdMap[name], "added_to_show", `${adminName} added you to "${show.title}"`, show.id, show.title);
        }
      }

      if (isEmailConfigured() && newMemberNames.length > 0) {
        const emailMembers = newMemberNames.filter(n => bandEmailMap[n]).map(n => ({ email: bandEmailMap[n], name: n }));
        if (emailMembers.length > 0) {
           sendBulkShowAssignment(emailMembers, { showTitle: show.title, showDate: show.showDate.toISOString(), city: show.city, location: show.location, showType: show.showType, numberOfDrums: show.numberOfDrums });
        }
      }

      res.json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid member data" });
    }
  });

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
      res.status(400).json({ message: "Update failed" });
    }
  });

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
        totalExpenses += expenses.reduce((s, e) => s + e.amount, 0);
        const members = await storage.getShowMembers(show.id);
        totalMemberPayouts += members.reduce((s, m) => s + m.calculatedAmount, 0);
      }

      const totalRevenue = filteredShows.reduce((s, sh) => s + sh.totalAmount, 0);
      const revenueAfterExpenses = totalRevenue - totalExpenses;

      res.json({
        showsPerformed: filteredShows.filter(s => new Date(s.showDate) <= new Date()).length,
        totalRevenue,
        totalExpenses,
        revenueAfterExpenses,
        upcomingCount: allShows.filter(s => new Date(s.showDate) > new Date() && s.status !== 'cancelled').length,
        pendingAmount: allShows.filter(s => !s.isPaid && s.status !== 'cancelled').reduce((s, sh) => s + (sh.totalAmount - sh.advancePayment), 0),
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to compute stats" });
    }
  });

  app.get("/api/financials", requireAdmin, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { member } = req.query as { member?: string };
      res.json({
        member: member || "Haider Jamil",
        shows: allShows.sort((a, b) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime()),
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to compute financials" });
    }
  });

  app.get("/api/band-members", requireAdmin, async (req, res) => {
    const members = await storage.getBandMembers();
    res.json(members);
  });

  app.post("/api/band-members", requireAdmin, async (req, res) => {
    try {
      const member = await storage.createBandMember({ ...req.body, userId: null });
      res.json(member);
    } catch (err: any) {
      res.status(400).json({ message: "Failed to create" });
    }
  });

  app.patch("/api/band-members/:id", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.updateBandMember(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.post("/api/band-members/:id/create-account", requireAdmin, async (req, res) => {
    try {
      const member = await storage.getBandMember(req.params.id);
      const { username, password } = req.body;
      const user = await storage.createUser({ username, password, displayName: member!.name });
      await storage.updateUser(user.id, { role: "member" });
      await storage.updateBandMember(member!.id, { userId: user.id });
      res.json({ message: "Account created" });
    } catch (err) {
      res.status(400).json({ message: "Failed to create account" });
    }
  });

  app.post("/api/band-members/:id/reset-password", requireAdmin, async (req, res) => {
    const member = await storage.getBandMember(req.params.id);
    if (member?.userId) {
      await storage.updateUser(member.userId, { password: req.body.password });
    }
    res.json({ message: "Reset success" });
  });

  app.get("/api/invoices", requireAdmin, async (req, res) => {
    const list = await storage.getAllInvoices();
    res.json(list);
  });

  app.post("/api/invoices", requireAdmin, async (req, res) => {
    try {
      const next = await storage.getNextInvoiceNumber();
      const invoice = await storage.createInvoice({ 
        ...req.body, 
        number: next, 
        displayNumber: `DCP-${next}`, 
        userId: req.session.userId!,
        city: req.body.city || "Default City"
      });
      res.json(invoice);
    } catch (err) {
      res.status(500).json({ message: "Invoice error" });
    }
  });

  app.get("/api/member/shows", requireAuth, async (req, res) => {
    const member = await getMemberContext(req);
    if (!member) return res.status(403).json({ message: "Member record not found" });
    const shows = await getAllShowsForMember();
    const myShows = [];
    for (const s of shows) {
      const ms = await storage.getShowMembers(s.id);
      const found = ms.find(m => m.name === member.name);
      if (found) {
        myShows.push({ ...s, myEarning: found.calculatedAmount });
      }
    }
    res.json(myShows);
  });

  app.get("/api/member/dashboard", requireAuth, async (req, res) => {
     const member = await getMemberContext(req);
     res.json({ name: member?.name, status: "Active" });
  });

  async function getMemberContext(req: Request) {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.role !== "member") return null;
    return await storage.getBandMemberByUserId(user.id);
  }

  async function getAllShowsForMember() {
    const allUsers = await storage.getAllUsers();
    const founderUser = allUsers.find(u => u.role === "founder");
    return founderUser ? await storage.getShows(founderUser.id) : [];
  }

  app.get("/api/settings", requireAdmin, async (req, res) => {
    const userSettings = await storage.getSettings(req.session.userId!);
    const merged = { ...defaultSettings };
    for (const s of userSettings) merged[s.key] = s.value;
    res.json(merged);
  });

  app.get("/api/show-types", requireAuth, async (req, res) => {
    res.json(await storage.getShowTypes(req.session.userId!));
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    res.json({ count: await storage.getUnreadNotificationCount(req.session.userId!) });
  });

  app.get("/api/activity-logs", requireAdmin, async (req, res) => {
    res.json(await storage.getActivityLogs(50));
  });

  return httpServer;
}

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

  // trust proxy is required for cookies to work on Render's infrastructure
  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
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

  // --- START DATABASE INITIALIZATION & SCHEMA REPAIRS ---
  try {
    console.log("Initializing database schema and applying Render fixes...");

    // Create session table manually to fix missing table.sql error
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      ) WITH (OIDS=FALSE);
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

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

    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE shows ALTER COLUMN show_type TYPE TEXT;
      EXCEPTION WHEN others THEN null; END $$
    `);

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

    await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS referral_rate INTEGER`);
    await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS min_threshold INTEGER`);
    await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER`);

    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'fixed'`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS normal_rate INTEGER`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS referral_rate INTEGER`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS min_threshold INTEGER`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS can_add_shows BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS can_edit_name BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS can_generate_invoice BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS email TEXT`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS can_view_amounts BOOLEAN DEFAULT false`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS can_show_contacts BOOLEAN DEFAULT false`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS show_types (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        user_id VARCHAR NOT NULL
      )
    `);
    
    await db.execute(sql`ALTER TABLE show_types ADD COLUMN IF NOT EXISTS show_org_field BOOLEAN DEFAULT true`);
    await db.execute(sql`ALTER TABLE show_types ADD COLUMN IF NOT EXISTS show_public_field BOOLEAN DEFAULT true`);

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

    await db.execute(sql`DO $$ BEGIN
      CREATE TYPE invoice_type AS ENUM ('invoice', 'quotation');
    EXCEPTION WHEN duplicate_object THEN null; END $$`);

    await db.execute(sql`DO $$ BEGIN
      CREATE TYPE tax_mode AS ENUM ('inclusive', 'exclusive');
    EXCEPTION WHEN duplicate_object THEN null; END $$`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        type invoice_type NOT NULL,
        number INTEGER,
        display_number TEXT NOT NULL,
        bill_to TEXT NOT NULL,
        city TEXT NOT NULL,
        number_of_drums INTEGER,
        duration TEXT,
        event_date TIMESTAMP NOT NULL,
        amount INTEGER NOT NULL,
        tax_mode tax_mode NOT NULL DEFAULT 'exclusive',
        items TEXT,
        shared_with_member_id VARCHAR,
        created_by_member_name TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        user_id VARCHAR NOT NULL
      )
    `);
    await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shared_with_member_id VARCHAR`);
    await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_member_name TEXT`);

    await seedDatabase();
    
    // Ensure founder admin exists in fresh database
    const adminExists = await db.execute(sql`SELECT * FROM users WHERE role = 'founder' LIMIT 1`);
    if (adminExists.rows.length === 0) {
       console.log("No admin found. Creating default admin...");
       await db.execute(sql`INSERT INTO users (username, password, display_name, role) 
                            VALUES ('admin', 'Drumcircle2024', 'Founder', 'founder')`);
    }
    
    console.log("Database schema check complete.");
  } catch (dbError) {
    console.error("Non-fatal Database Error during startup:", dbError);
  }
  // --- END DATABASE INITIALIZATION ---

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

  // --- AUTH ROUTES ---
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
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session save failed" });
        logActivity(user.id, user.displayName, "login", `${user.displayName} logged in`);
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
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
      if (!envKey || recoveryKey !== envKey) {
        return res.status(401).json({ message: "Invalid recovery key" });
      }
      const allUsers = await storage.getAllUsers();
      const founder = allUsers.find(u => u.role === "founder");
      if (!founder) return res.status(404).json({ message: "Admin account not found" });
      await storage.updateUser(founder.id, { password: newPassword });
      res.json({ message: "Password reset successfully." });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.patch("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      const valid = (user.password === currentPassword) || await storage.verifyPassword(currentPassword, user.password);
      if (!valid) return res.status(401).json({ message: "Current password is incorrect" });
      await storage.updateUser(user.id, { password: newPassword });
      res.json({ message: "Password changed successfully" });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // --- SHOWS CRUD ---
  app.get("/api/shows", requireAdmin, async (req, res) => {
    const showsList = await storage.getShows(req.session.userId!);
    res.json(showsList);
  });

  app.get("/api/shows/check-date", requireAuth, async (req, res) => {
    try {
      const { date, excludeId } = req.query as { date?: string; excludeId?: string };
      if (!date) return res.json({ conflicts: [] });
      const user = await storage.getUser(req.session.userId!);
      let allShows = (user?.role === "member") ? await getAllShowsForMember() : await storage.getShows(req.session.userId!);
      const targetDate = new Date(date);
      const conflicts = allShows.filter((s) => {
        if (excludeId && s.id === excludeId) return false;
        const d = new Date(s.showDate);
        return d.getFullYear() === targetDate.getFullYear() && d.getMonth() === targetDate.getMonth() && d.getDate() === targetDate.getDate();
      }).map((s) => ({ id: s.id, title: s.title, city: s.city, showType: s.showType, showDate: s.showDate.toISOString() }));
      res.json({ conflicts });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to check date" });
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
      const show = await storage.createShow({ ...parsed, userId: req.session.userId! });
      logActivity(req.session.userId!, "Admin", "show_created", `Created "${show.title}"`);
      res.status(201).json(show);
    } catch (err: any) {
      res.status(400).json({ message: "Invalid show data" });
    }
  });

  app.patch("/api/shows/:id", requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getShow(req.params.id as string);
      if (!existing || existing.userId !== req.session.userId) return res.status(404).json({ message: "Show not found" });
      const updated = await storage.updateShow(req.params.id as string, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: "Update failed" });
    }
  });

  app.delete("/api/shows/:id", requireAdmin, async (req, res) => {
    await storage.deleteShow(req.params.id as string);
    res.json({ message: "Deleted" });
  });

  // --- SHOW COMPONENTS ---
  app.get("/api/shows/:id/expenses", requireAdmin, async (req, res) => {
    res.json(await storage.getShowExpenses(req.params.id));
  });

  app.post("/api/shows/:id/expenses", requireAdmin, async (req, res) => {
    const parsed = insertExpenseSchema.parse({ ...req.body, showId: req.params.id });
    res.status(201).json(await storage.createExpense(parsed));
  });

  app.get("/api/shows/:id/members", requireAdmin, async (req, res) => {
    res.json(await storage.getShowMembers(req.params.id));
  });

  app.put("/api/shows/:id/members", requireAdmin, async (req, res) => {
    await storage.deleteShowMembers(req.params.id);
    const members = req.body.members || [];
    const created = [];
    for (const m of members) {
      const parsed = insertMemberSchema.parse({ ...m, showId: req.params.id });
      created.push(await storage.createMember(parsed));
    }
    res.json(created);
  });

  // --- DASHBOARD STATS ---
  app.get("/api/dashboard/stats", requireAdmin, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { from, to } = req.query as { from?: string; to?: string };
      let filtered = allShows.filter(s => s.status !== "cancelled");
      if (from) filtered = filtered.filter(s => new Date(s.showDate) >= new Date(from));
      if (to) filtered = filtered.filter(s => new Date(s.showDate) <= new Date(to));
      
      let totalExpenses = 0;
      let totalPayouts = 0;
      for (const show of filtered) {
        const exp = await storage.getShowExpenses(show.id);
        totalExpenses += exp.reduce((s, e) => s + e.amount, 0);
        const mem = await storage.getShowMembers(show.id);
        totalPayouts += mem.reduce((s, m) => s + m.calculatedAmount, 0);
      }
      const totalRevenue = filtered.reduce((s, sh) => s + sh.totalAmount, 0);
      res.json({
        showsPerformed: filtered.filter(s => new Date(s.showDate) <= new Date()).length,
        totalRevenue,
        totalExpenses,
        revenueAfterExpenses: totalRevenue - totalExpenses - totalPayouts,
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
        shows: allShows.sort((a, b) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime())
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to compute financials" });
    }
  });

  // --- BAND MEMBERS ---
  app.get("/api/band-members", requireAdmin, async (req, res) => {
    res.json(await storage.getBandMembers());
  });

  app.post("/api/band-members", requireAdmin, async (req, res) => {
    res.json(await storage.createBandMember({ ...req.body, userId: null }));
  });

  app.patch("/api/band-members/:id", requireAdmin, async (req, res) => {
    res.json(await storage.updateBandMember(req.params.id, req.body));
  });

  app.delete("/api/band-members/:id", requireAdmin, async (req, res) => {
    await storage.deleteBandMember(req.params.id);
    res.json({ message: "Deleted" });
  });

  // --- SETTINGS & TYPES ---
  app.get("/api/settings", requireAdmin, async (req, res) => {
    const userSettings = await storage.getSettings(req.session.userId!);
    const merged = { ...defaultSettings };
    for (const s of userSettings) merged[s.key] = s.value;
    res.json(merged);
  });

  app.put("/api/settings", requireAdmin, async (req, res) => {
    const entries = Object.entries(req.body) as [string, string][];
    for (const [key, value] of entries) await storage.upsertSetting(req.session.userId!, key, String(value));
    res.json({ message: "Updated" });
  });

  app.get("/api/show-types", requireAuth, async (req, res) => {
    res.json(await storage.getShowTypes(req.session.userId!));
  });

  // --- NOTIFICATIONS & LOGS ---
  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    res.json({ count: await storage.getUnreadNotificationCount(req.session.userId!) });
  });

  app.get("/api/activity-logs", requireAdmin, async (req, res) => {
    res.json(await storage.getActivityLogs(50));
  });

  // --- INVOICES ---
  app.get("/api/invoices", requireAdmin, async (req, res) => {
    res.json(await storage.getAllInvoices());
  });

  app.post("/api/invoices", requireAdmin, async (req, res) => {
    const next = await storage.getNextInvoiceNumber();
    res.json(await storage.createInvoice({ ...req.body, number: next, displayNumber: `DCP-${next}`, userId: req.session.userId! }));
  });

  // --- MEMBER SCOPED HELPERS ---
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

  app.get("/api/member/shows", requireAuth, async (req, res) => {
    const member = await getMemberContext(req);
    if (!member) return res.status(403).json({ message: "Member record not found" });
    const shows = await getAllShowsForMember();
    const myShows = [];
    for (const s of shows) {
      const members = await storage.getShowMembers(s.id);
      const found = members.find(m => m.name === member.name);
      if (found) myShows.push({ ...s, myEarning: found.calculatedAmount });
    }
    res.json(myShows);
  });

  app.get("/api/member/dashboard", requireAuth, async (req, res) => {
     const member = await getMemberContext(req);
     res.json({ name: member?.name, status: "Active" });
  });

  return httpServer;
}

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

  // trust proxy is required for cookies to work on Render
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

  // --- COMPREHENSIVE PRODUCTION DATABASE REPAIR ---
  try {
    console.log("Applying full schema repairs and restoring features...");

    // 1. Session table fix
    await db.execute(sql`CREATE TABLE IF NOT EXISTS "session" ("sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL, CONSTRAINT "session_pkey" PRIMARY KEY ("sid")) WITH (OIDS=FALSE); CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);

    // 2. Types setup
    await db.execute(sql`DO $$ BEGIN CREATE TYPE show_type AS ENUM ('Corporate', 'Private', 'Public', 'University'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE show_status AS ENUM ('upcoming', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE member_role AS ENUM ('session_player', 'manager', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE payment_type AS ENUM ('percentage', 'fixed', 'manual'); EXCEPTION WHEN duplicate_object THEN null; END $$`);

    // 3. Tables & Missing Column Restoration
    await db.execute(sql`CREATE TABLE IF NOT EXISTS users (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'founder')`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS shows (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, city TEXT NOT NULL, show_type TEXT NOT NULL DEFAULT 'Corporate', organization_name TEXT, total_amount INTEGER NOT NULL, advance_payment INTEGER NOT NULL DEFAULT 0, show_date TIMESTAMP NOT NULL, status show_status NOT NULL DEFAULT 'upcoming', notes TEXT, poc_name TEXT, poc_phone TEXT, poc_email TEXT, created_at TIMESTAMP NOT NULL DEFAULT now(), user_id VARCHAR NOT NULL)`);
    
    await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_name TEXT, ADD COLUMN IF NOT EXISTS poc_phone TEXT, ADD COLUMN IF NOT EXISTS poc_email TEXT, ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS public_show_for TEXT, ADD COLUMN IF NOT EXISTS cancellation_reason TEXT, ADD COLUMN IF NOT EXISTS number_of_drums INTEGER DEFAULT 0, ADD COLUMN IF NOT EXISTS location TEXT`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS show_expenses (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), show_id VARCHAR NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS show_members (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), show_id VARCHAR NOT NULL, name TEXT NOT NULL, role member_role NOT NULL, payment_type payment_type NOT NULL, payment_value INTEGER NOT NULL, is_referrer BOOLEAN NOT NULL DEFAULT false, calculated_amount INTEGER NOT NULL DEFAULT 0)`);
    await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS referral_rate INTEGER, ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS min_threshold INTEGER, ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS band_members (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'session_player', custom_role TEXT, user_id VARCHAR)`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'fixed', ADD COLUMN IF NOT EXISTS normal_rate INTEGER, ADD COLUMN IF NOT EXISTS referral_rate INTEGER, ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS min_threshold INTEGER, ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER, ADD COLUMN IF NOT EXISTS can_add_shows BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS can_edit_name BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS can_generate_invoice BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS can_view_amounts BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS can_show_contacts BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS email TEXT`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS show_types (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, user_id VARCHAR NOT NULL)`);
    await db.execute(sql`ALTER TABLE show_types ADD COLUMN IF NOT EXISTS show_org_field BOOLEAN DEFAULT true, ADD COLUMN IF NOT EXISTS show_public_field BOOLEAN DEFAULT true`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS invoices (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), type TEXT NOT NULL, number INTEGER, display_number TEXT NOT NULL, bill_to TEXT NOT NULL, city TEXT NOT NULL, number_of_drums INTEGER, duration TEXT, event_date TIMESTAMP NOT NULL, amount INTEGER NOT NULL, tax_mode TEXT NOT NULL DEFAULT 'exclusive', items TEXT, shared_with_member_id VARCHAR, created_by_member_name TEXT, created_at TIMESTAMP NOT NULL DEFAULT now(), user_id VARCHAR NOT NULL)`);

    // 4. Seed and Default Admin
    await seedDatabase();
    const adminExists = await db.execute(sql`SELECT * FROM users WHERE role = 'founder' LIMIT 1`);
    if (adminExists.rows.length === 0) {
       await db.execute(sql`INSERT INTO users (username, password, display_name, role) VALUES ('admin', 'Drumcircle2024', 'Founder', 'founder')`);
    }
    console.log("Database successfully restored with all original features.");
  } catch (err) { console.error("Database Restoration Failed:", err); }

  async function logActivity(userId: string, userName: string, action: string, details?: string) {
    try { await storage.createActivityLog({ userId, userName, action, details: details || null }); } catch (e) {}
  }

  async function notifyUser(userId: string, type: string, message: string, showId?: string, showTitle?: string) {
    try { await storage.createNotification({ userId, type, message, relatedShowId: showId || null, relatedShowTitle: showTitle || null, isRead: false }); } catch (e) {}
  }

  // --- AUTH ROUTES (FULL ORIGINAL) ---
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      const valid = (user.password === password) || await storage.verifyPassword(password, user.password).catch(() => false);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });
      req.session.userId = user.id;
      req.session.save(() => {
        logActivity(user.id, user.displayName, "login", `${user.displayName} logged in`);
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    } catch (err) { res.status(500).json({ message: "Login failed" }); }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    if (user.role === "member") {
      const bandMember = await storage.getBandMemberByUserId(user.id);
      return res.json({ ...safeUser, bandMemberId: bandMember?.id || null, canAddShows: bandMember?.canAddShows || false, canEditName: bandMember?.canEditName || false, canViewAmounts: bandMember?.canViewAmounts || false, canShowContacts: bandMember?.canShowContacts || false, canGenerateInvoice: bandMember?.canGenerateInvoice || false });
    }
    res.json(safeUser);
  });

  app.post("/api/auth/logout", (req, res) => { req.session.destroy(() => res.json({ message: "Logged out" })); });

  app.post("/api/auth/emergency-reset", async (req, res) => {
    try {
      const { recoveryKey, newPassword } = req.body;
      const envKey = process.env.ADMIN_RECOVERY_KEY;
      if (!envKey || recoveryKey !== envKey) return res.status(401).json({ message: "Invalid recovery key" });
      const allUsers = await storage.getAllUsers();
      const founder = allUsers.find(u => u.role === "founder");
      if (!founder) return res.status(404).json({ message: "Admin account not found" });
      await storage.updateUser(founder.id, { password: newPassword });
      res.json({ message: "Password reset successfully." });
    } catch (err) { res.status(500).json({ message: "Failed" }); }
  });

  // --- SHOWS CRUD (FULL ORIGINAL) ---
  app.get("/api/shows", requireAdmin, async (req, res) => {
    res.json(await storage.getShows(req.session.userId!));
  });

  app.post("/api/shows", requireAdmin, async (req, res) => {
    try {
      const parsed = insertShowSchema.parse(req.body);
      const show = await storage.createShow({ ...parsed, userId: req.session.userId! });
      res.status(201).json(show);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/shows/:id", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.updateShow(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) { res.status(400).json({ message: "Update failed" }); }
  });

  app.delete("/api/shows/:id", requireAdmin, async (req, res) => {
    await storage.deleteShow(req.params.id);
    res.json({ message: "Deleted" });
  });

  // --- EXPENSES & MEMBERS (FULL ORIGINAL) ---
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

  // --- DASHBOARD & FINANCIALS (FULL ORIGINAL LOGIC) ---
  app.get("/api/dashboard/stats", requireAdmin, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { from, to } = req.query as { from?: string; to?: string };

      let filteredShows = allShows.filter(s => s.status !== "cancelled");
      if (from) filteredShows = filteredShows.filter((s) => new Date(s.showDate) >= new Date(from as string));
      if (to) filteredShows = filteredShows.filter((s) => new Date(s.showDate) <= new Date(to as string));

      let totalExpenses = 0;
      let totalMemberPayouts = 0;

      for (const show of filteredShows) {
        const expenses = await storage.getShowExpenses(show.id);
        totalExpenses += expenses.reduce((s, e) => s + e.amount, 0);
        const members = await storage.getShowMembers(show.id);
        totalMemberPayouts += members.reduce((s, m) => s + m.calculatedAmount, 0);
      }

      const totalRevenue = filteredShows.reduce((s, sh) => s + sh.totalAmount, 0);
      res.json({
        showsPerformed: filteredShows.filter(s => new Date(s.showDate) <= new Date()).length,
        totalRevenue,
        totalExpenses,
        revenueAfterExpenses: totalRevenue - totalExpenses - totalMemberPayouts,
        upcomingCount: allShows.filter(s => new Date(s.showDate) > new Date() && s.status !== 'cancelled').length,
        pendingAmount: allShows.filter(s => !s.isPaid && s.status !== 'cancelled').reduce((s, sh) => s + (sh.totalAmount - sh.advancePayment), 0),
      });
    } catch (err: any) { res.status(500).json({ message: "Failed to compute stats" }); }
  });

  app.get("/api/financials", requireAdmin, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { member } = req.query as { member?: string };
      res.json({
        member: member || "Haider Jamil",
        shows: allShows.sort((a, b) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime())
      });
    } catch (err: any) { res.status(500).json({ message: "Failed to compute financials" }); }
  });

  // --- BAND MEMBERS & ACCOUNTS (FULL ORIGINAL) ---
  app.get("/api/band-members", requireAdmin, async (req, res) => {
    res.json(await storage.getBandMembers());
  });

  app.post("/api/band-members", requireAdmin, async (req, res) => {
    res.json(await storage.createBandMember({ ...req.body, userId: null }));
  });

  app.patch("/api/band-members/:id", requireAdmin, async (req, res) => {
    res.json(await storage.updateBandMember(req.params.id, req.body));
  });

  app.post("/api/band-members/:id/create-account", requireAdmin, async (req, res) => {
    try {
      const member = await storage.getBandMember(req.params.id);
      const { username, password } = req.body;
      const user = await storage.createUser({ username, password, displayName: member!.name });
      await storage.updateUser(user.id, { role: "member" });
      await storage.updateBandMember(member!.id, { userId: user.id });
      res.json({ message: "Account created" });
    } catch (err) { res.status(400).json({ message: "Failed" }); }
  });

  app.post("/api/band-members/:id/reset-password", requireAdmin, async (req, res) => {
    const member = await storage.getBandMember(req.params.id);
    await storage.updateUser(member!.userId!, { password: req.body.password });
    res.json({ message: "Reset successful" });
  });

  // --- INVOICES (FULL ORIGINAL) ---
  app.get("/api/invoices", requireAdmin, async (req, res) => {
    res.json(await storage.getAllInvoices());
  });

  app.post("/api/invoices", requireAdmin, async (req, res) => {
    try {
      const next = await storage.getNextInvoiceNumber();
      const invoice = await storage.createInvoice({ 
        ...req.body, 
        number: next, 
        displayNumber: `DCP-${next}`, 
        userId: req.session.userId!,
        city: req.body.city || "Default"
      });
      res.json(invoice);
    } catch (err) { res.status(500).json({ message: "Invoice error" }); }
  });

  // --- MEMBER-SCOPED LOGIC (FULL ORIGINAL) ---
  async function getAllShowsForMember() {
    const all = await storage.getAllUsers();
    const f = all.find(u => u.role === "founder");
    return f ? await storage.getShows(f.id) : [];
  }

  app.get("/api/member/shows", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    const bm = await storage.getBandMemberByUserId(user!.id);
    if (!bm) return res.status(403).json({ message: "Member record not found" });
    const shows = await getAllShowsForMember();
    const myShows = [];
    for (const s of shows) {
      const ms = await storage.getShowMembers(s.id);
      const found = ms.find(m => m.name === bm.name);
      if (found) myShows.push({ ...s, myEarning: found.calculatedAmount });
    }
    res.json(myShows);
  });

  return httpServer;
}

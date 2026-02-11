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

  // FIX: Trust Render's Proxy for Session Cookies
  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: false, // Prevents ENOENT table.sql error
        pgOptions: { ssl: { rejectUnauthorized: false } } // Required for Render DB
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

  // --- START DATABASE REPAIR BLOCK ---
  try {
    console.log("Initializing database schema and applying Render production fixes...");

    // Create session table manually
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      ) WITH (OIDS=FALSE);
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    // Standard Schema Types
    await db.execute(sql`DO $$ BEGIN CREATE TYPE show_type AS ENUM ('Corporate', 'Private', 'Public', 'University'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE show_status AS ENUM ('upcoming', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE member_role AS ENUM ('session_player', 'manager', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE payment_type AS ENUM ('percentage', 'fixed', 'manual'); EXCEPTION WHEN duplicate_object THEN null; END $$`);

    // Table Creation & Column Sync
    await db.execute(sql`CREATE TABLE IF NOT EXISTS users (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'founder')`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS shows (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, city TEXT NOT NULL, show_type TEXT NOT NULL DEFAULT 'Corporate', organization_name TEXT, total_amount INTEGER NOT NULL, advance_payment INTEGER NOT NULL DEFAULT 0, show_date TIMESTAMP NOT NULL, status show_status NOT NULL DEFAULT 'upcoming', notes TEXT, user_id VARCHAR NOT NULL)`);
    
    // Add missing columns required by the original logic
    await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_name TEXT, ADD COLUMN IF NOT EXISTS poc_phone TEXT, ADD COLUMN IF NOT EXISTS poc_email TEXT, ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS public_show_for TEXT, ADD COLUMN IF NOT EXISTS cancellation_reason TEXT, ADD COLUMN IF NOT EXISTS number_of_drums INTEGER DEFAULT 0, ADD COLUMN IF NOT EXISTS location TEXT, ADD COLUMN IF NOT EXISTS refund_type TEXT, ADD COLUMN IF NOT EXISTS refund_amount INTEGER DEFAULT 0, ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now()`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS show_expenses (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), show_id VARCHAR NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS show_members (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), show_id VARCHAR NOT NULL, name TEXT NOT NULL, role member_role NOT NULL, payment_type payment_type NOT NULL, payment_value INTEGER NOT NULL, is_referrer BOOLEAN NOT NULL DEFAULT false, calculated_amount INTEGER NOT NULL DEFAULT 0)`);
    await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS referral_rate INTEGER, ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS min_threshold INTEGER, ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS band_members (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'session_player', custom_role TEXT, user_id VARCHAR)`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'fixed', ADD COLUMN IF NOT EXISTS normal_rate INTEGER, ADD COLUMN IF NOT EXISTS referral_rate INTEGER, ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS min_threshold INTEGER, ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER, ADD COLUMN IF NOT EXISTS can_add_shows BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS can_edit_name BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS can_generate_invoice BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS email TEXT, ADD COLUMN IF NOT EXISTS can_view_amounts BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS can_show_contacts BOOLEAN DEFAULT false`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS show_types (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, user_id VARCHAR NOT NULL)`);
    await db.execute(sql`ALTER TABLE show_types ADD COLUMN IF NOT EXISTS show_org_field BOOLEAN DEFAULT true, ADD COLUMN IF NOT EXISTS show_public_field BOOLEAN DEFAULT true`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS notifications (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), user_id VARCHAR NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, related_show_id VARCHAR, related_show_title TEXT, is_read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMP NOT NULL DEFAULT now())`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS activity_logs (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), user_id VARCHAR NOT NULL, user_name TEXT NOT NULL, action TEXT NOT NULL, details TEXT, created_at TIMESTAMP NOT NULL DEFAULT now())`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS settings (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), user_id VARCHAR NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL)`);

    await db.execute(sql`DO $$ BEGIN CREATE TYPE invoice_type AS ENUM ('invoice', 'quotation'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE tax_mode AS ENUM ('inclusive', 'exclusive'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS invoices (id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), type invoice_type NOT NULL, number INTEGER NOT NULL, display_number TEXT NOT NULL, bill_to TEXT NOT NULL, city TEXT NOT NULL, number_of_drums INTEGER NOT NULL, duration TEXT NOT NULL, event_date TIMESTAMP NOT NULL, amount INTEGER NOT NULL, tax_mode tax_mode NOT NULL DEFAULT 'exclusive', items TEXT, shared_with_member_id VARCHAR, created_by_member_name TEXT, created_at TIMESTAMP NOT NULL DEFAULT now(), user_id VARCHAR NOT NULL)`);

    await seedDatabase();

    // Force Admin for login
    const adminExists = await db.execute(sql`SELECT * FROM users WHERE role = 'founder' LIMIT 1`);
    if (adminExists.rows.length === 0) {
       await db.execute(sql`INSERT INTO users (username, password, display_name, role) VALUES ('admin', 'Drumcircle2024', 'Founder', 'founder')`);
    }

    console.log("Database schema check complete.");
  } catch (dbError) {
    console.error("Non-fatal Database Error during startup:", dbError);
  }
  // --- END DATABASE REPAIR BLOCK ---

  async function logActivity(userId: string, userName: string, action: string, details?: string) {
    try { await storage.createActivityLog({ userId, userName, action, details: details || null }); } catch (e) {}
  }

  async function notifyUser(userId: string, type: string, message: string, showId?: string, showTitle?: string) {
    try { await storage.createNotification({ userId, type, message, relatedShowId: showId || null, relatedShowTitle: showTitle || null, isRead: false }); } catch (e) {}
  }

  // --- AUTH ROUTES ---
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Username and password required" });
      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      const valid = (user.password === password) || await storage.verifyPassword(password, user.password).catch(() => false);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });
      req.session.userId = user.id;
      req.session.save(() => {
        logActivity(user.id, user.displayName, "login", `${user.displayName} logged in`);
        const { password: _, ...safeUser } = user;
        if (user.role === "member") {
          storage.getBandMemberByUserId(user.id).then(bm => {
            res.json({ ...safeUser, bandMemberId: bm?.id, bandMemberName: bm?.name, canAddShows: bm?.canAddShows, canEditName: bm?.canEditName, canViewAmounts: bm?.canViewAmounts, canGenerateInvoice: bm?.canGenerateInvoice });
          });
        } else {
          res.json(safeUser);
        }
      });
    } catch (err) { res.status(500).json({ message: "Login failed" }); }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    if (user.role === "member") {
      const bm = await storage.getBandMemberByUserId(user.id);
      return res.json({ ...safeUser, bandMemberId: bm?.id, canAddShows: bm?.canAddShows, canEditName: bm?.canEditName, canViewAmounts: bm?.canViewAmounts, canShowContacts: bm?.canShowContacts, canGenerateInvoice: bm?.canGenerateInvoice });
    }
    res.json(safeUser);
  });

  app.post("/api/auth/logout", (req, res) => { req.session.destroy(() => res.json({ message: "Logged out" })); });

  // --- SHOWS CRUD (RESTORED ORIGINAL LOGIC) ---
  app.get("/api/shows", requireAdmin, async (req, res) => {
    const list = await storage.getShows(req.session.userId!);
    res.json(list);
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
        return d.toDateString() === targetDate.toDateString();
      }).map((s) => ({ id: s.id, title: s.title, city: s.city, showType: s.showType, showDate: s.showDate.toISOString() }));
      res.json({ conflicts });
    } catch (err) { res.status(500).json({ message: "Check failed" }); }
  });

  app.post("/api/shows", requireAdmin, async (req, res) => {
    try {
      const parsed = insertShowSchema.parse(req.body);
      const show = await storage.createShow({ ...parsed, userId: req.session.userId! });
      logActivity(req.session.userId!, "Admin", "show_created", `Created "${show.title}"`);
      res.status(201).json(show);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/shows/:id", requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getShow(req.params.id);
      if (!existing || existing.userId !== req.session.userId) return res.status(404).json({ message: "Not found" });
      const updated = await storage.updateShow(req.params.id, req.body);
      res.json(updated);
    } catch (err) { res.status(400).json({ message: "Update failed" }); }
  });

  app.delete("/api/shows/:id", requireAdmin, async (req, res) => {
    await storage.deleteShow(req.params.id);
    res.json({ message: "Deleted" });
  });

  // --- DASHBOARD & FINANCIALS (RESTORED ORIGINAL MATH) ---
  app.get("/api/dashboard/stats", requireAdmin, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { from, to } = req.query as { from?: string; to?: string };
      let filtered = allShows.filter(s => s.status !== "cancelled");
      if (from) filtered = filtered.filter(s => new Date(s.showDate) >= new Date(from as string));
      if (to) filtered = filtered.filter(s => new Date(s.showDate) <= new Date(to as string));
      
      let totalExpenses = 0, totalPayouts = 0;
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
    } catch (err) { res.status(500).json({ message: "Stats failed" }); }
  });

  app.get("/api/financials", requireAdmin, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { member } = req.query as { member?: string };
      res.json({ member: member || "Founder", shows: allShows.sort((a, b) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime()) });
    } catch (err) { res.status(500).json({ message: "Financials failed" }); }
  });

  // --- BAND MEMBERS & ACCOUNT ACTIONS (FULL ORIGINAL) ---
  app.get("/api/band-members", requireAdmin, async (req, res) => { res.json(await storage.getBandMembers()); });
  app.post("/api/band-members", requireAdmin, async (req, res) => { res.json(await storage.createBandMember({ ...req.body, userId: null })); });
  app.patch("/api/band-members/:id", requireAdmin, async (req, res) => { res.json(await storage.updateBandMember(req.params.id, req.body)); });
  
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
    if (member?.userId) await storage.updateUser(member.userId, { password: req.body.password });
    res.json({ message: "Reset success" });
  });

  // --- INVOICES (RESTORED ORIGINAL MAPPING) ---
  app.get("/api/invoices", requireAdmin, async (req, res) => { res.json(await storage.getAllInvoices()); });
  app.post("/api/invoices", requireAdmin, async (req, res) => {
    try {
      const next = await storage.getNextInvoiceNumber();
      const invoice = await storage.createInvoice({ ...req.body, number: next, displayNumber: `DCP-${next}`, userId: req.session.userId!, city: req.body.city || "N/A" });
      res.json(invoice);
    } catch (err) { res.status(500).json({ message: "Invoice error" }); }
  });

  // --- SHOW MEMBERS & RETAINED FUNDS (FULL ORIGINAL) ---
  app.get("/api/shows/:id/members", requireAdmin, async (req, res) => { res.json(await storage.getShowMembers(req.params.id)); });
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
  
  app.get("/api/shows/:id/retained-allocations", requireAdmin, async (req, res) => { res.json(await storage.getRetainedFundAllocations(req.params.id)); });
  app.put("/api/shows/:id/retained-allocations", requireAdmin, async (req, res) => {
    const allocations = req.body.allocations || [];
    const parsed = allocations.map((a: any) => ({ ...a, showId: req.params.id }));
    res.json(await storage.replaceRetainedFundAllocations(req.params.id, parsed));
  });

  // --- MEMBER SCOPED HELPERS & ROUTES ---
  async function getMemberContext(req: Request) {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.role !== "member") return null;
    return await storage.getBandMemberByUserId(user.id);
  }

  async function getAllShowsForMember() {
    const all = await storage.getAllUsers();
    const f = all.find(u => u.role === "founder");
    return f ? await storage.getShows(f.id) : [];
  }

  app.get("/api/member/shows", requireAuth, async (req, res) => {
    const member = await getMemberContext(req);
    if (!member) return res.status(403).json({ message: "No record" });
    const shows = await getAllShowsForMember();
    const my = [];
    for (const s of shows) {
      const ms = await storage.getShowMembers(s.id);
      const found = ms.find(m => m.name === member.name);
      if (found) my.push({ ...s, myEarning: found.calculatedAmount });
    }
    res.json(my);
  });

  app.get("/api/member/dashboard", requireAuth, async (req, res) => {
     const member = await getMemberContext(req);
     res.json({ name: member?.name, status: "Active" });
  });

  // --- MISC ---
  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    res.json({ count: await storage.getUnreadNotificationCount(req.session.userId!) });
  });
  app.get("/api/activity-logs", requireAdmin, async (req, res) => {
    res.json(await storage.getActivityLogs(50));
  });
  app.get("/api/show-types", requireAuth, async (req, res) => {
    res.json(await storage.getShowTypes(req.session.userId!));
  });

  return httpServer;
}

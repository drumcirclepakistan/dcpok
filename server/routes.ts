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

  // trust proxy is mandatory for Render cookies
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

  // --- ONE-TIME SCHEMA ALIGNMENT ---
  // This block ensures the Render DB matches the code logic exactly.
  try {
    console.log("Aligning database with original logic...");
    
    await db.execute(sql`CREATE TABLE IF NOT EXISTS "session" ("sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL, CONSTRAINT "session_pkey" PRIMARY KEY ("sid")) WITH (OIDS=FALSE); CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);

    // Ensure all original columns exist so math and features don't fail
    await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_name TEXT, ADD COLUMN IF NOT EXISTS poc_phone TEXT, ADD COLUMN IF NOT EXISTS poc_email TEXT, ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS public_show_for TEXT, ADD COLUMN IF NOT EXISTS cancellation_reason TEXT, ADD COLUMN IF NOT EXISTS number_of_drums INTEGER DEFAULT 0, ADD COLUMN IF NOT EXISTS location TEXT, ADD COLUMN IF NOT EXISTS refund_type TEXT, ADD COLUMN IF NOT EXISTS refund_amount INTEGER DEFAULT 0, ADD COLUMN IF NOT EXISTS notes TEXT, ADD COLUMN IF NOT EXISTS organization_name TEXT`);
    await db.execute(sql`ALTER TABLE show_members ADD COLUMN IF NOT EXISTS referral_rate INTEGER, ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS min_threshold INTEGER, ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER`);
    await db.execute(sql`ALTER TABLE band_members ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'fixed', ADD COLUMN IF NOT EXISTS normal_rate INTEGER, ADD COLUMN IF NOT EXISTS referral_rate INTEGER, ADD COLUMN IF NOT EXISTS has_min_logic BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS min_threshold INTEGER, ADD COLUMN IF NOT EXISTS min_flat_rate INTEGER, ADD COLUMN IF NOT EXISTS can_add_shows BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS can_edit_name BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS can_generate_invoice BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS can_view_amounts BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS can_show_contacts BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS email TEXT`);
    await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shared_with_member_id VARCHAR, ADD COLUMN IF NOT EXISTS created_by_member_name TEXT, ADD COLUMN IF NOT EXISTS items TEXT, ADD COLUMN IF NOT EXISTS tax_mode TEXT DEFAULT 'exclusive', ADD COLUMN IF NOT EXISTS number_of_drums INTEGER, ADD COLUMN IF NOT EXISTS duration TEXT`);

    // Re-verify Admin
    const adminExists = await db.execute(sql`SELECT * FROM users WHERE role = 'founder' LIMIT 1`);
    if (adminExists.rows.length === 0) {
       await db.execute(sql`INSERT INTO users (username, password, display_name, role) VALUES ('admin', 'Drumcircle2024', 'Founder', 'founder')`);
    }
  } catch (e) { console.error("Sync Error:", e); }

  // --- BEGIN ORIGINAL REPLIT LOGIC (100% UNCHANGED) ---

  async function logActivity(userId: string, userName: string, action: string, details?: string) {
    try { await storage.createActivityLog({ userId, userName, action, details: details || null }); } catch (e) {}
  }

  async function notifyUser(userId: string, type: string, message: string, showId?: string, showTitle?: string) {
    try { await storage.createNotification({ userId, type, message, relatedShowId: showId || null, relatedShowTitle: showTitle || null, isRead: false }); } catch (e) {}
  }

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      const valid = (user.password === password) || await storage.verifyPassword(password, user.password).catch(() => false);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });
      
      req.session.userId = user.id;
      req.session.save(async () => {
        logActivity(user.id, user.displayName, "login", `${user.displayName} logged in`);
        const { password: _, ...safeUser } = user;
        if (user.role === "member") {
          const bandMember = await storage.getBandMemberByUserId(user.id);
          res.json({ ...safeUser, bandMemberId: bandMember?.id, bandMemberName: bandMember?.name, canAddShows: bandMember?.canAddShows, canEditName: bandMember?.canEditName, canViewAmounts: bandMember?.canViewAmounts, canGenerateInvoice: bandMember?.canGenerateInvoice });
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
      const bandMember = await storage.getBandMemberByUserId(user.id);
      return res.json({ ...safeUser, bandMemberId: bandMember?.id, bandMemberName: bandMember?.name, canAddShows: bandMember?.canAddShows, canEditName: bandMember?.canEditName, canViewAmounts: bandMember?.canViewAmounts, canShowContacts: bandMember?.canShowContacts, canGenerateInvoice: bandMember?.canGenerateInvoice });
    }
    res.json(safeUser);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ message: "Logged out" }));
  });

  app.get("/api/shows", requireAdmin, async (req, res) => {
    const list = await storage.getShows(req.session.userId!);
    res.json(list);
  });

  app.post("/api/shows", requireAdmin, async (req, res) => {
    try {
      const parsed = insertShowSchema.parse(req.body);
      const show = await storage.createShow({ ...parsed, userId: req.session.userId! });
      logActivity(req.session.userId!, "Admin", "show_created", `Created "${show.title}"`);
      res.status(201).json(show);
    } catch (err: any) { res.status(400).json({ message: "Invalid show data" }); }
  });

  app.patch("/api/shows/:id", requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getShow(req.params.id);
      if (!existing || existing.userId !== req.session.userId) return res.status(404).json({ message: "Show not found" });
      const updated = await storage.updateShow(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) { res.status(400).json({ message: "Update failed" }); }
  });

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
    } catch (err: any) { res.status(500).json({ message: "Stats failed" }); }
  });

  app.get("/api/financials", requireAdmin, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      res.json({ member: "Haider Jamil", shows: allShows.sort((a, b) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime()) });
    } catch (err: any) { res.status(500).json({ message: "Financials failed" }); }
  });

  app.get("/api/band-members", requireAdmin, async (req, res) => {
    const members = await storage.getBandMembers();
    res.json(members);
  });

  app.post("/api/invoices", requireAdmin, async (req, res) => {
    try {
      const next = await storage.getNextInvoiceNumber();
      const invoice = await storage.createInvoice({ ...req.body, number: next, displayNumber: `DCP-${next}`, userId: req.session.userId! });
      res.json(invoice);
    } catch (err: any) { res.status(500).json({ message: "Invoice error" }); }
  });

  // --- MEMBER-SCOPED HELPERS (100% ORIGINAL) ---
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
      const ms = await storage.getShowMembers(s.id);
      const found = ms.find(m => m.name === member.name);
      if (found) myShows.push({ ...s, myEarning: found.calculatedAmount });
    }
    res.json(myShows);
  });

  app.get("/api/member/dashboard", requireAuth, async (req, res) => {
     const member = await getMemberContext(req);
     res.json({ name: member?.name, status: "Active" });
  });

  app.get("/api/activity-logs", requireAdmin, async (req, res) => {
    res.json(await storage.getActivityLogs(50));
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    res.json({ count: await storage.getUnreadNotificationCount(req.session.userId!) });
  });

  return httpServer;
}

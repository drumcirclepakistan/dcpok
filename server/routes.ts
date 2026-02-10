import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage } from "./storage";
import { insertShowSchema, insertExpenseSchema, insertMemberSchema, defaultSettings } from "@shared/schema";
import { seedDatabase } from "./seed";

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
      show_type show_type NOT NULL,
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

  // Add POC columns if they don't exist (migration for existing tables)
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_name TEXT`);
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_phone TEXT`);
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS poc_email TEXT`);
  await db.execute(sql`ALTER TABLE shows ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false`);

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

  await seedDatabase();

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
      const { password: _, ...safeUser } = user;
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
    res.json(safeUser);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  // Shows CRUD
  app.get("/api/shows", requireAuth, async (req, res) => {
    const showsList = await storage.getShows(req.session.userId!);
    res.json(showsList);
  });

  app.get("/api/shows/:id", requireAuth, async (req, res) => {
    const show = await storage.getShow(req.params.id as string);
    if (!show || show.userId !== req.session.userId) {
      return res.status(404).json({ message: "Show not found" });
    }
    res.json(show);
  });

  app.post("/api/shows", requireAuth, async (req, res) => {
    try {
      const parsed = insertShowSchema.parse(req.body);
      const show = await storage.createShow({
        ...parsed,
        userId: req.session.userId!,
      });
      res.status(201).json(show);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid show data" });
    }
  });

  app.patch("/api/shows/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getShow(req.params.id as string);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Show not found" });
      }
      const parsed = insertShowSchema.partial().parse(req.body);
      const updated = await storage.updateShow(req.params.id as string, parsed);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  app.delete("/api/shows/:id", requireAuth, async (req, res) => {
    const existing = await storage.getShow(req.params.id as string);
    if (!existing || existing.userId !== req.session.userId) {
      return res.status(404).json({ message: "Show not found" });
    }
    await storage.deleteShow(req.params.id as string);
    res.json({ message: "Deleted" });
  });

  // Show Expenses
  app.get("/api/shows/:id/expenses", requireAuth, async (req, res) => {
    const show = await storage.getShow(req.params.id as string);
    if (!show || show.userId !== req.session.userId) {
      return res.status(404).json({ message: "Show not found" });
    }
    const expenses = await storage.getShowExpenses(req.params.id as string);
    res.json(expenses);
  });

  app.post("/api/shows/:id/expenses", requireAuth, async (req, res) => {
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

  app.delete("/api/shows/:id/expenses/:expenseId", requireAuth, async (req, res) => {
    await storage.deleteExpense(req.params.expenseId as string);
    res.json({ message: "Deleted" });
  });

  // Show Members
  app.get("/api/shows/:id/members", requireAuth, async (req, res) => {
    const show = await storage.getShow(req.params.id as string);
    if (!show || show.userId !== req.session.userId) {
      return res.status(404).json({ message: "Show not found" });
    }
    const members = await storage.getShowMembers(req.params.id as string);
    res.json(members);
  });

  app.post("/api/shows/:id/members", requireAuth, async (req, res) => {
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

  app.patch("/api/shows/:id/members/:memberId", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateMember(req.params.memberId as string, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  app.delete("/api/shows/:id/members/:memberId", requireAuth, async (req, res) => {
    await storage.deleteMember(req.params.memberId as string);
    res.json({ message: "Deleted" });
  });

  // Save all members for a show at once (replaces existing)
  app.put("/api/shows/:id/members", requireAuth, async (req, res) => {
    try {
      const show = await storage.getShow(req.params.id as string);
      if (!show || show.userId !== req.session.userId) {
        return res.status(404).json({ message: "Show not found" });
      }
      await storage.deleteShowMembers(req.params.id as string);
      const members = req.body.members || [];
      const created = [];
      for (const m of members) {
        const parsed = insertMemberSchema.parse({ ...m, showId: req.params.id });
        const member = await storage.createMember(parsed);
        created.push(member);
      }
      res.json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid member data" });
    }
  });

  // Toggle paid status
  app.patch("/api/shows/:id/toggle-paid", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getShow(req.params.id as string);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ message: "Show not found" });
      }
      const updated = await storage.updateShow(req.params.id as string, {
        isPaid: !existing.isPaid,
      } as any);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  // Dashboard stats with time range
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { from, to } = req.query as { from?: string; to?: string };

      let filteredShows = allShows;
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
        const net = show.totalAmount - expenseSum;
        let memberPayout = 0;
        for (const m of members) {
          if (m.paymentType === "percentage") {
            memberPayout += Math.round((m.paymentValue / 100) * net);
          } else {
            memberPayout += m.paymentValue;
          }
        }
        totalMemberPayouts += memberPayout;
      }

      const totalRevenue = filteredShows.reduce((s, sh) => s + sh.totalAmount, 0);
      const revenueAfterExpenses = totalRevenue - totalExpenses;
      const founderRevenue = revenueAfterExpenses - totalMemberPayouts;

      const cityCount: Record<string, number> = {};
      const typeCount: Record<string, number> = {};
      for (const show of filteredShows) {
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

      const upcomingCount = allShows.filter((s) => s.status === "upcoming").length;
      const pendingAmount = allShows
        .filter((s) => !s.isPaid)
        .reduce((s, sh) => s + (sh.totalAmount - sh.advancePayment), 0);

      res.json({
        totalShows: filteredShows.length,
        totalRevenue,
        totalExpenses,
        revenueAfterExpenses,
        founderRevenue,
        upcomingCount,
        pendingAmount,
        topCities,
        topTypes,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to compute stats" });
    }
  });

  // Financials per-member stats
  app.get("/api/financials", requireAuth, async (req, res) => {
    try {
      const allShows = await storage.getShows(req.session.userId!);
      const { from, to, member } = req.query as { from?: string; to?: string; member?: string };

      let filteredShows = allShows;
      if (from) {
        const fromDate = new Date(from);
        filteredShows = filteredShows.filter((s) => new Date(s.showDate) >= fromDate);
      }
      if (to) {
        const toDate = new Date(to);
        filteredShows = filteredShows.filter((s) => new Date(s.showDate) <= toDate);
      }

      const appSettings = await storage.getSettings(req.session.userId!);
      const settingsMap: Record<string, string> = { ...defaultSettings };
      for (const s of appSettings) {
        settingsMap[s.key] = s.value;
      }

      const calculateZainPayout = (
        paymentValue: number,
        isReferrer: boolean,
        showTotal: number,
        netAmount: number,
        totalExpenses: number
      ): number => {
        if (isReferrer) return Math.round((paymentValue / 100) * netAmount);
        if (showTotal < 100000) {
          const base = 15000;
          if (totalExpenses === 0) return base;
          const deduction = Math.round((paymentValue / 100) * totalExpenses);
          return Math.max(0, base - deduction);
        }
        return Math.round((paymentValue / 100) * netAmount);
      };

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

      const showDetails: ShowDetail[] = [];
      let totalEarnings = 0;
      let totalShowsParticipated = 0;
      const citySet: Record<string, number> = {};

      for (const show of filteredShows) {
        const expenses = await storage.getShowExpenses(show.id);
        const expenseSum = expenses.reduce((s, e) => s + e.amount, 0);
        const net = show.totalAmount - expenseSum;
        const members = await storage.getShowMembers(show.id);

        let memberEarning = 0;
        let participated = false;

        if (member === "Haider Jamil") {
          // Haider gets remainder after expenses and all member payouts
          let totalMemberPayouts = 0;
          for (const m of members) {
            if (m.name === "Zain Shahid" && m.paymentType === "percentage") {
              totalMemberPayouts += calculateZainPayout(m.paymentValue, m.isReferrer, show.totalAmount, net, expenseSum);
            } else if (m.paymentType === "percentage") {
              totalMemberPayouts += Math.round((m.paymentValue / 100) * net);
            } else {
              totalMemberPayouts += m.paymentValue;
            }
          }
          memberEarning = net - totalMemberPayouts;
          participated = true;
        } else {
          // Find specific member in show
          const found = members.find((m) => m.name === member);
          if (found) {
            participated = true;
            if (found.name === "Zain Shahid" && found.paymentType === "percentage") {
              memberEarning = calculateZainPayout(found.paymentValue, found.isReferrer, show.totalAmount, net, expenseSum);
            } else if (found.paymentType === "percentage") {
              memberEarning = Math.round((found.paymentValue / 100) * net);
            } else {
              memberEarning = found.paymentValue;
            }
          }
        }

        if (participated) {
          totalShowsParticipated++;
          totalEarnings += memberEarning;
          citySet[show.city] = (citySet[show.city] || 0) + 1;
          showDetails.push({
            id: show.id,
            title: show.title,
            city: show.city,
            showDate: show.showDate.toISOString(),
            showType: show.showType,
            totalAmount: show.totalAmount,
            memberEarning,
            isPaid: show.isPaid,
          });
        }
      }

      const cities = Object.entries(citySet)
        .sort((a, b) => b[1] - a[1])
        .map(([city, count]) => ({ city, count }));

      const avgPerShow = totalShowsParticipated > 0 ? Math.round(totalEarnings / totalShowsParticipated) : 0;

      const paidShows = showDetails.filter((s) => s.isPaid).length;
      const unpaidShows = showDetails.filter((s) => !s.isPaid).length;
      const unpaidAmount = showDetails.filter((s) => !s.isPaid).reduce((s, sh) => s + sh.memberEarning, 0);

      res.json({
        member: member || "Haider Jamil",
        totalEarnings,
        totalShows: totalShowsParticipated,
        avgPerShow,
        paidShows,
        unpaidShows,
        unpaidAmount,
        cities,
        shows: showDetails.sort((a, b) => new Date(b.showDate).getTime() - new Date(a.showDate).getTime()),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to compute financials" });
    }
  });

  // Settings
  app.get("/api/settings", requireAuth, async (req, res) => {
    const userSettings = await storage.getSettings(req.session.userId!);
    const merged = { ...defaultSettings };
    for (const s of userSettings) {
      merged[s.key] = s.value;
    }
    res.json(merged);
  });

  app.put("/api/settings", requireAuth, async (req, res) => {
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

  return httpServer;
}

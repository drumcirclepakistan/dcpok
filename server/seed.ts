import { storage } from "./storage";
import { db } from "./db";
import { users, shows, bandMembers, showTypesTable, defaultShowTypes } from "@shared/schema";

export async function seedDatabase() {
  const existingMembers = await db.select().from(bandMembers);
  if (existingMembers.length === 0) {
    await storage.createBandMember({
      name: "Zain Shahid", role: "session_player", customRole: null, userId: null,
      paymentType: "percentage", normalRate: 15, referralRate: 33,
      hasMinLogic: true, minThreshold: 100000, minFlatRate: 15000,
    });
    await storage.createBandMember({
      name: "Wahab", role: "session_player", customRole: null, userId: null,
      paymentType: "fixed", normalRate: 15000,
    });
    await storage.createBandMember({
      name: "Hassan", role: "manager", customRole: null, userId: null,
      paymentType: "fixed", normalRate: 3000,
    });
  }

  const existingUsers = await db.select().from(users);
  if (existingUsers.length > 0) {
    const founder = existingUsers.find(u => u.role === "founder");
    if (founder) {
      const existingTypes = await db.select().from(showTypesTable);
      if (existingTypes.length === 0) {
        for (const typeName of defaultShowTypes) {
          const showOrgField = typeName === "Corporate" || typeName === "University";
          const showPublicField = typeName === "Public";
          await storage.createShowType(typeName, founder.id, showOrgField, showPublicField);
        }
      }
    }
    return;
  }

  const founder = await storage.createUser({
    username: "founder",
    password: "drumcircle2024",
    displayName: "Haider Jamil",
  });

  for (const typeName of defaultShowTypes) {
    const showOrgField = typeName === "Corporate" || typeName === "University";
    const showPublicField = typeName === "Public";
    await storage.createShowType(typeName, founder.id, showOrgField, showPublicField);
  }

  const seedShows = [
    {
      title: "Annual Drum Night",
      city: "Karachi",
      showType: "Public",
      organizationName: null,
      totalAmount: 150000,
      advancePayment: 50000,
      showDate: new Date("2026-03-15T20:00:00"),
      status: "upcoming" as const,
      notes: "Main stage at Arts Council. Full setup with PA system.",
      userId: founder.id,
    },
    {
      title: "Corporate Team Building",
      city: "Lahore",
      showType: "Corporate",
      organizationName: "Jazz Telecom",
      totalAmount: 250000,
      advancePayment: 125000,
      showDate: new Date("2026-03-22T17:00:00"),
      status: "upcoming" as const,
      notes: "200 employees. Venue: Pearl Continental Hotel.",
      userId: founder.id,
    },
    {
      title: "LUMS Culture Fest",
      city: "Lahore",
      showType: "University",
      organizationName: "LUMS",
      totalAmount: 100000,
      advancePayment: 100000,
      showDate: new Date("2026-02-20T19:00:00"),
      status: "upcoming" as const,
      notes: "Outdoor amphitheatre. 45-minute set.",
      userId: founder.id,
    },
    {
      title: "Private Birthday Celebration",
      city: "Islamabad",
      showType: "Private",
      organizationName: null,
      totalAmount: 80000,
      advancePayment: 40000,
      showDate: new Date("2026-01-10T21:00:00"),
      status: "completed" as const,
      notes: "Intimate gathering of 50 people.",
      userId: founder.id,
    },
    {
      title: "Unilever Annual Gala",
      city: "Karachi",
      showType: "Corporate",
      organizationName: "Unilever Pakistan",
      totalAmount: 300000,
      advancePayment: 150000,
      showDate: new Date("2026-04-05T19:30:00"),
      status: "upcoming" as const,
      notes: "Black-tie event. Premium setup required.",
      userId: founder.id,
    },
  ];

  for (const show of seedShows) {
    await db.insert(shows).values(show);
  }

  console.log("Database seeded with Haider Jamil account, sample shows, show types, and band members");
}

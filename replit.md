# Drum Circle Pakistan - Band Management System

## Overview
A modern, mobile-friendly band management web app for Drum Circle Pakistan. Admin access for Haider Jamil with show management, financial tracking, band member management, and account provisioning. Future phases will add member-facing interfaces, invoices, and quotations.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui components
- **Backend**: Express.js with session-based authentication
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (frontend), Express (backend)
- **State**: TanStack React Query

## Key Features
- Session-based login (admin account: username `founder`, password `drumcircle2024`)
- Dashboard with time range filtering (Lifetime, This Year, Last Year, This/Last Month, Last 3/6 Months, Custom)
- Dashboard stats: Total Shows, Total Revenue, Revenue After Expenses, My Earnings, Upcoming Shows, Pending Payments, No Advance Received (warning)
- Dashboard insights: Top Cities, Top Show Types (filtered by time range)
- Upcoming count and pending payments always show full data regardless of time range
- Full show CRUD (add, view, edit, delete)
- Duplicate date warning: Shows alert when adding/editing a show on a date with existing shows
- **Dynamic show types**: Managed via Settings (add/edit/remove), stored in show_types table
- Organization tracking for Corporate/University shows
- "Public Show For" field for Public shows (e.g. cafe, restaurant name)
- Financial tracking: total amount, advance payment, pending amount
- Paid/Unpaid tracking per show with toggle button on show detail page
- Shows list highlights completed-but-unpaid shows in red "Action Required" section
- Shows list highlights upcoming shows with no advance in orange "No Advance Received" section
- Paid/Unpaid filter on shows list
- Show expenses tracking with add/delete
- Band member assignment per show from settings-defined members with automated payment calculations
- **Dynamic per-member payment configs**: Each band member has configurable payment type (fixed/percentage), normal rate, referral rate, min logic with threshold and flat rate
- Financials page: Per-member earnings breakdown with date range filtering
  - Dynamic member selector from API (not hardcoded)
  - Shows Performed: Only past/completed shows the member participated in
  - Upcoming Shows count and list
  - Total Earnings: Only from paid completed shows
  - Unpaid Amount: Completed shows not yet paid to the band
  - Pending Amount: Expected earnings from upcoming shows
  - Cities Performed In: Only counts past shows
  - Payment Summary: Paid/Unpaid/Upcoming show counts
- Band member management: Add/remove members, assign roles (Session Player, Manager, Custom)
- Member account provisioning: Create login accounts, reset passwords, remove access
- **Collapsible settings sections**: Payment Configs, Band Members, Show Types
- Dark mode toggle
- Responsive sidebar navigation

## Payment Rules (Dynamic Per-Member Configs)
- Each band member has configurable payment settings stored in `band_members` table:
  - `paymentType`: "fixed" or "percentage"
  - `normalRate`: Fixed amount (Rs) or percentage of net
  - `referralRate`: Percentage used when member is referrer (percentage type only)
  - `hasMinLogic`: Enable minimum value logic (percentage type only)
  - `minThreshold`: If show total below this, use flat rate instead
  - `minFlatRate`: Base flat rate, minus % of expenses when below threshold
- **Haider Jamil (Admin)**: Gets remainder after all expenses and member payouts
- Payment configs are editable per-member in Settings > Payment Configs

## Project Structure
- `shared/schema.ts` - Drizzle schemas for users, shows, show_expenses, show_members, band_members, show_types, settings; Zod validation
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface with DatabaseStorage implementation
- `server/routes.ts` - API routes (auth + shows CRUD + expenses + members + band members + settings + dashboard + financials + show types)
- `server/seed.ts` - Seed data for admin account, sample shows, default band members with payment configs, and default show types
- `client/src/lib/auth.tsx` - Auth context provider
- `client/src/components/app-sidebar.tsx` - Sidebar navigation
- `client/src/components/theme-toggle.tsx` - Dark/light mode toggle
- `client/src/pages/` - Login, Dashboard, Shows, ShowForm, ShowDetail, Financials, Settings pages

## API Routes
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout
- `GET /api/shows` - List all shows (authenticated)
- `GET /api/shows/check-date?date=&excludeId=` - Check for shows on same date
- `GET /api/shows/:id` - Get show detail
- `POST /api/shows` - Create show
- `PATCH /api/shows/:id` - Update show
- `DELETE /api/shows/:id` - Delete show
- `PATCH /api/shows/:id/toggle-paid` - Toggle paid/unpaid status
- `GET /api/shows/:id/expenses` - List expenses for show
- `POST /api/shows/:id/expenses` - Add expense
- `DELETE /api/shows/:id/expenses/:expenseId` - Remove expense
- `GET /api/shows/:id/members` - List members for show
- `PUT /api/shows/:id/members` - Replace all members for show
- `POST /api/shows/:id/members` - Add member
- `DELETE /api/shows/:id/members/:memberId` - Remove member
- `GET /api/dashboard/stats?from=&to=` - Aggregated dashboard stats with time range filter (includes noAdvanceCount, topCities/topTypes only count completed shows)
- `GET /api/financials?member=&from=&to=` - Per-member financial stats
- `GET /api/band-members` - List all band members (with payment configs)
- `POST /api/band-members` - Add band member
- `PATCH /api/band-members/:id` - Update band member (role + payment config, optional applyToShowIds)
- `GET /api/band-members/:id/upcoming-shows` - Get upcoming shows where this member is assigned
- `DELETE /api/band-members/:id` - Delete band member
- `POST /api/band-members/:id/create-account` - Create login account for member
- `POST /api/band-members/:id/reset-password` - Reset member password
- `DELETE /api/band-members/:id/delete-account` - Delete member login account
- `GET /api/show-types` - List show types
- `POST /api/show-types` - Add show type
- `PATCH /api/show-types/:id` - Update show type
- `DELETE /api/show-types/:id` - Delete show type
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings

## User Preferences
- Pakistani Rupees (Rs) for currency
- Show types: Dynamic, managed via Settings (default: Corporate, Private, Public, University)
- Organization name tracked for Corporate and University shows
- All "Founder" references replaced with "Haider Jamil" (name) / "Admin" (role)

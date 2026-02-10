# Drum Circle Pakistan - Band Management System

## Overview
A modern, mobile-friendly band management web app for Drum Circle Pakistan. Admin access for Haider Jamil with show management, financial tracking, band member management, and account provisioning. Member-facing interface allows band members to view their assigned shows, earnings, and dashboard stats.

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
- **Dynamic show types**: Managed via Settings (add/edit/remove), stored in show_types table with configurable field flags (showOrgField, showPublicField) per type
- Organization tracking for Corporate/University shows
- "Public Show For" field for Public shows (e.g. cafe, restaurant name)
- Financial tracking: total amount, advance payment, pending amount
- Paid/Unpaid tracking per show with toggle button on show detail page
- Shows list highlights completed-but-unpaid shows in red "Action Required" section
- Shows list highlights upcoming shows with no advance in orange "No Advance Received" section
- Paid/Unpaid filter on shows list
- Show expenses tracking with add/delete
- Band member assignment per show from settings-defined members with automated payment calculations
- **Manual amount override**: Each member in band section can have their calculated amount manually overridden via "Custom amount" checkbox
- **Dynamic per-member payment configs**: Each band member has configurable payment type (fixed/percentage), normal rate, referral rate, min logic with threshold and flat rate
- **Payment config dialog shows all upcoming shows**: When saving payment config, dialog lists ALL upcoming shows (not just assigned ones) with "Assigned"/"Not Added" badges; selecting unassigned shows auto-adds the member
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
- **Directory**: Full-text search across all show data (title, city, organization, contact details, notes), date range filtering, summary stats (total/completed/upcoming/paid/unpaid/revenue), show type breakdown, organization grouping with expandable show lists, and one-click contact details dialog
- Dark mode toggle
- Responsive sidebar navigation

## Member-Facing Interface
- Members log in with accounts created by admin (Settings > Band Members > Create Account)
- **Member Dashboard**: Shows performed count, total earnings (paid shows only), upcoming shows, pending payments, top cities/types
- **Member Shows**: Only shows where member is assigned (via show_members), with estimated earnings note for upcoming shows
- **Member Financials**: Self-only view with paid/unpaid/pending breakdowns, no access to other members' data
- **Permissions** (controlled by admin in Settings > Band Members):
  - `canAddShows`: Allows member to create new shows via the show form; member is auto-added to band section as referrer
  - `canEditName`: Allows member to update their display name via pencil icon in sidebar (propagates to show_members records)
- **Route Protection**: All admin routes use `requireAdmin` middleware; members cannot access show details, settings, expenses, or other admin-only features
- **Referred by you**: Shows tagged with "Referred by you" badge on shows page, dashboard upcoming/completed shows, and financials show lists
- **Shows Referred stat**: Count of referred shows displayed on dashboard and financials (visible when > 0)
- **Payout Policy page**: Member-only page showing payment structure (type, rates, referral rate, minimum logic) with descriptive explanations
- **Sidebar**: Members see Dashboard, My Shows, Add Show (if permitted), Financials, Payout Policy (no Settings, no Show Detail links)

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
- `GET /api/shows` - List all shows (admin)
- `GET /api/shows/check-date?date=&excludeId=` - Check for shows on same date (authenticated)
- `GET /api/shows/:id` - Get show detail (admin)
- `POST /api/shows` - Create show (admin)
- `PATCH /api/shows/:id` - Update show (admin)
- `DELETE /api/shows/:id` - Delete show (admin)
- `PATCH /api/shows/:id/toggle-paid` - Toggle paid/unpaid status (admin)
- `GET /api/shows/:id/expenses` - List expenses for show (admin)
- `POST /api/shows/:id/expenses` - Add expense (admin)
- `DELETE /api/shows/:id/expenses/:expenseId` - Remove expense (admin)
- `GET /api/shows/:id/members` - List members for show (admin)
- `PUT /api/shows/:id/members` - Replace all members for show (admin)
- `POST /api/shows/:id/members` - Add member (admin)
- `DELETE /api/shows/:id/members/:memberId` - Remove member (admin)
- `GET /api/dashboard/stats?from=&to=` - Aggregated dashboard stats (admin)
- `GET /api/financials?member=&from=&to=` - Per-member financial stats (admin)
- `GET /api/band-members` - List all band members (admin)
- `POST /api/band-members` - Add band member (admin)
- `PATCH /api/band-members/:id` - Update band member (admin)
- `GET /api/band-members/:id/upcoming-shows` - Get upcoming shows (admin)
- `DELETE /api/band-members/:id` - Delete band member (admin)
- `POST /api/band-members/:id/create-account` - Create login account (admin)
- `POST /api/band-members/:id/reset-password` - Reset member password (admin)
- `DELETE /api/band-members/:id/delete-account` - Delete member login account (admin)
- `GET /api/show-types` - List show types (authenticated)
- `POST /api/show-types` - Add show type (admin)
- `PATCH /api/show-types/:id` - Update show type (admin)
- `DELETE /api/show-types/:id` - Delete show type (admin)
- `GET /api/settings` - Get settings (admin)
- `PUT /api/settings` - Update settings (admin)
- `GET /api/member/shows` - List member's assigned shows (member)
- `GET /api/member/dashboard?from=&to=` - Member dashboard stats (member)
- `GET /api/member/financials?from=&to=` - Member financial stats (member)
- `PATCH /api/member/name` - Update member's own name (member, requires canEditName)
- `POST /api/member/shows` - Create show as member (member, requires canAddShows)
- `GET /api/member/policy` - Get member's payout policy/payment config (member)

## User Preferences
- Pakistani Rupees (Rs) for currency
- Show types: Dynamic, managed via Settings (default: Corporate, Private, Public, University)
- Organization name tracked for Corporate and University shows
- All "Founder" references replaced with "Haider Jamil" (name) / "Admin" (role)

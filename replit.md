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
- Dashboard stats: Total Shows, Total Revenue, Revenue After Expenses, My Earnings, Upcoming Shows, Pending Payments
- Dashboard insights: Top Cities, Top Show Types (filtered by time range)
- Upcoming count and pending payments always show full data regardless of time range
- Full show CRUD (add, view, edit, delete)
- Duplicate date warning: Shows alert when adding/editing a show on a date with existing shows
- Show types: Corporate, Private, Public, University
- Organization tracking for Corporate/University shows
- "Public Show For" field for Public shows (e.g. cafe, restaurant name)
- Financial tracking: total amount, advance payment, pending amount
- Paid/Unpaid tracking per show with toggle button on show detail page
- Shows list highlights completed-but-unpaid shows in a red "Action Required" section
- Paid/Unpaid filter on shows list
- Show expenses tracking with add/delete
- Band member assignment per show with automated payment calculations
- Financials page: Per-member earnings breakdown with date range filtering
  - Shows Performed: Only past/completed shows the member participated in
  - Upcoming Shows: Future shows the member is assigned to
  - Total Earnings: Only from paid completed shows
  - Unpaid Amount: Completed shows not yet paid to the band
  - Pending Amount: Expected earnings from upcoming shows
  - Cities Performed In: Only counts past shows
  - Payment Summary: Paid/Unpaid/Upcoming show counts
- Configurable payment settings (applies to future shows only)
- Band member management: Add/remove members, assign roles (Session Player, Manager, Custom)
- Member account provisioning: Create login accounts, reset passwords, remove access
- Dark mode toggle
- Responsive sidebar navigation

## Payment Rules
- **Zain Shahid (Session Player)**:
  - Referral show: Gets configured referral % (default 33%) of net amount
  - Non-referral, show >= Rs 100K: Gets configured session % (default 15%) of net amount
  - Non-referral, show < Rs 100K: Gets base Rs 15,000
    - If expenses exist: Rs 15,000 minus (configured % of total expenses)
- **Wahab**: Fixed rate per show (default Rs 15,000)
- **Hassan (Manager)**: Fixed rate per show (default Rs 3,000)
- **Haider Jamil (Admin)**: Gets remainder after all expenses and member payouts

## Project Structure
- `shared/schema.ts` - Drizzle schemas for users, shows, show_expenses, show_members, band_members, settings; Zod validation
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface with DatabaseStorage implementation
- `server/routes.ts` - API routes (auth + shows CRUD + expenses + members + band members + settings + dashboard + financials)
- `server/seed.ts` - Seed data for admin account, sample shows, and default band members
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
- `GET /api/dashboard/stats?from=&to=` - Aggregated dashboard stats with time range filter
- `GET /api/financials?member=&from=&to=` - Per-member financial stats
- `GET /api/band-members` - List all band members
- `POST /api/band-members` - Add band member
- `PATCH /api/band-members/:id` - Update band member
- `DELETE /api/band-members/:id` - Delete band member
- `POST /api/band-members/:id/create-account` - Create login account for member
- `POST /api/band-members/:id/reset-password` - Reset member password
- `DELETE /api/band-members/:id/delete-account` - Delete member login account
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings

## User Preferences
- Pakistani Rupees (Rs) for currency
- Show types: Corporate, Private, Public, University
- Organization name tracked for Corporate and University shows
- All "Founder" references replaced with "Haider Jamil" (name) / "Admin" (role)

# Drum Circle Pakistan - Band Management System

## Overview
A modern, mobile-friendly band management web app for Drum Circle Pakistan. Currently built for founder-only access with show management features. Future phases will add band member management, invoices, and quotations.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui components
- **Backend**: Express.js with session-based authentication
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (frontend), Express (backend)
- **State**: TanStack React Query

## Key Features
- Session-based login (founder account: username `founder`, password `drumcircle2024`)
- Dashboard with time range filtering (Lifetime, This Year, Last Year, This/Last Month, Last 3/6 Months, Custom)
- Dashboard stats: Total Shows, Total Revenue, Revenue After Expenses, Founder Earnings, Upcoming Shows, Pending Payments
- Dashboard insights: Top Cities, Top Show Types (filtered by time range)
- Upcoming count and pending payments always show full data regardless of time range
- Full show CRUD (add, view, edit, delete)
- Show types: Corporate, Private, Public, University
- Organization tracking for Corporate/University shows
- Financial tracking: total amount, advance payment, pending amount
- Paid/Unpaid tracking per show with toggle button on show detail page
- Shows list highlights completed-but-unpaid shows in a red "Action Required" section
- Paid/Unpaid filter on shows list
- Show expenses tracking with add/delete
- Band member assignment per show with automated payment calculations
- Configurable payment settings (applies to future shows only)
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
- **Haider Jamil (Founder)**: Gets remainder after all expenses and member payouts

## Project Structure
- `shared/schema.ts` - Drizzle schemas for users, shows, show_expenses, show_members, settings; Zod validation
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface with DatabaseStorage implementation
- `server/routes.ts` - API routes (auth + shows CRUD + expenses + members + settings + dashboard stats)
- `server/seed.ts` - Seed data for founder account and sample shows
- `client/src/lib/auth.tsx` - Auth context provider
- `client/src/components/app-sidebar.tsx` - Sidebar navigation
- `client/src/components/theme-toggle.tsx` - Dark/light mode toggle
- `client/src/pages/` - Login, Dashboard, Shows, ShowForm, ShowDetail, Settings pages

## API Routes
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout
- `GET /api/shows` - List all shows (authenticated)
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
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings

## User Preferences
- Pakistani Rupees (Rs) for currency
- Show types: Corporate, Private, Public, University
- Organization name tracked for Corporate and University shows

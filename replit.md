# Drum Circle Pakistan - Band Management System

## Overview
The Drum Circle Pakistan Band Management System is a modern, mobile-friendly web application designed to streamline band operations. Its primary purpose is to provide Haider Jamil with comprehensive administrative control over show management, financial tracking, band member administration, and account provisioning. Concurrently, it offers band members a dedicated interface to view their assigned shows, track earnings, and access relevant dashboard statistics. This system aims to enhance efficiency, financial transparency, and communication within Drum Circle Pakistan.

## User Preferences
- Pakistani Rupees (Rs) for currency
- Show types: Dynamic, managed via Settings (default: Corporate, Private, Public, University)
- Organization name tracked for Corporate and University shows
- All "Founder" references replaced with "Haider Jamil" (name) / "Admin" (role)

## System Architecture
The application is built with a modern web stack. The frontend utilizes React with Vite for fast development, styled using TailwindCSS and shadcn/ui components for a consistent design. Routing on the frontend is handled by `wouter`, and `TanStack React Query` manages state. The backend is an Express.js server providing a RESTful API with session-based authentication. Data persistence is achieved using PostgreSQL, accessed via the Drizzle ORM.

**Key Architectural Decisions & Features:**
- **Authentication & Authorization:** Session-based login with distinct admin and member roles. Admin routes are protected by `requireAdmin` middleware, while frontend components use `AdminOnly`/`MemberOnly` wrappers for redirection.
- **Dynamic Content & Configuration:**
    - **Show Types:** Configurable via settings, allowing for dynamic fields like `showOrgField` and `showPublicField`.
    - **Band Member Payment Configurations:** Each member has dynamic payment settings (fixed/percentage, normal rate, referral rate, minimum logic with threshold and flat rate), editable in settings.
    - **Invoice Generation:** Client-side PDF generation for invoices/quotations with dynamic content and auto-incrementing numbers.
- **Data Management:**
    - **Shows:** Full CRUD operations, including duplicate date warnings, optional fields for "Number of Drums" and "Location."
    - **Financials:** Detailed tracking of show amounts, advances, and pending payments. Paid/Unpaid status toggle, expense tracking, and sophisticated handling of cancelled shows with refund types and retained fund allocation.
    - **Band Members:** Management of members, roles, account provisioning (create, reset, delete), and assignment to shows with automated and manual payment calculations.
- **User Interface & Experience:**
    - **Dashboard:** Provides aggregated statistics with time range filtering, insights into top cities and show types.
    - **Directory:** Comprehensive full-text search across all show data with filtering, summary stats, and organization grouping.
    - **Notifications:** In-app notifications with unread counts for show assignments and member-created shows.
    - **Responsive Design:** Dark mode toggle and responsive sidebar navigation.
    - **Real-time Data:** Auto-refresh mechanisms (dashboard 15s, others 30s), refetch on window focus, and mobile pull-to-refresh.
- **Member-Facing Features:**
    - Dedicated member dashboard, show lists (only assigned shows), and financial views (self-only).
    - Granular permissions for members (`canAddShows`, `canEditName`, `canGenerateInvoice`).
    - Payout Policy page detailing individual payment structures.
    - Account page for password and name updates.
    - Member access to specific invoices (shared and self-generated if permitted).
- **Activity Logging:** Admin-only activity log tracking critical actions like logins, show CRUD, payment status changes, and member updates.

## External Dependencies
- **Resend API**: Used for sending email notifications, specifically for show assignment emails. (Requires `RESEND_API_KEY` secret).
- **jsPDF**: Client-side library used for generating PDF invoices and quotations.
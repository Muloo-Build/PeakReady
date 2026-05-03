# Overview

This is a **cycling/fitness training tracker** application ("PeakReady") built as a full-stack TypeScript project. It helps users follow a structured training plan leading up to a goal event (like a cycling race or mountain ride). The app tracks weekly training sessions, body metrics (weight, resting HR, fatigue), bike service/maintenance items, goal event countdown, and **Strava ride data**. It features a dark space-themed dashboard with glassmorphism panels, neon gradients, and a mobile-friendly tab-based navigation. Includes a conversational **AI Coach** ("Peak") and AI-powered plan generation via Google Gemini.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend

- **Framework**: React 18 with TypeScript (non-RSC, client-side only)
- **Build tool**: Vite with `@vitejs/plugin-react`
- **UI components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (dark mode by default, custom color palette with cyan primary and purple accent)
- **State management**: TanStack React Query for server state; local React state for UI
- **Charts**: Recharts for data visualization (weight trends, etc.)
- **Navigation**: Tab-based SPA (no router library) with 5 tabs: Dashboard, Training Plan, Metrics, Service Tracker, Event Tracker
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

## Backend

- **Runtime**: Node.js with Express 5
- **Language**: TypeScript, executed via `tsx` in development
- **API pattern**: RESTful JSON API under `/api/` prefix
- **Key endpoints**:
  - `GET/PATCH /api/sessions` — training sessions
  - `GET/POST /api/metrics` — body/fitness metrics
  - `GET/POST/PATCH /api/service-items` — bike maintenance tracking
  - `GET/PUT /api/goal` — goal event management
  - `GET/PUT /api/settings/:key` — app settings (like active week)
- **Dev server**: Vite dev server middleware served through Express (HMR via WebSocket)
- **Production**: Vite builds static files to `dist/public`, esbuild bundles server to `dist/index.cjs`

## Data Layer

- **Database**: PostgreSQL (required, connection via `DATABASE_URL` env var)
- **ORM**: Drizzle ORM with `drizzle-zod` for schema validation
- **Schema location**: `shared/schema.ts` (shared between client and server)
- **Migration tool**: `drizzle-kit push` (push-based schema sync, no migration files checked in typically)
- **Tables**:
  - `sessions` — training sessions with week number, type, description, minutes, zone, completion status, RPE, scheduled/completed dates
  - `metrics` — daily body metrics (weight, resting HR, ride minutes, long ride km, fatigue, notes)
  - `service_items` — bike maintenance items with status tracking (Planned/Done)
  - `goal_events` — goal event with name, date, distance, elevation, location
  - `strava_activities` — synced Strava ride data (distance, time, elevation, HR, power, etc.)
  - `app_settings` — key-value settings store (also stores Strava refresh token and sync state)
- **Storage pattern**: `IStorage` interface in `server/storage.ts` with `DatabaseStorage` implementation using Drizzle

## Build System

- **Dev**: `tsx server/index.ts` runs the full-stack dev server
- **Build**: Custom `script/build.ts` that runs Vite build for client and esbuild for server
- **Server bundling**: Allowlisted dependencies are bundled into the server build to reduce cold start syscalls; others are externalized

## Key Design Decisions

1. **Shared schema**: The `shared/` directory contains Drizzle table definitions and Zod schemas used by both client and server, ensuring type safety across the stack
2. **No client-side router**: The app uses simple tab-based state management rather than a URL router — all views are in `client/src/pages/`
3. **Dark-first theme**: CSS variables in `index.css` define a dark color scheme with no light mode toggle
4. **Session-based training plan**: Sessions are pre-seeded with week numbers and can be toggled complete, edited for RPE/notes — the plan is structured around weeks leading to a goal event
5. **Strava integration**: OAuth flow with token refresh. Syncs ride activities from Strava API. Service in `server/strava.ts`, panel UI in `client/src/components/strava-panel.tsx`
6. **Workout library**: 17 detailed workout templates with markdown instructions. Library in `server/workout-library.ts`, modal in `client/src/components/workout-detail-modal.tsx`
7. **AI Plan Builder**: Uses Google Gemini (via Replit AI Integrations) to generate personalized training plans. 3-step form collects event info, athlete profile, and equipment/schedule preferences. Generator in `server/ai-plan-generator.ts`, UI in `client/src/components/ai-plan-builder.tsx`
8. **Authentication**: Replit Auth (OIDC) for user authentication. Login page at `client/src/pages/login.tsx`, auth hook at `client/src/hooks/use-auth.ts`. Auth tables (`users`, `auth_sessions`) defined in `shared/models/auth.ts`. All `/api/` routes protected with `isAuthenticated` middleware (auth routes exempted). Auth integration files in `server/replit_integrations/auth/`.

# External Dependencies

- **PostgreSQL**: Required database, connected via `DATABASE_URL` environment variable. Uses `pg` (node-postgres) driver with connection pooling
- **connect-pg-simple**: Session store for Express sessions backed by PostgreSQL
- **Google Fonts**: DM Sans, Fira Code, Geist Mono, Architects Daughter loaded via Google Fonts CDN in `client/index.html`
- **Replit plugins** (dev only): `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` — only active in development on Replit
- **Recharts**: Client-side charting library for metrics visualization
- **date-fns**: Date manipulation utilities
- **@google/genai**: Google Gemini AI SDK for AI plan generation (via Replit AI Integrations, no separate API key needed)
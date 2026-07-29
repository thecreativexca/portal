# Company Portal

A full-featured internal company management portal built with **Next.js 16** (App Router), **MongoDB**, **NextAuth v4**, and **Tailwind CSS v4** with dark mode.

## Features

- **Authentication** — Login with email/password via NextAuth CredentialsProvider, JWT sessions with role
- **User Management** (CEO) — Create, edit, delete employees and managers
- **Attendance** — Check-in / check-out with auto status calculation (present / half-day / absent)
- **Leave Management** — Apply leave, CEO approve/reject, history with pagination
- **Projects** — Create projects, assign team members, track status (active / completed / on-hold)
- **Tasks** — Create tasks under projects, assign to members, update status, add comments
- **Calendar** — Interactive monthly calendar showing task deadlines and leave dates
- **Reports** (CEO) — Attendance bar charts, project completion bars, task distribution pie chart
- **Settings** (CEO) — Company name, working hours/days, leave policy configuration
- **Activity Logs** (CEO) — Filterable audit trail of all system actions
- **Dark Mode** — System-default + toggle with localStorage persistence

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Authentication | NextAuth v4 (JWT, CredentialsProvider) |
| Database | MongoDB + Mongoose 9 |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Calendar | react-calendar |
| Notifications | react-hot-toast |
| Language | TypeScript |

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB Atlas cluster (or local MongoDB)
- npm / pnpm / yarn

### Environment Variables

Create a `.env.local` file in the project root:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/company-portal?retryWrites=true&w=majority
NEXTAUTH_SECRET=<random-secret-key>
NEXTAUTH_URL=http://localhost:3000
```

> Generate a secure `NEXTAUTH_SECRET` with: `openssl rand -base64 32`

### Installation

```bash
npm install
```

### Seed CEO User

```bash
npm install -D ts-node
npx ts-node scripts/seed.ts
```

This creates the default admin account:

| Field | Value |
|-------|-------|
| Email | `ceo@company.com` |
| Password | `password123` |
| Role | CEO |

### Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) — you'll be redirected to login.

## Production Build

```bash
npm run build
npm start
```

## Deployment

### Vercel (Recommended)

1. Push the repo to GitHub
2. Import into [Vercel](https://vercel.com/new)
3. Add environment variables:
   - `MONGODB_URI`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (your production URL, e.g. `https://portal.vercel.app`)
4. Deploy

> **Note:** The built-in Team Chat feature uses Socket.IO which requires a separate WebSocket server outside of Vercel (see below).

### MongoDB Atlas

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Whitelist all IPs (`0.0.0.0/0`) for development
3. Copy the connection string into `MONGODB_URI`

### Socket.IO Chat Server (Optional)

The Team Chat page is ready for socket integration. Deploy a Node.js WebSocket server separately:

```bash
# On Railway / Render / any Node.js host
npm install express socket.io cors
node server.js
```

Update the WebSocket URL in `app/(dashboard)/chat/page.tsx`.

## Project Structure

```
├── app/
│   ├── (dashboard)/   # Protected pages (attendance, leaves, projects, tasks, etc.)
│   ├── api/           # API routes (users, attendance, leaves, projects, tasks, etc.)
│   ├── login/         # Login page
│   └── page.tsx       # Dashboard home (redirects to login if unauthenticated)
├── components/        # Reusable UI (Sidebar, ThemeProvider, Providers)
├── lib/               # Utilities (db.ts, auth.ts, logActivity.ts)
├── models/            # Mongoose models (User, Attendance, Leave, Project, Task, Settings, ActivityLog)
├── scripts/           # Seed script
└── proxy.ts           # Route protection (Next.js 16 Proxy, replaces middleware)
```

## Role-Based Access

| Feature | CEO | Manager | Employee |
|---------|-----|---------|----------|
| Dashboard stats | Company-wide | Team | Personal |
| User management | ✅ CRUD | ❌ | ❌ |
| Attendance | View all | View all | Own + check in/out |
| Leave | Approve/reject, view all | View all | Apply, view own |
| Projects | Create/edit/delete | Create/edit | View assigned |
| Tasks | Create/assign | Create/assign | Update status, comment |
| Reports | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ |
| Activity Logs | ✅ | ❌ | ❌ |
| Calendar | All events | All events | Own events |

## API Routes

| Method | Route | Auth | Role |
|--------|-------|------|------|
| POST | `/api/auth/[...nextauth]` | — | All |
| GET/POST | `/api/users` | ✅ | CEO |
| GET/PUT/DELETE | `/api/users/[id]` | ✅ | CEO |
| POST | `/api/attendance/checkin` | ✅ | All |
| POST | `/api/attendance/checkout` | ✅ | All |
| GET | `/api/attendance` | ✅ | All (filtered) |
| GET/POST | `/api/leaves` | ✅ | All |
| PUT | `/api/leaves/[id]` | ✅ | CEO |
| GET/POST | `/api/projects` | ✅ | CEO/Manager |
| GET/PUT/DELETE | `/api/projects/[id]` | ✅ | CEO/Manager |
| GET/POST | `/api/tasks` | ✅ | CEO/Manager |
| PUT | `/api/tasks/[id]` | ✅ | All (filtered) |
| POST | `/api/tasks/[id]/comment` | ✅ | All |
| GET | `/api/calendar` | ✅ | All |
| GET | `/api/reports/attendance` | ✅ | CEO |
| GET | `/api/reports/projects` | ✅ | CEO |
| GET/PUT | `/api/settings` | ✅ | CEO |
| GET | `/api/logs` | ✅ | CEO |
| GET | `/api/dashboard/stats` | ✅ | All |

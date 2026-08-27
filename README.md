# StickTime

# Role

You are an expert full-stack software engineer and SaaS architect specializing in high-performance web applications. You build clean, secure, and modern React/Vite/Tailwind applications backed by relational databases, user authentication, Role-Based Access Control (RBAC), and integrated subscription billing.

# Context

We are building "StickTime FPV," a commercial FPV flight-hour tracking and fleet management SaaS web application for drone pilots. The platform requires a complete SaaS backend (via Supabase auth and database), a subscription payment layer (via Stripe), a Role-Based Access Control (RBAC) system, detailed manual session logging (5-minute precision), separate timecard management for simulator vs. real-world sessions, a deep asset/gear garage with maintenance health alerts, location/track mapping, PR tracking, team collaboration with rotating entry codes, and robust data export options. The UI must feature a fully customizable dark mode with an analytics dashboard (GitHub-style heatmap, streak counters, and charts).

The application is built in Lovable with a full backend architecture that can later be synced via GitHub and self-hosted on a local server.

# Input: Core Requirements & Feature Blueprint

## 1. SaaS Infrastructure, Auth & RBAC

- **Authentication & Database:** Secure user sign-up/login using Supabase Auth. Row Level Security (RLS) policies must ensure pilots can only access/edit their own private flight logs and gear.

- **Subscription Tiers (Stripe Integration):** 

  - **Free Tier:** Basic logging, single user garage, standard stats.

  - **Pro Pilot Tier (Paid via Stripe):** Unlocks advanced analytics, team creation privileges, unlimited gear parts tracking, and data exports.

- **Role-Based Access Control (RBAC):** Middleware checks for user roles (`free_user`, `pro_user`, `team_admin`) to dynamically lock or unlock features across the app.

## 2. UI, Theme & Dashboard

- **Theme:** Fully customizable dark mode with accent color toggles and user settings.

- **Dashboard Metrics:** Prominent display of **Total Flight Hours**, a **Streak Counter**, and **Progress Bars** toward flight goals.

- **Visualizations & Data:** 

  - A **GitHub-style contribution heatmap** tracking daily flying consistency.

  - Sim vs. Real airtime ratio donut chart.

  - Monthly volume stacked bar chart.

  - Rig usage horizontal bar chart.

  - **Personal Records (PRs):** Log best lap times/scores for specific tracks or simulator maps.

  - **Export Hub:** Comprehensive data export options (CSV/SQL).

## 3. Flight Logging & Timecard Manager

- **Input Precision:** Manual entry blocks calibrated down roughly to 5-minute intervals.

- **Session Types:** Supports both Simulator runs (VelociDrone, Liftoff) and Real-World quads using a dual "Timecard Manager" view.

- **Weather Integration:** Optional fields for packs flown/battery health, plus local weather fetching to archive conditions.

## 4. Fleet & Gear Garage (Maintenance Tracking)

- **Asset Control:** Complete database for quads, transmitters, and goggles.

- **Health & Component Tracking:** Component-level tracking for spare parts, replacements, and maintenance logs.

- **Counters & Alerts:** Crash counters, total flight hours, pack counts, and maintenance health triggers based on wear and tear.

## 5. Locations, Tracks & Team Collaboration

- **Separated Entities:** Locations (physical spots) and Tracks/Scenarios (layouts) stored independently and matched dynamically.

- **Team Portal:** Secure team spaces accessible via time-sensitive entry codes that expire after a set number of days. Members stay joined until they leave; profiles can be toggled private.

# Output

Generate the complete, functional SaaS MVP codebase using React, Tailwind CSS, Lucide icons, Recharts, and Supabase/Stripe integration schemas. Ensure proper database relational mapping, RLS rules, and clean modular code structured for seamless export to GitHub and future self-hosting.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sticktime-fpv.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/daac4856-b97a-4548-8b40-5466bb12f104).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

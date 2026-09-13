# org_role access matrix — test model

Typed squadron roles, enforced end-to-end: Postgres CHECK + RLS + money-lock
triggers, exposed to the client through one RPC. Seeded accounts let you log
in as any role and watch the app change under you.

## Accounts (all on the dev database)

Squadron under test: **RBAC Test Squadron** (`bb000000-0000-4000-8000-000000000001`)

| Email | Password | Squadron role | Platform | Sees money fields | Manages members | Ledger |
|---|---|---|---|---|---|---|
| `owner@test.sticktime` | `Passw0rd!owner` | owner | user/pro | yes | yes | yes |
| `manager@test.sticktime` | `Passw0rd!manager` | manager | user/pro | yes | no | yes |
| `member@test.sticktime` | `Passw0rd!member` | member | user/free | no | no | no |
| `member2@test.sticktime` | `Passw0rd!member2` | member (ledger granted) | user/free | no | no | yes |
| `pilot@test.sticktime` | `Passw0rd!pilot` | **not a member** | user/free | — | — | — |
| `admin@test.sticktime` | `Passw0rd!admin` | member (+admin override) | admin/enterprise | yes | yes | yes |

⚠️ Documented dev credentials — do not run the seed migration against prod.

## Trying it in the preview

The dev server runs on `http://localhost:5175` (ports are separate auth
origins; the user's 5173 session does not carry over):

1. Open `http://localhost:5175/?showAuth=true&mode=login` (or use the Sign in button)
2. Log in with any account above
3. Visit **Gear Hanger → squadron hanger** or **Squadrons** and compare:
   - **owner**: money fields editable, member management, can delete shared gear
   - **manager**: money fields editable, no member management, can delete shared gear
   - **member**: can add/edit gear, money fields hidden/locked (server rejects writes with "Money-locked…"), cannot delete
   - **member2**: same as member, but the squadron ledger is visible
   - **pilot**: squadron pages show the not-a-member state
   - **admin**: everything, via the platform-admin override

## Server contract

`get_my_org_role(team_id)` returns `{ role, can_write, can_edit_money,
can_manage_members, can_view_ledger, can_view_analytics }` — the flags are
the enforcement truth (RLS policies, money-lock triggers and the admin
override all agree with them). `get_my_org_memberships()` lists the caller's
squadrons with roles.

### Administration RPCs (all guards server-side)

| RPC | Guard | Effect |
|---|---|---|
| `set_member_org_role_batch(team_id, user_ids[], role)` | **team owner** or platform admin only — managers cannot promote/demote | Atomic promote/demote of many members; refuses the owner's own row and any non-member (nothing is partially applied); resets switch columns to defaults on transition |
| `set_member_org_role(team_id, user_id, role)` | same | Singular delegate to the batch |
| `set_member_permissions_batch(team_id, user_ids[], permission, granted)` | owner/manager or admin | Atomic switch toggle for many members (`can_edit_gear`, `can_view_analytics`, `can_view_ledger`); refuses owner/manager rows |
| `set_member_permission(team_id, user_id, permission, granted)` | owner/manager or admin | Singular switch toggle |

An explicit `false` switch **revokes** a member's default access — the RLS
policies (`org_gear.can_edit_gear`, including `squadron_gear` INSERT/UPDATE)
and `get_my_org_role` both honor it.

The client consumes these via `useOrgRole(teamId)` / the permission matrix in
`src/lib/org_role.ts`; `gear-scope.tsx` resolves hanger access from the same
RPC, and the squadron manage page operates members only through the
administration RPCs above (batch UI in
`src/components/squadron/batch-permission-bar.tsx`).

## Enforcement layers

1. **Write boundary** — `team_members.team_role` CHECK constraint: only
   `owner|manager|member` can be stored.
2. **RLS** — `org_member_*` policies (asset tables) and the member-scoped
   "Squadron gear/checkouts" policies (shared gear): membership required for
   any access; non-members see nothing. The old
   `authenticated_full_access_*` wildcard bypass policies were dropped in
   `20260926020000_drop_org_gear_full_access_bypass.sql`.
3. **Money lock** — `org_gear.enforce_money_locks()` trigger: only owner/
   manager may write money columns (`purchase_cost` etc.) or delete
   money-bearing rows; a plain member gets `insufficient_privilege`.
   `squadron_gear` was added to this lock in `20260926030000`.
4. **Admin override** — `org_gear.is_site_admin()` (profiles.role admin/dev)
   acts with full rights everywhere.

## Running the automated test

`supabase/tests/org_role_access.test.sql` impersonates each account via
`request.jwt.claims`, asserts the whole matrix (RPC flags, RLS isolation,
money lock, delete rules, CHECK boundary), then rolls back. Run it with any
SQL client against the dev DB — it must print
`org_role access matrix: ALL CHECKS PASSED` and leave zero rows behind.

## Files

- `supabase/migrations/20260926000000_org_role_typed_rbac.sql` — enum, CHECK, RPCs
- `supabase/migrations/20260926010000_seed_org_role_test_accounts.sql` — the cast
- `supabase/migrations/20260926020000_drop_org_gear_full_access_bypass.sql` — security fix
- `supabase/migrations/20260926030000_squadron_gear_money_lock.sql` — money lock for squadron_gear
- `supabase/migrations/20260926140000_member_role_rpc.sql` — batch administration RPCs + squadron_gear can_edit_gear policies
- `supabase/tests/org_role_access.test.sql` — the matrix test
- `supabase/tests/member_role_admin.test.sql` — batch/revocation/guard test (ends with the expected `MARKER-STOP-ALL-PASSED` exception; no `FAIL` means all checks passed)

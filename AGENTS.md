<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

<!-- AGENTS:BEGIN -->

> [!CAUTION]
> **Auth email bounces — read before creating ANY test account.**
>
> This Supabase project (`xmbnzzzqepygeyiniijd`) is on a shared email pool.
> Supabase has already warned us about a high bounce rate caused by test
> signups to fake addresses (`example.com`, invented Gmail inboxes, etc.):
> the app's public signup flow (`supabase.auth.signUp`) sends a REAL
> confirmation email, and password resets / confirmation resends send more.
> Every bounce poisons sender reputation and can get email delivery
> throttled for the whole project.
>
> **Rules for all agents and threads:**
>
> 1. NEVER create test accounts through the app's signup flow or by any
>    path that triggers an auth email (signUp, resetPasswordForEmail,
>    inviteUserByEmail, resend confirmation).
> 2. Use the seeded cast instead — see
>    `supabase/migrations/20260926010000_seed_org_role_test_accounts.sql`:
>    `owner@test.sticktime` / `manager@test.sticktime` /
>    `member@test.sticktime` / `member2@test.sticktime` /
>    `pilot@test.sticktime` / `admin@test.sticktime`
>    (password `Passw0rd!<name>`, e.g. `Passw0rd!owner`). They are
>    pre-confirmed, so logging in sends no email.
> 3. Need a custom identity? INSERT directly into `auth.users` with
>    `email_confirmed_at` set (copy the seed migration's pattern), and use
>    an address on a REAL domain you control — or better, reuse the cast.
> 4. NEVER trigger password-reset or confirmation emails to any fake
>    domain. If you ever must test the email flow, use a real inbox.
> 5. Clean up by deleting the `auth.users` row (most profile tables
>    CASCADE); do not leave probe accounts behind.

<!-- AGENTS:END -->

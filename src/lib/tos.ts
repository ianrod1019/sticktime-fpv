/**
 * Terms of Service contract — single source of truth.
 *
 * The legal copy (src/routes/terms.tsx) and the signup affirmations
 * (src/components/auth-modal.tsx) both render from this module, so the
 * binding language can never drift between the two surfaces.
 *
 * NOTE: No prices are ever referenced here. Tier references are by name
 * and "then-current subscription fee" only, so pricing can change freely
 * without a legal copy rewrite. Billing is offline (BILLING_LIVE = false)
 * and nothing in this module depends on it.
 */

import { z } from "zod";

/** Version string persisted with every acceptance record (public.tos_acceptances). */
export const TOS_CURRENT_VERSION = "2026-09-noncommercial";

/**
 * §6 — Non-Commercial License Restriction (Pro/Hobbyist tier).
 * The signup checkbox #1 must match the substance of this clause.
 */
export const TOS_NONCOMMERCIAL_COPY =
  "The Pro (Hobbyist) tier is licensed strictly for personal, non-commercial, " +
  "non-monetized use. Any commercial operation, client work, or business use " +
  "constitutes a material breach of these Terms and will result in immediate " +
  "account termination. Commercial use requires a Solo Commercial, School, or " +
  "Enterprise tier.";

/**
 * §7 — Single-User Accounts; No Credential Sharing or Seat Pooling.
 * The signup checkbox #2 must match the substance of this clause.
 */
export const TOS_ANTI_SHARING_COPY =
  "Login credentials are strictly for single-user access. Sharing credentials, " +
  "pooling individual accounts, or allowing multiple distinct operators or " +
  "students to access the platform through a single user account is strictly " +
  "prohibited. Every individual pilot, student, or operator must maintain " +
  "their own authorized, paid seat or school-managed profile.";

/** Exact affirmation #1 (mandatory, unchecked by default at signup). */
export const AFFIRMATION_NONCOMMERCIAL =
  "I certify under penalty of account suspension that I am using this Pro account strictly for personal, non-commercial use.";

/** Exact affirmation #2 (mandatory, unchecked by default at signup). */
export const AFFIRMATION_SINGLE_SEAT =
  "I agree that login credentials are for single-user access only and will not be shared with other individuals to bypass per-seat licensing.";

/**
 * Both affirmations must be literally `true` — the schema is the client-side
 * gate ahead of supabase.auth.signUp. The server re-validates the same
 * requirement in record_signup_affirmations (see the tos migration), so a
 * tampered client cannot skip the affirmations.
 */
export const signupAffirmationSchema = z
  .object({
    nonCommercialAffirmed: z.literal(true),
    singleSeatAffirmed: z.literal(true),
  })
  .refine(
    ({ nonCommercialAffirmed, singleSeatAffirmed }) =>
      nonCommercialAffirmed === true && singleSeatAffirmed === true,
    {
      message:
        "Both certification statements must be affirmed before an account can be created.",
    },
  );

export type SignupAffirmations = z.infer<typeof signupAffirmationSchema>;

/** Tiers that carry commercial usage rights (TOS §6). */
export const COMMERCIAL_TIERS = [
  "solo_commercial",
  "school",
  "enterprise",
] as const;

/** Tiers restricted to personal, non-commercial use (TOS §6). */
export const NONCOMMERCIAL_TIERS = ["free", "pro"] as const;

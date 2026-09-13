/**
 * Single source of truth for the billing rollout state.
 *
 * Flip `BILLING_LIVE` to true when Stripe checkout ships — every surface
 * that mentions the rollout reads from here (see docs/generate-billing-note.mjs
 * for how the documentation pages stay in sync).
 */
export const BILLING_LIVE = false;

export const BILLING_TEAM_LABEL = "the StickTime team";

export const BILLING_COMING_SOON_TEXT =
  "Billing launches soon — paid tiers are currently limited to developers and testers.";

/** The CTA label shown on upgrade prompts. */
export function upgradeCtaLabel(): string {
  return BILLING_LIVE ? "Upgrade" : "Billing coming soon";
}

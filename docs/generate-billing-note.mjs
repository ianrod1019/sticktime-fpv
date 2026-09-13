/**
 * Stamps the billing-rollout callout into the docs pages that mention it,
 * reading the wording from src/lib/billing-status.ts — the same constant
 * the upgrade modal uses. Run via `npm run docs:sync`.
 *
 * When BILLING_LIVE flips to true, regenerate docs (`npm run docs:sync`)
 * and update the pages that describe checkout.
 */
import { readFileSync, writeFileSync } from "node:fs";

// Extract the constants from the TS source (no transpile needed — plain consts).
const src = readFileSync("src/lib/billing-status.ts", "utf8");
const live = /BILLING_LIVE\s*=\s*(true|false)/.exec(src)?.[1] === "true";

const STATUS_NOTE = live
  ? `<Note>
**Paid tiers are live.** Upgrade anywhere you see a lock — checkout runs
through **Stripe**, and card data never touches StickTime servers.
</Note>`
  : `<Note>
**Billing is not live yet.** Paid tiers arrive with the Stripe billing
launch. Until then, Pro and Enterprise access is **limited to developers
and testers**, granted by the StickTime team. Upgrade buttons appear in the
app, but public checkout is disabled.
</Note>`;

const TESTER_NOTE = live
  ? `Upgrades are self-serve — no team grant needed.`
  : `Are you a tester waiting for access? Contact the StickTime team — your account tier updates on your next sign-in.`;

const replacements = [
  {
    file: "docs/billing-tiers.mdx",
    marker: "{/* billing:status */}",
    content: STATUS_NOTE,
  },
  {
    file: "docs/billing-tiers.mdx",
    marker: "{/* billing:tester */}",
    content: TESTER_NOTE,
  },
];

for (const { file, marker, content } of replacements) {
  let mdx = readFileSync(file, "utf8");
  if (!mdx.includes(marker)) {
    console.warn(`marker ${marker} not found in ${file} — skipped`);
    continue;
  }
  mdx = mdx.replace(new RegExp(`${marker}[\\s\\S]*?(?=\n\n|</Note>)`), marker + "\n" + content);
  writeFileSync(file, mdx);
}
console.log(`billing notes stamped (BILLING_LIVE=${live})`);

/**
 * Shared tier data for /features and /pricing — one source so the
 * capability matrix and pricing can't drift between the two pages.
 *
 * Prices are placeholders pending a real Stripe launch (see BILLING_LIVE
 * in billing-status.ts) — update PRICING_PLANS when numbers are final.
 */

export const TIER_ORDER = [
  "Free",
  "Pro",
  "Squad",
  "Solo Commercial",
  "School",
  "Enterprise",
] as const;

export type TierName = (typeof TIER_ORDER)[number];

export const TIER_MATRIX: {
  capability: string;
  access: Record<TierName, boolean | "limited" | "addon">;
}[] = [
  {
    capability: "Flight logging (sim + real)",
    access: {
      Free: true,
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Dashboard, heatmap & streaks",
    access: {
      Free: true,
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Personal gear hanger",
    access: {
      Free: true,
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Personal cost ledger",
    access: {
      Free: true,
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "CSV export of your logbook",
    access: {
      Free: true,
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Full JSON export",
    access: {
      Free: true,
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Master parts inventory & builds",
    access: {
      Free: "limited",
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Create a squadron (roster)",
    access: {
      Free: true,
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Squadron shared gear & checkouts",
    access: {
      Free: false,
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Squadron ledger & failure analytics",
    access: {
      Free: false,
      Pro: true,
      Squad: true,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Bundled group billing (one price for a 5–10 pilot squad)",
    access: {
      Free: false,
      Pro: false,
      Squad: true,
      "Solo Commercial": false,
      School: false,
      Enterprise: false,
    },
  },
  {
    capability: "Certification & Compliance Vault (Part 107, waivers, medical, training)",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Automated no-fly / no-schedule compliance enforcement",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Safety incident logging (SMS)",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Job Hazard Analysis (JHA) pre-flight checklists",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Firmware & configuration version control, airworthiness gating",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Client-job CRM (booking, deliverables, client links)",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "White-labeled client delivery portals",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": true,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Scheduling & dispatch calendar (hardware double-booking prevention)",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": true,
      School: "addon",
      Enterprise: true,
    },
  },
  {
    capability: "Fleet-wide policy lockdowns (firmware floor, preflight checklist, inventory lock)",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": false,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Squadron meetups & RSVP",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": false,
      School: true,
      Enterprise: true,
    },
  },
  {
    capability: "Organization-level fleet (multi-squadron district rollup)",
    access: {
      Free: false,
      Pro: false,
      Squad: false,
      "Solo Commercial": false,
      School: false,
      Enterprise: true,
    },
  },
];

export interface PricingPlan {
  tier: TierName;
  subtitle: string;
  price: string;
  period: string;
  items: string[];
  highlight?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    tier: "Free",
    subtitle: "For the serious solo operator",
    price: "$0",
    period: "forever",
    items: [
      "Unlimited flight logs",
      "Gear hanger and service clocks",
      "Create a squadron (roster only)",
    ],
  },
  {
    tier: "Pro",
    subtitle: "Hobbyist depth, not for commercial use",
    price: "$8",
    period: "/mo",
    items: [
      "Battery health and IR tracking",
      "Squadron shared gear & ledger",
      "Personal failure analytics",
    ],
  },
  {
    tier: "Squad",
    subtitle: "For hobbyist squads & clubs — still non-commercial",
    price: "$15–25",
    period: "/mo, per squad (5–10 pilots)",
    items: [
      "Everything in Pro, per pilot",
      "Shared club roster & joint flight logs",
      "Group activity feed",
      "Same strict non-commercial restriction as Pro",
    ],
  },
  {
    tier: "Solo Commercial",
    subtitle: "For the single commercial pilot",
    price: "$40",
    period: "/mo",
    items: [
      "Everything in Pro",
      "Compliance Vault + no-fly enforcement",
      "Client job CRM & delivery portals",
    ],
    highlight: true,
  },
  {
    tier: "School",
    subtitle: "For educational drone programs",
    price: "$960",
    period: "/yr, per school",
    items: [
      "Institution-wide roster",
      "Compliance Vault (Part 107, waivers)",
      "SMS incident logging & JHA checklists",
    ],
  },
  {
    tier: "Enterprise",
    subtitle: "For commercial fleets",
    price: "$15,000",
    period: "/yr, per 25 seats",
    items: [
      "Squadron controls and fleet-wide policy locks",
      "Firmware & airworthiness compliance",
      "Compliance Vault, org-wide",
    ],
  },
];

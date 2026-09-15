/**
 * qa-fixtures — the fake world QA mode renders.
 *
 * Every shape here mirrors its typed client contract exactly (see
 * src/types/{enterprise,certs,sms,portals}.ts) so intercepted hooks can
 * return fixtures with zero component changes. All ids are qa-prefixed
 * sentinel strings — they are never written to the database because QA
 * mode refuses writes before any request leaves the page.
 *
 * The cast: an enterprise ("Skyline UAS District") with two orgs — one
 * commercial, one a school — plus fake pilots, certified docs (some
 * expiring, to exercise the badges), an incident mix across statuses,
 * live + expired delivery portals, and district metrics.
 */

import type { MyEnterpriseMembership, EnterpriseMetrics } from "@/types/enterprise";
import type { VaultDocumentWithStatus } from "@/types/certs";
import type { Incident } from "@/types/sms";
import type { Delivery, DeliveryFile } from "@/types/portals";
import type { IncidentDraft } from "@/types/sms";
import type { DeliveryDraft, DeliveryExpirationDays } from "@/types/portals";
import type { JhaTemplate, JhaSubmission } from "@/types/jha";

const QA_ORG = "qa-org-0001";
const QA_ORG_SCHOOL = "qa-org-0002";
const QA_ENTERPRISE = "qa-ent-0001";

function iso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
}

function isoDate(daysFromNow: number): string {
  return iso(daysFromNow).slice(0, 10);
}

/** MyEnterpriseMembership rows as get_my_enterprises would return them. */
export const QA_MEMBERSHIPS: MyEnterpriseMembership[] = [
  {
    enterprise_id: QA_ENTERPRISE,
    enterprise_name: "Skyline UAS District",
    plan_code: "multi_district",
    plan_name: "Enterprise — Multi-Squadron District",
    annual_price_floor: 15000,
    district_features: true,
    my_role: "district_admin",
    organization_id: QA_ORG,
    organization_name: "Skyline Operations",
    team_id: "qa-team-0001",
    is_school: false,
  },
  {
    enterprise_id: QA_ENTERPRISE,
    enterprise_name: "Skyline UAS District",
    plan_code: "multi_district",
    plan_name: "Enterprise — Multi-Squadron District",
    annual_price_floor: 15000,
    district_features: true,
    my_role: "squadron_admin",
    organization_id: QA_ORG_SCHOOL,
    organization_name: "Basin High Drone Club",
    team_id: "qa-team-0002",
    is_school: true,
  },
];

/** EnterpriseMetrics as get_enterprise_metrics returns. */
export const QA_METRICS: EnterpriseMetrics = {
  enterprise_id: QA_ENTERPRISE,
  generated_at: new Date().toISOString(),
  totals: {
    org_count: 2,
    active_pilots: 14,
    squadron_admins: 3,
    fleet_size: 23,
    flight_hours_30d: 86.5,
    active_enforcements: 2,
  },
  per_org: [
    {
      organization_id: QA_ORG,
      name: "Skyline Operations",
      is_school: false,
      team_id: "qa-team-0001",
      active_pilots: 9,
      squadron_admins: 2,
      fleet_size: 15,
      flight_hours_30d: 61.0,
      active_policies: 2,
    },
    {
      organization_id: QA_ORG_SCHOOL,
      name: "Basin High Drone Club",
      is_school: true,
      team_id: "qa-team-0002",
      active_pilots: 5,
      squadron_admins: 1,
      fleet_size: 8,
      flight_hours_30d: 25.5,
      active_policies: 1,
    },
  ],
};

/** Vault docs spanning every status so the badges all render. */
export const QA_VAULT_DOCS: VaultDocumentWithStatus[] = [
  {
    id: "qa-vault-0001",
    organization_id: QA_ORG,
    user_id: "qa-user-0001",
    document_type: "part_107",
    file_name: "part107-rivera-cert.pdf",
    mime_type: "application/pdf",
    file_path: "qa/unused.pdf",
    issue_date: isoDate(-400),
    expiration_date: isoDate(730),
    verified_by: "qa-user-0002",
    verified_at: iso(-390),
    created_at: iso(-400),
    updated_at: iso(-400),
    status: "active",
  },
  {
    id: "qa-vault-0002",
    organization_id: QA_ORG,
    user_id: "qa-user-0003",
    document_type: "liability_waiver",
    file_name: "waiver-okonkwo-2026.pdf",
    mime_type: "application/pdf",
    file_path: "qa/unused.pdf",
    issue_date: isoDate(-360),
    expiration_date: isoDate(12),
    verified_by: null,
    verified_at: null,
    created_at: iso(-360),
    updated_at: iso(-360),
    status: "expiring_soon",
  },
  {
    id: "qa-vault-0003",
    organization_id: QA_ORG,
    user_id: "qa-user-0004",
    document_type: "trust",
    file_name: "trust-cert-hartley.pdf",
    mime_type: "application/pdf",
    file_path: "qa/unused.pdf",
    issue_date: isoDate(-800),
    expiration_date: isoDate(-30),
    verified_by: "qa-user-0002",
    verified_at: iso(-790),
    created_at: iso(-800),
    updated_at: iso(-800),
    status: "expired",
  },
  {
    id: "qa-vault-0004",
    organization_id: QA_ORG_SCHOOL,
    user_id: "qa-user-0005",
    document_type: "parental_waiver",
    file_name: "parental-waiver-alvarez.pdf",
    mime_type: "application/pdf",
    file_path: "qa/unused.pdf",
    issue_date: isoDate(-100),
    expiration_date: isoDate(265),
    verified_by: null,
    verified_at: null,
    created_at: iso(-100),
    updated_at: iso(-100),
    status: "active",
  },
];

/** Incident mix: one of each status so review queues render fully. */
export const QA_INCIDENTS: Incident[] = [
  {
    incident_id: "qa-incident-0001",
    organization_id: QA_ORG,
    user_id: "qa-user-0003",
    airframe_id: "qa-airframe-0001",
    incident_date: isoDate(-2),
    severity_level: "medium",
    incident_type: "crash",
    description:
      "Lost video signal behind the grain silo; controlled descent into a gravel road. Frame cracked, no injuries, no property damage.",
    corrective_action: null,
    status: "open",
    attachment_path: null,
    created_at: iso(-2),
    updated_at: iso(-2),
  },
  {
    incident_id: "qa-incident-0002",
    organization_id: QA_ORG,
    user_id: "qa-user-0004",
    airframe_id: "qa-airframe-0002",
    incident_date: isoDate(-9),
    severity_level: "low",
    incident_type: "near_miss",
    description:
      "Crewed helicopter passed within ~150m of the flight cell during a mapping run. Mission aborted, pilot landed immediately.",
    corrective_action:
      "Spotter added to the crew roster for all mapping sorties near the heliport corridor.",
    status: "under_review",
    attachment_path: null,
    created_at: iso(-9),
    updated_at: iso(-5),
  },
  {
    incident_id: "qa-incident-0003",
    organization_id: QA_ORG,
    user_id: "qa-user-0001",
    airframe_id: null,
    incident_date: isoDate(-40),
    severity_level: "high",
    incident_type: "flyaway",
    description:
      "GPS glitch on arming; aircraft climbed past 300 ft AGL and drifted 800 m north before failsafe RTL recovered it over the field.",
    corrective_action:
      "Firmware minimum raised to 4.5.1 for the affected airframe and a pre-flight GPS-integrity check added to the checklist.",
    status: "closed",
    attachment_path: null,
    created_at: iso(-40),
    updated_at: iso(-32),
  },
  {
    incident_id: "qa-incident-0004",
    organization_id: QA_ORG_SCHOOL,
    user_id: "qa-user-0005",
    airframe_id: null,
    incident_date: isoDate(-1),
    severity_level: "low",
    incident_type: "property_damage",
    description:
      "Student clipped a goalpost during a practice circuit. Prop and arm tip replaced on site; supervisor observed the full flight.",
    corrective_action: null,
    status: "open",
    attachment_path: null,
    created_at: iso(-1),
    updated_at: iso(-1),
  },
];

/** Deliveries: one live, one expiring, one expired. */
export const QA_DELIVERIES: Delivery[] = [
  {
    delivery_id: "qa-delivery-0001",
    organization_id: QA_ORG,
    client_name: "Ridgeline Realty Group",
    project_title: "Riverbend Estates — Phase 2 progress package",
    access_token: "qa-token-0001",
    expires_at: iso(21),
    branding_config: {
      agency_name: "Ridgeline Realty",
      brand_color: "#1d4ed8",
    },
    created_at: iso(-7),
    updated_at: iso(-7),
  },
  {
    delivery_id: "qa-delivery-0002",
    organization_id: QA_ORG,
    client_name: "Carter Civil Engineering",
    project_title: "Quarry expansion survey deliverables",
    access_token: "qa-token-0002",
    expires_at: iso(2),
    branding_config: {
      agency_name: "Carter Civil",
      brand_color: "#047857",
    },
    created_at: iso(-28),
    updated_at: iso(-28),
  },
  {
    delivery_id: "qa-delivery-0003",
    organization_id: QA_ORG,
    client_name: "Halloran Farms",
    project_title: "Drainage-ditch orthomosaic (spring)",
    access_token: "qa-token-0003",
    expires_at: iso(-4),
    branding_config: {},
    created_at: iso(-60),
    updated_at: iso(-60),
  },
];

/** Files on the live delivery — the portal page reads these. */
export const QA_DELIVERY_FILES: DeliveryFile[] = [
  {
    file_id: "qa-file-0001",
    delivery_id: "qa-delivery-0001",
    file_name: "riverbend-phase2-orthomosaic-2026-09-05.tiff",
    file_size: 68_157_952,
    storage_path: "qa/unused.bin",
    created_at: iso(-6),
  },
  {
    file_id: "qa-file-0002",
    delivery_id: "qa-delivery-0001",
    file_name: "riverbend-phase2-flight-summary.pdf",
    file_size: 1_847_296,
    storage_path: "qa/unused.bin",
    created_at: iso(-6),
  },
  {
    file_id: "qa-file-0003",
    delivery_id: "qa-delivery-0001",
    file_name: "riverbend-phase2-elevation-model.zip",
    file_size: 241_172_480,
    storage_path: "qa/unused.bin",
    created_at: iso(-5),
  },
];

/** Fake people rendered by rosters and review queues. */
export const QA_PEOPLE = [
  { id: "qa-user-0001", name: "M. Rivera", role: "Pilot" },
  { id: "qa-user-0002", name: "T. Okonkwo", role: "Squadron admin" },
  { id: "qa-user-0003", name: "J. Hartley", role: "Pilot" },
  { id: "qa-user-0004", name: "A. Silva", role: "Pilot" },
  { id: "qa-user-0005", name: "B. Alvarez", role: "Student" },
] as const;

/** Resolve a fake person's display name; falls back to a QA label. */
export function qaUserName(userId: string | null): string {
  if (!userId) return "Unknown";
  const person = QA_PEOPLE.find((p) => p.id === userId);
  if (person) return person.name;
  return userId.startsWith("qa-user-") ? `QA pilot ${userId.slice(-4)}` : "Pilot";
}

/** Draft for the fake delivery-create flow (returns a QA row, no DB). */
export function qaDeliveryFromDraft(orgId: string, draft: DeliveryDraft): Delivery {
  const days: DeliveryExpirationDays = draft.expires_in_days;
  return {
    delivery_id: `qa-delivery-${Date.now()}`,
    organization_id: orgId,
    client_name: draft.client_name,
    project_title: draft.project_title,
    access_token: `qa-token-${Date.now()}`,
    expires_at: iso(days),
    branding_config: draft.branding_config,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Draft for the fake incident-create flow (returns a QA row, no DB). */
export function qaIncidentFromDraft(orgId: string, userId: string, draft: IncidentDraft): Incident {
  return {
    incident_id: `qa-incident-${Date.now()}`,
    organization_id: orgId,
    user_id: userId,
    airframe_id: draft.airframe_id,
    incident_date: draft.incident_date,
    severity_level: draft.severity_level,
    incident_type: draft.incident_type,
    description: draft.description,
    corrective_action: null,
    status: "open",
    attachment_path: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// -------------------------------------------------------------------
// JHA fixtures
// -------------------------------------------------------------------

export const QA_JHA_TEMPLATES: JhaTemplate[] = [
  {
    template_id: "qa-jha-tpl-001",
    organization_id: QA_ORG,
    title: "Standard FPV Pre-Flight JHA",
    items: [
      {
        section: "Environmental",
        items: [
          { id: "env-1", label: "Wind speed < 25 mph", critical: true },
          { id: "env-2", label: "Visibility > 3 statute miles", critical: true },
          { id: "env-3", label: "No active precipitation", critical: false },
          { id: "env-4", label: "Temperature within battery operating range", critical: false },
        ],
      },
      {
        section: "Hardware",
        items: [
          { id: "hw-1", label: "Frame and props intact, no cracks", critical: true },
          { id: "hw-2", label: "Motors spin freely, no grinding", critical: true },
          { id: "hw-3", label: "Camera and VTX feed confirmed", critical: false },
          { id: "hw-4", label: "Antennas secure", critical: false },
        ],
      },
      {
        section: "Battery",
        items: [
          { id: "bat-1", label: "Pack fully charged and balanced", critical: true },
          { id: "bat-2", label: "No physical damage or swelling", critical: true },
          { id: "bat-3", label: "IR reading within nominal range", critical: false },
          { id: "bat-4", label: "Connector and leads intact", critical: false },
        ],
      },
      {
        section: "Crew & Comms",
        items: [
          { id: "crew-1", label: "Spotter briefed and in position", critical: true },
          { id: "crew-2", label: "Radio link confirmed", critical: true },
          { id: "crew-3", label: "Flight area clear of bystanders", critical: true },
          { id: "crew-4", label: "Emergency procedure reviewed", critical: false },
        ],
      },
    ],
    created_at: iso(-30),
    updated_at: iso(-30),
  },
];

export const QA_JHA_SUBMISSIONS: JhaSubmission[] = [
  {
    submission_id: "qa-jha-sub-001",
    organization_id: QA_ORG,
    user_id: "qa-user-0001",
    template_id: "qa-jha-tpl-001",
    airframe_id: null,
    dispatch_id: null,
    responses: {
      "env-1": { passed: true },
      "env-2": { passed: true },
      "env-3": { passed: true },
      "env-4": { passed: true },
      "hw-1": { passed: true },
      "hw-2": { passed: true },
      "hw-3": { passed: true },
      "hw-4": { passed: true },
      "bat-1": { passed: true },
      "bat-2": { passed: true },
      "bat-3": { passed: true },
      "bat-4": { passed: true },
      "crew-1": { passed: true },
      "crew-2": { passed: true },
      "crew-3": { passed: true },
      "crew-4": { passed: true },
    },
    status: "passed",
    created_at: iso(-0.01),
  },
  {
    submission_id: "qa-jha-sub-002",
    organization_id: QA_ORG,
    user_id: "qa-user-0001",
    template_id: "qa-jha-tpl-001",
    airframe_id: null,
    dispatch_id: null,
    responses: {
      "env-1": { passed: false, note: "Gusts to 30 mph" },
      "env-2": { passed: true },
      "env-3": { passed: true },
      "env-4": { passed: true },
      "hw-1": { passed: true },
      "hw-2": { passed: true },
      "hw-3": { passed: true },
      "hw-4": { passed: true },
      "bat-1": { passed: true },
      "bat-2": { passed: true },
      "bat-3": { passed: true },
      "bat-4": { passed: true },
      "crew-1": { passed: true },
      "crew-2": { passed: true },
      "crew-3": { passed: true },
      "crew-4": { passed: true },
    },
    status: "failed",
    created_at: iso(-2),
  },
];

/** Uniform refusal for any write attempted while QA mode is on. */
export class QaWriteBlockedError extends Error {
  constructor() {
    super(
      "QA mode is on — this is a preview with fake data, so writes are disabled. Turn QA mode off in the Dev & QA console to write to real data.",
    );
    this.name = "QaWriteBlockedError";
  }
}

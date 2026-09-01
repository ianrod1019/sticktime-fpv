export const CONTROLLER_CATEGORIES = [
  { label: "Stick Ends", value: "stickends", placeholder: "e.g. CNC Aluminum V2 Ends" },
  { label: "Gimbals", value: "gimbals", placeholder: "e.g. AG01 Hall Gimbal" },
  { label: "Screen", value: "screen", placeholder: "e.g. OLED Replacement / Protector" },
  { label: "Switches", value: "switches", placeholder: "e.g. 3-Way Toggle Replacement" },
  { label: "Module / Bay", value: "module", placeholder: "e.g. ELRS Nano Backpack" },
  { label: "Battery", value: "battery", placeholder: "e.g. 21700 Li-Ion Pack Mod" },
] as const;

export const GOGGLES_CATEGORIES = [
  { label: "Receiver Module", value: "receiver", placeholder: "e.g. RapidFire, TBS Fusion, HDZero VTX" },
  { label: "Antenna Set", value: "antenna", placeholder: "e.g. TrueRC Patch & Match Set" },
  { label: "Faceplate / Foam", value: "foam", placeholder: "e.g. CNC Aluminum Faceplate / Silicone Foam" },
  { label: "Diopter Lenses", value: "diopter", placeholder: "e.g. -2.0 Prescription Insert" },
  { label: "Headstrap", value: "strap", placeholder: "e.g. Ethix Upgraded Elastic Band" },
  { label: "Battery Pack", value: "battery", placeholder: "e.g. 3000mAh Goggle Strap LiPo" },
] as const;

export interface GearItem {
  id: string;
  user_id: string;
  name: string;
  gear_type: "quad" | "transmitter" | "goggles" | "battery" | "other";
  brand?: string | null;
  service_interval_minutes: number;
  minutes_since_service: number;
  total_minutes: number;
  pack_count: number;
  crash_count: number;
  created_at?: string;
}

export interface GearPart {
  id: string;
  gear_id: string;
  name: string;
  category: string;
  lifespan_minutes: number;
}

export interface MaintenanceLog {
  id: string;
  gear_id: string;
  description: string;
  cost?: number | null;
  performed_on: string;
}

export interface GearCardProps {
  gear: GearItem;
  parts: GearPart[];
  logs: MaintenanceLog[];
  onDeleteGear: (id: string, name: string) => void;
  onAddPart: (gearId: string, partName: string, category: string, description: string) => void;
  onRemovePart: (partId: string) => void;
  onAddLog: (gearId: string, description: string, cost: string) => void;
  onRemoveLog: (logId: string) => void;
  onUpdatePackCount?: (gearId: string, newCount: number) => void;
  isDeleting: boolean;
  isHoveredDelete: boolean;
  onHoverDelete: (id: string | null) => void;
}

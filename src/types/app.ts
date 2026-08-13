import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Dokumentenpruefung {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    beschreibung?: string;
    dokument?: string;
    hochladedatum?: string; // Format: YYYY-MM-DD oder ISO String
    pruefstatus?: LookupValue;
    pruefkommentar?: string;
    prueferdatum?: string; // Format: YYYY-MM-DD oder ISO String
    pruefer?: string;
  };
}

export const APP_IDS = {
  DOKUMENTENPRUEFUNG: '6a7e0b2e1c45ea49b73c3809',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'dokumentenpruefung': {
    pruefstatus: [{ key: "bestanden", get label() { return lookupLabel('dokumentenpruefung', 'pruefstatus', "bestanden") ?? "Bestanden"; } }, { key: "nicht_bestanden", get label() { return lookupLabel('dokumentenpruefung', 'pruefstatus', "nicht_bestanden") ?? "Nicht bestanden"; } }, { key: "ausstehend", get label() { return lookupLabel('dokumentenpruefung', 'pruefstatus', "ausstehend") ?? "Ausstehend"; } }, { key: "nachbesserung_erforderlich", get label() { return lookupLabel('dokumentenpruefung', 'pruefstatus', "nachbesserung_erforderlich") ?? "Nachbesserung erforderlich"; } }],
  },
};

// Optimistic LookupValue writes: never re-type a label — resolve the schema
// option instead (its label is a locale-aware getter; falls back to the key).
// WRONG: status: { key: 'offen', label: 'Offen' }   (frozen in one language)
// RIGHT: status: lookupOption('<appKey>', 'status', 'offen')
export function lookupOption(app: string, field: string, key: string): LookupValue {
  return LOOKUP_OPTIONS[app]?.[field]?.find(o => o.key === key) ?? { key, label: key };
}

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'dokumentenpruefung': {
    'titel': 'string/text',
    'beschreibung': 'string/textarea',
    'dokument': 'file',
    'hochladedatum': 'date/date',
    'pruefstatus': 'lookup/radio',
    'pruefkommentar': 'string/textarea',
    'prueferdatum': 'date/date',
    'pruefer': 'string/text',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateDokumentenpruefung = StripLookup<Dokumentenpruefung['fields']>;
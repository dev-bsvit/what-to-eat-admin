export type JsonRecord = Record<string, unknown>;

export type ProfileLanguage = {
  code: string | null;
  label: string;
  raw: string | null;
  source: string | null;
  isKnown: boolean;
  status: "confirmed" | "legacy_default" | "missing";
  note: string | null;
};

const LANGUAGE_LABELS: Record<string, string> = {
  system: "System",
  en: "English",
  ru: "Русский",
  de: "Deutsch",
  it: "Italiano",
  fr: "Français",
  es: "Español",
  "pt-BR": "Português (BR)",
  uk: "Українська",
};

const LANGUAGE_PATHS: Array<{ source: string; path: string[] }> = [
  { source: "settings.language", path: ["language"] },
  { source: "settings.language_code", path: ["language_code"] },
  { source: "settings.languageCode", path: ["languageCode"] },
  { source: "settings.locale", path: ["locale"] },
  { source: "settings.app_language", path: ["app_language"] },
  { source: "settings.appLanguage", path: ["appLanguage"] },
  { source: "settings.preferred_language", path: ["preferred_language"] },
  { source: "settings.preferredLanguage", path: ["preferredLanguage"] },
  { source: "settings.selected_language", path: ["selected_language"] },
  { source: "settings.selectedLanguage", path: ["selectedLanguage"] },
  { source: "settings.interface_language", path: ["interface_language"] },
  { source: "settings.interfaceLanguage", path: ["interfaceLanguage"] },
  { source: "settings.current_language", path: ["current_language"] },
  { source: "settings.currentLanguage", path: ["currentLanguage"] },
  { source: "settings.active_language", path: ["active_language"] },
  { source: "settings.activeLanguage", path: ["activeLanguage"] },
  { source: "settings.active_language_code", path: ["active_language_code"] },
  { source: "settings.activeLanguageCode", path: ["activeLanguageCode"] },
  { source: "settings.i18n.language", path: ["i18n", "language"] },
  { source: "settings.i18n.locale", path: ["i18n", "locale"] },
  { source: "settings.localization.language", path: ["localization", "language"] },
  { source: "settings.localization.locale", path: ["localization", "locale"] },
  { source: "settings.preferences.language", path: ["preferences", "language"] },
  { source: "settings.preferences.locale", path: ["preferences", "locale"] },
  { source: "settings.onboarding.language", path: ["onboarding", "language"] },
  { source: "settings.onboarding.locale", path: ["onboarding", "locale"] },
];

const PROFILE_LANGUAGE_KEYS = [
  "app_language",
  "appLanguage",
  "language",
  "language_code",
  "languageCode",
  "locale",
  "preferred_language",
  "preferredLanguage",
  "selected_language",
  "selectedLanguage",
  "interface_language",
  "interfaceLanguage",
];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAtPath(record: JsonRecord | null | undefined, path: string[]): unknown {
  let current: unknown = record;

  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }

  return current;
}

function toStringValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!isRecord(value)) return null;

  for (const key of ["code", "isoCode", "rawValue", "value", "locale", "language"]) {
    const nested = value[key];
    if (typeof nested === "string" && nested.trim()) return nested;
  }

  return null;
}

function hasExplicitAppLanguage(settings: JsonRecord | null): boolean {
  const values = [
    valueAtPath(settings, ["app_language"]),
    valueAtPath(settings, ["appLanguage"]),
    valueAtPath(settings, ["selected_language"]),
    valueAtPath(settings, ["selectedLanguage"]),
    valueAtPath(settings, ["preferred_language"]),
    valueAtPath(settings, ["preferredLanguage"]),
    valueAtPath(settings, ["current_language"]),
    valueAtPath(settings, ["currentLanguage"]),
    valueAtPath(settings, ["active_language"]),
    valueAtPath(settings, ["activeLanguage"]),
  ];

  return values.some((value) => Boolean(normalizeLanguageCode(value)));
}

export function normalizeLanguageCode(value: unknown): string | null {
  const raw = toStringValue(value);
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") return null;

  const normalized = trimmed.replace(/_/g, "-").toLowerCase();
  const primary = normalized.split("-")[0];

  if (["system", "auto", "default"].includes(normalized)) return "system";
  if (normalized === "pt-br" || primary === "pt") return "pt-BR";
  if (primary === "ua") return "uk";
  if (["en", "ru", "de", "it", "fr", "es", "uk"].includes(primary)) return primary;

  return trimmed;
}

export function getLanguageLabel(code: string | null): string {
  if (!code) return "Не задан";
  return LANGUAGE_LABELS[code] ?? code;
}

export function extractProfileLanguage(profile: JsonRecord | null | undefined): ProfileLanguage {
  const rawSettings = isRecord(profile) ? profile.settings : null;
  const settings = isRecord(rawSettings) ? rawSettings : null;
  const hasSyncedLanguage = hasExplicitAppLanguage(settings);
  const candidates: Array<{ source: string; value: unknown }> = [];

  if (isRecord(profile)) {
    for (const key of PROFILE_LANGUAGE_KEYS) {
      candidates.push({ source: key, value: profile[key] });
    }
  }

  for (const candidate of LANGUAGE_PATHS) {
    candidates.push({
      source: candidate.source,
      value: valueAtPath(settings, candidate.path),
    });
  }

  for (const candidate of candidates) {
    const raw = toStringValue(candidate.value);
    const code = normalizeLanguageCode(raw);

    if (code) {
      const isLegacyDefault =
        !hasSyncedLanguage && candidate.source === "settings.language" && code === "ru";

      return {
        code: isLegacyDefault ? null : code,
        label: isLegacyDefault ? "Неизвестно" : getLanguageLabel(code),
        raw,
        source: candidate.source,
        isKnown: !isLegacyDefault && Boolean(LANGUAGE_LABELS[code]),
        status: isLegacyDefault ? "legacy_default" : "confirmed",
        note: isLegacyDefault ? "в базе старый дефолт ru, реальный язык не подтверждён" : null,
      };
    }
  }

  return {
    code: null,
    label: getLanguageLabel(null),
    raw: null,
    source: null,
    isKnown: false,
    status: "missing",
    note: "язык не записан в профиле",
  };
}

export function formatProfileLanguage(language: Pick<ProfileLanguage, "code" | "label"> & { status?: ProfileLanguage["status"] }): string {
  if (!language.code) return language.label;
  return `${language.label} · ${language.code}`;
}

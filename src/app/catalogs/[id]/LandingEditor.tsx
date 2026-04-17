"use client";
import { useState, useEffect } from "react";
import {
  isLandingTableMissingError,
  LANDING_TABLE_MISSING_WARNING,
} from "@/lib/landingErrors";

const TRANSLATION_LANGUAGES = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "pt-BR", label: "Português" },
  { code: "uk", label: "Українська" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types (camelCase inside JSONB — matches Swift Codable without custom keys)
// ─────────────────────────────────────────────────────────────────────────────
interface BulletItem { id: string; emoji?: string; title?: string; text: string; }
interface BulletSection { title: string; subtitle?: string; items: BulletItem[]; }
interface TransformationPair { id: string; beforeText: string; afterText: string; }
interface TransformationSection { title: string; subtitle?: string; beforeLabel?: string; afterLabel?: string; pairs: TransformationPair[]; }
interface BenefitCard { id: string; eyebrow?: string; title: string; text: string; }
interface BenefitsSection { title: string; subtitle?: string; cards: BenefitCard[]; }
interface FAQItem { id: string; question: string; answer: string; }
interface PurchaseFeature { id: string; icon?: string; title: string; subtitle?: string; }
interface PurchaseCTA { title: string; subtitle?: string; priceBadge?: string; features: PurchaseFeature[]; buttonTitle?: string; }

interface LandingData {
  id?: string;
  cuisine_id: string;
  preview_card: {
    title: string; subtitle?: string; badges: string[];
    imageUrl?: string; backgroundHex?: string; overlayHex?: string; accentHex?: string;
  };
  hero: {
    title: string; subtitle?: string; badges: string[];
    imageUrl?: string; backgroundHex?: string; overlayHex?: string;
  };
  inside_section?: BulletSection | null;
  recipe_showcase?: { title: string; subtitle?: string } | null;
  audience_section?: BulletSection | null;
  transformation_section?: TransformationSection | null;
  benefits_section?: BenefitsSection | null;
  faq_items: FAQItem[];
  purchase_cta?: PurchaseCTA | null;
  theme: {
    pageBackgroundHex?: string; heroBackgroundHex?: string; heroOverlayHex?: string;
    cardBackgroundHex?: string; accentHex?: string; secondaryAccentHex?: string; textOnDarkHex?: string;
  };
  recipe_preview_ids: string[];
  is_published: boolean;
  sort_order: number;
}

interface LocalLandingDraft {
  data: LandingData;
  translations: Record<string, unknown>;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();

function defaultLanding(cuisineId: string, name: string, description?: string | null): LandingData {
  return {
    cuisine_id: cuisineId,
    preview_card: {
      title: name,
      subtitle: description ?? "",
      badges: ["Пошагово", "Разовая покупка"],
      backgroundHex: "C70A0A",
      overlayHex: "7F3A44",
      accentHex: "FF375F",
    },
    hero: {
      title: name,
      subtitle: description ?? "",
      badges: ["20–30 минут", "Пошагово"],
      backgroundHex: "C70A0A",
      overlayHex: "7F3A44",
    },
    inside_section: {
      title: "Что внутри",
      subtitle: "Всё, чтобы открыть каталог как отдельный продукт",
      items: [
        { id: uid(), emoji: "🍜", text: "Подборка рецептов по единой теме" },
        { id: uid(), emoji: "🧾", text: "Понятные пошаговые инструкции" },
        { id: uid(), emoji: "🛒", text: "Обычные ингредиенты без экзотики" },
      ],
    },
    recipe_showcase: { title: "Примеры рецептов", subtitle: "Фото, сложность, время" },
    audience_section: null,
    transformation_section: null,
    benefits_section: null,
    faq_items: [
      { id: uid(), question: "Что входит в каталог?", answer: "Подборка рецептов с пошаговыми инструкциями." },
      { id: uid(), question: "Доступ навсегда?", answer: "Да, разовая покупка даёт постоянный доступ." },
    ],
    purchase_cta: {
      title: "Открыть каталог",
      subtitle: "Разовая покупка с постоянным доступом",
      priceBadge: "$2",
      features: [
        { id: uid(), icon: "book.closed", title: "Рецепты", subtitle: "внутри каталога" },
        { id: uid(), icon: "list.bullet.rectangle", title: "Пошаговые инструкции", subtitle: "без лишней теории" },
      ],
      buttonTitle: "Открыть каталог",
    },
    theme: {
      pageBackgroundHex: "0E0E11",
      heroBackgroundHex: "C70A0A",
      heroOverlayHex: "7F3A44",
      cardBackgroundHex: "F2F2F7",
      accentHex: "FF375F",
      secondaryAccentHex: "F4D000",
      textOnDarkHex: "FFFFFF",
    },
    recipe_preview_ids: [],
    is_published: false,
    sort_order: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI helpers
// ─────────────────────────────────────────────────────────────────────────────
function SectionBlock({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", marginBottom: "10px", overflow: "hidden" }}>
      <summary style={{ padding: "12px 16px", cursor: "pointer", fontWeight: 600, fontSize: "14px", color: "var(--text-primary)", userSelect: "none", listStyle: "none" }}>
        {title}
      </summary>
      <div style={{ padding: "0 16px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--spacing-md)" }}>
        {children}
      </div>
    </details>
  );
}

function Field({ label, hint, span, counter, children }: { label: string; hint?: string; span?: boolean; counter?: { current: number; max: number }; children: React.ReactNode }) {
  return (
    <div className="form-group" style={span ? { gridColumn: "1 / -1" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
        <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
        {counter && (
          <span style={{ fontSize: "11px", color: counter.current > counter.max ? "var(--accent-danger)" : "var(--text-secondary)", fontFamily: "monospace" }}>
            {counter.current}/{counter.max}
          </span>
        )}
      </div>
      {hint && <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "6px", marginTop: 0 }}>{hint}</p>}
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  const hex = (value ?? "").replace("#", "");
  const colorVal = hex.length === 6 ? `#${hex}` : "#000000";
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          type="color"
          value={colorVal}
          onChange={(e) => onChange(e.target.value.replace("#", ""))}
          style={{ width: "38px", height: "36px", border: "1px solid var(--border-light)", borderRadius: "6px", cursor: "pointer", padding: "2px", background: "none" }}
        />
        <input
          className="input"
          placeholder="RRGGBB"
          value={hex}
          onChange={(e) => onChange(e.target.value.replace("#", ""))}
          style={{ fontFamily: "monospace", maxWidth: "110px" }}
        />
      </div>
    </div>
  );
}

function BadgesField({ label = "Значки", value, onChange }: { label?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [newBadge, setNewBadge] = useState("");
  const add = () => { if (newBadge.trim()) { onChange([...value, newBadge.trim()]); setNewBadge(""); } };
  return (
    <div className="form-group" style={{ gridColumn: "1 / -1" }}>
      <label className="form-label">{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px", minHeight: "28px" }}>
        {value.map((badge, i) => (
          <span key={i} style={{ background: "var(--bg-hover)", padding: "4px 10px", borderRadius: "20px", fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
            {badge}
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-danger)", fontSize: "15px", lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <input
        className="input"
        placeholder="Новый значок — Enter для добавления"
        value={newBadge}
        onChange={(e) => setNewBadge(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { add(); e.preventDefault(); } }}
      />
    </div>
  );
}

function OptionalSection({ label, enabled, onToggle, children }: { label: string; enabled: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "12px", borderBottom: `1px solid ${enabled ? "var(--border-light)" : "transparent"}`, marginBottom: enabled ? "4px" : 0 }}>
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-secondary)" }}>{label}</span>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          style={{
            padding: "4px 12px", borderRadius: "6px", border: "1px solid", cursor: "pointer", fontSize: "12px", fontWeight: 700,
            background: enabled ? "rgba(52,199,89,0.1)" : "var(--bg-hover)",
            color: enabled ? "#34c759" : "var(--text-secondary)",
            borderColor: enabled ? "rgba(52,199,89,0.4)" : "var(--border-light)",
          }}
        >
          {enabled ? "Включено" : "Выключено"}
        </button>
      </div>
      {enabled && children}
    </>
  );
}

function BulletItemsList({ items, onChange }: { items: BulletItem[]; onChange: (v: BulletItem[]) => void }) {
  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <label className="form-label">Пункты</label>
      {items.map((item, i) => (
        <div key={item.id} style={{ display: "grid", gridTemplateColumns: "52px 1fr 2fr auto", gap: "6px", marginBottom: "6px", alignItems: "start" }}>
          <input className="input" placeholder="😊" value={item.emoji ?? ""} onChange={(e) => { const next = [...items]; next[i] = { ...item, emoji: e.target.value }; onChange(next); }} style={{ fontSize: "18px", textAlign: "center" }} />
          <input className="input" placeholder="Заголовок" value={item.title ?? ""} onChange={(e) => { const next = [...items]; next[i] = { ...item, title: e.target.value }; onChange(next); }} />
          <input className="input" placeholder="Текст *" value={item.text} onChange={(e) => { const next = [...items]; next[i] = { ...item, text: e.target.value }; onChange(next); }} />
          <button className="btn btn-secondary" onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ color: "var(--accent-danger)", minWidth: "36px" }}>×</button>
        </div>
      ))}
      <button className="btn btn-secondary" type="button" onClick={() => onChange([...items, { id: uid(), emoji: "", title: "", text: "" }])} style={{ marginTop: "4px", fontSize: "13px" }}>+ Добавить пункт</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  cuisineId: string;
  cuisineName: string;
  cuisineDescription?: string | null;
  cuisinePrice?: string | null;
}

export default function LandingEditor({ cuisineId, cuisineName, cuisineDescription, cuisinePrice }: Props) {
  const [data, setData] = useState<LandingData | null>(null);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiUserPrompt, setAiUserPrompt] = useState("");
  const [activeLang, setActiveLang] = useState("ru");
  const [translations, setTranslations] = useState<Record<string, unknown>>({});
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => { loadLanding(); }, [cuisineId]);

  const localDraftKey = `catalog-landing-draft:${cuisineId}`;

  const applyLanding = (nextData: LandingData, nextTranslations: Record<string, unknown> = {}) => {
    // Keep badges in sync: preview_card is the source of truth for the shared badge field
    const synced: LandingData = {
      ...nextData,
      hero: { ...nextData.hero, badges: nextData.preview_card.badges },
    };
    setData(synced);
    setJsonText(JSON.stringify(synced, null, 2));
    setTranslations(nextTranslations);
  };

  const createDraftData = () => defaultLanding(cuisineId, cuisineName, cuisineDescription);

  const readLocalDraft = (): LocalLandingDraft | null => {
    try {
      const raw = localStorage.getItem(localDraftKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LocalLandingDraft;
      if (!parsed?.data) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const writeLocalDraft = (nextData: LandingData, nextTranslations: Record<string, unknown>) => {
    try {
      const payload: LocalLandingDraft = {
        data: nextData,
        translations: nextTranslations,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(localDraftKey, JSON.stringify(payload));
    } catch {
      // ignore localStorage errors
    }
  };

  const clearLocalDraft = () => {
    try {
      localStorage.removeItem(localDraftKey);
    } catch {
      // ignore localStorage errors
    }
  };

  const isTableMissingResponse = (result: any) => {
    if (result?.warning === LANDING_TABLE_MISSING_WARNING) return true;
    return isLandingTableMissingError({ message: result?.error, code: result?.code });
  };

  async function loadLanding() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/landings/${cuisineId}`);
      const result = await res.json().catch(() => ({}));

      const tableMissing = isTableMissingResponse(result);
      const rawLoaded = (result?.data ?? null) as Record<string, unknown> | null;

      if (rawLoaded) {
        // Extract translations from DB row and keep them separate from landing data
        const loadedTranslations = (
          rawLoaded.translations &&
          typeof rawLoaded.translations === "object" &&
          !Array.isArray(rawLoaded.translations)
        ) ? rawLoaded.translations as Record<string, unknown> : {};
        // Strip the translations column from the LandingData object
        const { translations: _t, ...cleanLoaded } = rawLoaded;
        const loaded = cleanLoaded as unknown as LandingData;

        // Migration: sync imageUrl between preview_card and hero (they should always match)
        const pc = loaded.preview_card as Record<string, unknown>;
        const hero = loaded.hero as Record<string, unknown>;
        const pcImg = pc?.imageUrl as string | null | undefined;
        const heroImg = hero?.imageUrl as string | null | undefined;
        if (pcImg && !heroImg) {
          (loaded.hero as Record<string, unknown>).imageUrl = pcImg;
        } else if (heroImg && !pcImg) {
          (loaded.preview_card as Record<string, unknown>).imageUrl = heroImg;
        }

        applyLanding(loaded, loadedTranslations);
        writeLocalDraft(loaded, loadedTranslations);
        setSaveStatus("");
        return;
      }

      if (tableMissing) {
        const localDraft = readLocalDraft();
        if (localDraft) {
          applyLanding(localDraft.data, localDraft.translations ?? {});
          setSaveStatus("⚠️ Таблица catalog_landings не найдена. Загружен локальный черновик браузера.");
          return;
        }

        const draft = createDraftData();
        applyLanding(draft, {});
        setSaveStatus("⚠️ Таблица catalog_landings не найдена. Создан локальный черновик.");
        return;
      }

      if (!res.ok) {
        setData(null);
        setJsonText("");
        setTranslations({});
        setSaveStatus(`Ошибка загрузки: ${result?.error ?? "не удалось загрузить лендинг"}`);
        return;
      }

      const draft = createDraftData();
      applyLanding(draft, {});
      setSaveStatus("Лендинг в БД не найден. Создан новый черновик.");
    } catch {
      const localDraft = readLocalDraft();
      if (localDraft) {
        applyLanding(localDraft.data, localDraft.translations ?? {});
        setSaveStatus("⚠️ Ошибка сети. Загружен локальный черновик браузера.");
      } else {
        setData(null);
        setJsonText("");
        setTranslations({});
        setSaveStatus("Ошибка загрузки лендинга");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function createDraft() {
    const draft = createDraftData();
    applyLanding(draft, {});
    writeLocalDraft(draft, {});
    setSaveStatus("Черновик создан");
  }

  async function generateWithAi() {
    setIsAiLoading(true);
    setSaveStatus("AI генерирует лендинг + переводит на 8 языков...");
    try {
      const res = await fetch("/api/admin/ai/landing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuisineName,
          cuisineDescription,
          price: cuisinePrice || "$2",
          language: "ru",
          userPrompt: aiUserPrompt,
          existingJson: data ? JSON.stringify(data) : "",
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSaveStatus(`AI ошибка: ${result.error}`);
        return;
      }
      const generated = { ...result.data, cuisine_id: cuisineId };
      setData(generated);
      setJsonText(JSON.stringify(generated, null, 2));
      if (result.translations && Object.keys(result.translations).length > 0) {
        setTranslations(result.translations);
      }
      setShowAiPrompt(false);
      setAiUserPrompt("");
      const langCount = result.translations ? Object.keys(result.translations).length : 1;
      setSaveStatus(`AI заполнил лендинг на ${langCount} языках ✨ — проверь и сохрани`);
    } catch {
      setSaveStatus("Ошибка соединения с AI");
    } finally {
      setIsAiLoading(false);
    }
  }

  async function translateAll() {
    setIsTranslating(true);
    setSaveStatus("Перевожу на 7 языков через DeepL...");
    try {
      // First save current state so DB has latest content
      const saveResult = await saveLanding();
      if (saveResult !== "saved") {
        if (saveResult === "local") {
          setSaveStatus("Перевод через DeepL недоступен: лендинг сохранён только локально (таблица catalog_landings не найдена).");
        }
        return;
      }
      const res = await fetch(`/api/admin/landings/${cuisineId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_language: activeLang }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveStatus(`Ошибка перевода: ${result.error}`);
        return;
      }
      if (isTableMissingResponse(result)) {
        setSaveStatus("Перевод через DeepL недоступен: таблица catalog_landings не найдена в текущей БД.");
        return;
      }
      // Reload to get updated translations
      await loadLanding();
      setSaveStatus(`Переведено на ${result.languages_translated?.length ?? 7} языков ✅`);
    } catch {
      setSaveStatus("Ошибка соединения при переводе");
    } finally {
      setIsTranslating(false);
    }
  }

  function buildCopyPrompt(): string {
    const priceHint = cuisinePrice || "$2";
    return `Ты создаёшь JSON для лендинга платного кулинарного каталога в мобильном приложении (iOS, 8 языков).

КАТАЛОГ: ${cuisineName}${cuisineDescription ? `\nОПИСАНИЕ: ${cuisineDescription}` : ""}
ЦЕНА: ${priceHint}

ЗАДАЧА: Верни ОДИН валидный JSON со всеми секциями лендинга НА РУССКОМ языке + поле "translations" с переводами на 7 языков.

ПРАВИЛА:
- Верни ТОЛЬКО валидный JSON без markdown-обёртки и без комментариев
- UUID v4 для всех "id" (формат: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
- HEX без # (FF375F, не #FF375F)
- Цвета подбери под тему каталога: тёмный насыщенный фон, яркий акцент
- "imageUrl" всегда null, "recipe_preview_ids" всегда [], "is_published" false, "sort_order" 0
- Тексты живые, дружелюбные, продающие — не канцелярит

СТРУКТУРА (строго соблюдай):
{
  "preview_card": { "title": "до 40 символов", "subtitle": "1-2 предложения", "badges": ["значок1","значок2","значок3"], "imageUrl": null, "backgroundHex": "HEX", "overlayHex": "HEX", "accentHex": "HEX" },
  "hero": { "title": "заголовок (\\n для переноса)", "subtitle": "1-2 предложения", "badges": ["значок1","значок2","значок3"], "imageUrl": null, "backgroundHex": "HEX", "overlayHex": "HEX" },
  "inside_section": { "title": "Что внутри", "subtitle": "...", "items": [{"emoji":"🍜","title":null,"text":"..."},{"emoji":"🧾","title":null,"text":"..."},{"emoji":"🛒","title":null,"text":"..."}] },
  "recipe_showcase": { "title": "...", "subtitle": "..." },
  "audience_section": { "title": "Кому подойдёт", "subtitle": "...", "items": [{"emoji":"✨","title":null,"text":"..."},{"emoji":"⏱","title":null,"text":"..."},{"emoji":"👨‍👩‍👧","title":null,"text":"..."}] },
  "transformation_section": { "title": "Узнаёшь себя?", "subtitle": null, "beforeLabel": "До", "afterLabel": "После", "pairs": [{"id":"uuid","beforeText":"проблема","afterText":"решение"},{"id":"uuid","beforeText":"проблема","afterText":"решение"},{"id":"uuid","beforeText":"проблема","afterText":"решение"}] },
  "benefits_section": { "title": "Преимущества", "subtitle": "...", "cards": [{"id":"uuid","eyebrow":"метка","title":"заголовок","text":"описание"},{"id":"uuid","eyebrow":"метка","title":"заголовок","text":"описание"},{"id":"uuid","eyebrow":"метка","title":"заголовок","text":"описание"}] },
  "faq_items": [{"id":"uuid","question":"вопрос?","answer":"ответ"},{"id":"uuid","question":"вопрос?","answer":"ответ"},{"id":"uuid","question":"вопрос?","answer":"ответ"},{"id":"uuid","question":"вопрос?","answer":"ответ"}],
  "purchase_cta": { "title": "Открыть каталог", "subtitle": "...", "priceBadge": "${priceHint}", "features": [{"id":"uuid","icon":"book.closed","title":"N рецептов","subtitle":"внутри каталога"},{"id":"uuid","icon":"list.bullet.rectangle","title":"Пошаговые инструкции","subtitle":"без лишней теории"},{"id":"uuid","icon":"arrow.clockwise","title":"Обновления","subtitle":"бесплатно навсегда"}], "buttonTitle": "Открыть каталог" },
  "theme": { "pageBackgroundHex": "0E0E11", "heroBackgroundHex": "HEX", "heroOverlayHex": "HEX", "cardBackgroundHex": "F2F2F7", "accentHex": "HEX", "secondaryAccentHex": "F4D000", "textOnDarkHex": "FFFFFF" },
  "recipe_preview_ids": [],
  "is_published": false,
  "sort_order": 0,
  "translations": {
    "ru": {
      "preview_card": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "hero": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "inside_section": {"title":"Что внутри","subtitle":"...","items":[{"emoji":"🍜","title":null,"text":"..."},{"emoji":"🧾","title":null,"text":"..."},{"emoji":"🛒","title":null,"text":"..."}]},
      "recipe_showcase": {"title":"...","subtitle":"..."},
      "audience_section": {"title":"Кому подойдёт","subtitle":"...","items":[{"emoji":"✨","title":null,"text":"..."},{"emoji":"⏱","title":null,"text":"..."},{"emoji":"👨‍👩‍👧","title":null,"text":"..."}]},
      "transformation_section": {"title":"Узнаёшь себя?","subtitle":null,"beforeLabel":"До","afterLabel":"После","pairs":[{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."}]},
      "benefits_section": {"title":"Преимущества","subtitle":"...","cards":[{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."}]},
      "faq_items": [{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}],
      "purchase_cta": {"title":"Открыть каталог","subtitle":"...","features":[{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."}],"buttonTitle":"Открыть каталог"}
    },
    "en": {
      "preview_card": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "hero": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "inside_section": {"title":"What's inside","subtitle":"...","items":[{"emoji":"🍜","title":null,"text":"..."},{"emoji":"🧾","title":null,"text":"..."},{"emoji":"🛒","title":null,"text":"..."}]},
      "recipe_showcase": {"title":"...","subtitle":"..."},
      "audience_section": {"title":"Who is it for","subtitle":"...","items":[{"emoji":"✨","title":null,"text":"..."},{"emoji":"⏱","title":null,"text":"..."},{"emoji":"👨‍👩‍👧","title":null,"text":"..."}]},
      "transformation_section": {"title":"Sound familiar?","subtitle":null,"beforeLabel":"Before","afterLabel":"After","pairs":[{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."}]},
      "benefits_section": {"title":"Benefits","subtitle":"...","cards":[{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."}]},
      "faq_items": [{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}],
      "purchase_cta": {"title":"Open catalog","subtitle":"...","features":[{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."}],"buttonTitle":"Open catalog"}
    },
    "de": {
      "preview_card": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "hero": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "inside_section": {"title":"Was ist drin","subtitle":"...","items":[{"emoji":"🍜","title":null,"text":"..."},{"emoji":"🧾","title":null,"text":"..."},{"emoji":"🛒","title":null,"text":"..."}]},
      "recipe_showcase": {"title":"...","subtitle":"..."},
      "audience_section": {"title":"Für wen ist es","subtitle":"...","items":[{"emoji":"✨","title":null,"text":"..."},{"emoji":"⏱","title":null,"text":"..."},{"emoji":"👨‍👩‍👧","title":null,"text":"..."}]},
      "transformation_section": {"title":"Klingt bekannt?","subtitle":null,"beforeLabel":"Vorher","afterLabel":"Nachher","pairs":[{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."}]},
      "benefits_section": {"title":"Vorteile","subtitle":"...","cards":[{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."}]},
      "faq_items": [{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}],
      "purchase_cta": {"title":"Katalog öffnen","subtitle":"...","features":[{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."}],"buttonTitle":"Katalog öffnen"}
    },
    "fr": {
      "preview_card": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "hero": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "inside_section": {"title":"Ce qu'il y a dedans","subtitle":"...","items":[{"emoji":"🍜","title":null,"text":"..."},{"emoji":"🧾","title":null,"text":"..."},{"emoji":"🛒","title":null,"text":"..."}]},
      "recipe_showcase": {"title":"...","subtitle":"..."},
      "audience_section": {"title":"Pour qui","subtitle":"...","items":[{"emoji":"✨","title":null,"text":"..."},{"emoji":"⏱","title":null,"text":"..."},{"emoji":"👨‍👩‍👧","title":null,"text":"..."}]},
      "transformation_section": {"title":"Ça vous parle ?","subtitle":null,"beforeLabel":"Avant","afterLabel":"Après","pairs":[{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."}]},
      "benefits_section": {"title":"Avantages","subtitle":"...","cards":[{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."}]},
      "faq_items": [{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}],
      "purchase_cta": {"title":"Ouvrir le catalogue","subtitle":"...","features":[{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."}],"buttonTitle":"Ouvrir le catalogue"}
    },
    "it": {
      "preview_card": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "hero": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "inside_section": {"title":"Cosa c'è dentro","subtitle":"...","items":[{"emoji":"🍜","title":null,"text":"..."},{"emoji":"🧾","title":null,"text":"..."},{"emoji":"🛒","title":null,"text":"..."}]},
      "recipe_showcase": {"title":"...","subtitle":"..."},
      "audience_section": {"title":"Per chi è","subtitle":"...","items":[{"emoji":"✨","title":null,"text":"..."},{"emoji":"⏱","title":null,"text":"..."},{"emoji":"👨‍👩‍👧","title":null,"text":"..."}]},
      "transformation_section": {"title":"Ti riconosci?","subtitle":null,"beforeLabel":"Prima","afterLabel":"Dopo","pairs":[{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."}]},
      "benefits_section": {"title":"Vantaggi","subtitle":"...","cards":[{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."}]},
      "faq_items": [{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}],
      "purchase_cta": {"title":"Apri il catalogo","subtitle":"...","features":[{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."}],"buttonTitle":"Apri il catalogo"}
    },
    "es": {
      "preview_card": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "hero": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "inside_section": {"title":"Qué hay dentro","subtitle":"...","items":[{"emoji":"🍜","title":null,"text":"..."},{"emoji":"🧾","title":null,"text":"..."},{"emoji":"🛒","title":null,"text":"..."}]},
      "recipe_showcase": {"title":"...","subtitle":"..."},
      "audience_section": {"title":"¿Para quién?","subtitle":"...","items":[{"emoji":"✨","title":null,"text":"..."},{"emoji":"⏱","title":null,"text":"..."},{"emoji":"👨‍👩‍👧","title":null,"text":"..."}]},
      "transformation_section": {"title":"¿Te suena familiar?","subtitle":null,"beforeLabel":"Antes","afterLabel":"Después","pairs":[{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."}]},
      "benefits_section": {"title":"Ventajas","subtitle":"...","cards":[{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."}]},
      "faq_items": [{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}],
      "purchase_cta": {"title":"Abrir catálogo","subtitle":"...","features":[{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."}],"buttonTitle":"Abrir catálogo"}
    },
    "pt-BR": {
      "preview_card": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "hero": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "inside_section": {"title":"O que tem dentro","subtitle":"...","items":[{"emoji":"🍜","title":null,"text":"..."},{"emoji":"🧾","title":null,"text":"..."},{"emoji":"🛒","title":null,"text":"..."}]},
      "recipe_showcase": {"title":"...","subtitle":"..."},
      "audience_section": {"title":"Para quem é","subtitle":"...","items":[{"emoji":"✨","title":null,"text":"..."},{"emoji":"⏱","title":null,"text":"..."},{"emoji":"👨‍👩‍👧","title":null,"text":"..."}]},
      "transformation_section": {"title":"Parece familiar?","subtitle":null,"beforeLabel":"Antes","afterLabel":"Depois","pairs":[{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."}]},
      "benefits_section": {"title":"Benefícios","subtitle":"...","cards":[{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."}]},
      "faq_items": [{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}],
      "purchase_cta": {"title":"Abrir catálogo","subtitle":"...","features":[{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."}],"buttonTitle":"Abrir catálogo"}
    },
    "uk": {
      "preview_card": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "hero": {"title":"...","subtitle":"...","badges":["...","...","..."]},
      "inside_section": {"title":"Що всередині","subtitle":"...","items":[{"emoji":"🍜","title":null,"text":"..."},{"emoji":"🧾","title":null,"text":"..."},{"emoji":"🛒","title":null,"text":"..."}]},
      "recipe_showcase": {"title":"...","subtitle":"..."},
      "audience_section": {"title":"Кому підійде","subtitle":"...","items":[{"emoji":"✨","title":null,"text":"..."},{"emoji":"⏱","title":null,"text":"..."},{"emoji":"👨‍👩‍👧","title":null,"text":"..."}]},
      "transformation_section": {"title":"Впізнаєш себе?","subtitle":null,"beforeLabel":"До","afterLabel":"Після","pairs":[{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."},{"beforeText":"...","afterText":"..."}]},
      "benefits_section": {"title":"Переваги","subtitle":"...","cards":[{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."},{"eyebrow":"...","title":"...","text":"..."}]},
      "faq_items": [{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}],
      "purchase_cta": {"title":"Відкрити каталог","subtitle":"...","features":[{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."},{"title":"...","subtitle":"..."}],"buttonTitle":"Відкрити каталог"}
    }
  }
}

ВАЖНО: Все "..." замени реальным контентом на соответствующем языке. Верни ТОЛЬКО JSON без markdown-обёртки.`;
  }

  function copyPrompt() {
    const prompt = buildCopyPrompt();
    navigator.clipboard.writeText(prompt).then(() => {
      setSaveStatus("Промпт скопирован ✅ — вставь в AI-чат");
      setTimeout(() => setSaveStatus(""), 4000);
    });
  }

  function switchToJson() {
    if (data) {
      const full = Object.keys(translations).length > 0
        ? { ...data, translations }
        : data;
      setJsonText(JSON.stringify(full, null, 2));
    }
    setJsonError("");
    setMode("json");
  }

  function extractTranslationsFromJson(parsed: Record<string, unknown>): { landingData: Record<string, unknown>; extractedTranslations: Record<string, unknown> } {
    const { translations: t, ...rest } = parsed;
    const extractedTranslations = (t && typeof t === "object" && !Array.isArray(t)) ? t as Record<string, unknown> : {};
    return { landingData: rest, extractedTranslations };
  }

  function switchToForm() {
    try {
      const parsed = JSON.parse(jsonText);
      const { landingData, extractedTranslations } = extractTranslationsFromJson(parsed);
      setData(landingData as unknown as LandingData);
      if (Object.keys(extractedTranslations).length > 0) {
        setTranslations(extractedTranslations);
        const langCount = Object.keys(extractedTranslations).length;
        setSaveStatus(`Найдены переводы на ${langCount} языков — нажми «Сохранить» чтобы записать в БД`);
      }
      setJsonError("");
      setMode("form");
    } catch (e) {
      setJsonError("Невалидный JSON — исправь ошибки перед переключением");
    }
  }

  async function saveLanding(): Promise<"saved" | "local" | "error"> {
    let payload = data;
    // effectiveTranslations: either freshly extracted from JSON or current state
    // Must be a local variable because setTranslations() is async and won't update
    // the `translations` closure value until next render
    let effectiveTranslations = translations;

    if (mode === "json") {
      try {
        const parsed = JSON.parse(jsonText);
        const { landingData, extractedTranslations } = extractTranslationsFromJson(parsed);
        payload = landingData as unknown as LandingData;
        setData(payload);
        if (Object.keys(extractedTranslations).length > 0) {
          setTranslations(extractedTranslations);
          effectiveTranslations = extractedTranslations; // use immediately, don't wait for state update
        }
        setJsonError("");
      } catch {
        setJsonError("Невалидный JSON — исправь ошибки перед сохранением");
        return "error";
      }
    }
    if (!payload) return "error";

    setSaveStatus("Сохраняю...");
    try {
      const savePayload = Object.keys(effectiveTranslations).length > 0
        ? { ...payload, translations: effectiveTranslations }
        : payload;
      const res = await fetch(`/api/admin/landings/${cuisineId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savePayload),
      });
      const result = await res.json().catch(() => ({}));

      if (isTableMissingResponse(result)) {
        applyLanding(payload, effectiveTranslations);
        writeLocalDraft(payload, effectiveTranslations);
        setSaveStatus(`Сохранено локально ⚠️ (${new Date().toLocaleTimeString()}) — таблица catalog_landings не найдена в БД`);
        return "local";
      }

      if (!res.ok) {
        setSaveStatus(`Ошибка: ${result.error ?? "не удалось сохранить"}`);
        return "error";
      }

      if (result.data) {
        const savedRaw = result.data as Record<string, unknown>;
        const savedTranslations = (
          savedRaw.translations &&
          typeof savedRaw.translations === "object" &&
          !Array.isArray(savedRaw.translations)
        ) ? savedRaw.translations as Record<string, unknown> : effectiveTranslations;
        const { translations: _t, ...cleanSaved } = savedRaw;
        const saved = cleanSaved as unknown as LandingData;
        applyLanding(saved, savedTranslations);
        writeLocalDraft(saved, savedTranslations);
      } else {
        applyLanding(payload, effectiveTranslations);
        writeLocalDraft(payload, effectiveTranslations);
      }

      if ((result.data as LandingData | undefined)?.is_published === false || payload.is_published === false) {
        setSaveStatus(`Готово ✅ (${new Date().toLocaleTimeString()}) — лендинг не опубликован и не показывается в приложении`);
      } else {
        setSaveStatus(`Готово ✅ (${new Date().toLocaleTimeString()})`);
      }
      return "saved";
    } catch {
      applyLanding(payload!, effectiveTranslations);
      writeLocalDraft(payload!, effectiveTranslations);
      setSaveStatus(`Сохранено локально ⚠️ (${new Date().toLocaleTimeString()}) — ошибка соединения`);
      return "local";
    }
  }

  async function deleteLanding() {
    if (!confirm("Удалить лендинг? Это действие необратимо.")) return;
    await fetch(`/api/admin/landings/${cuisineId}`, { method: "DELETE" }).catch(() => null);
    clearLocalDraft();
    setData(null);
    setJsonText("");
    setTranslations({});
    setSaveStatus("Удалено");
  }

  const upd = (patch: Partial<LandingData>) => setData((prev) => prev ? { ...prev, ...patch } : null);

  // ── Translation overlay ───────────────────────────────────────────────────
  // When a non-Russian language is active, merge its translation on top of base data for display.
  // Editing always operates on the base data (Russian); non-ru fields are readOnly.
  const langTx = (activeLang !== "ru" && data)
    ? (translations[activeLang] as Record<string, unknown> | undefined) ?? null
    : null;

  const viewData: LandingData = (() => {
    if (!langTx || !data) return data!;
    const d = data;
    return {
      ...d,
      preview_card: langTx.preview_card && typeof langTx.preview_card === "object"
        ? { ...d.preview_card, ...(langTx.preview_card as object) } : d.preview_card,
      hero: langTx.hero && typeof langTx.hero === "object"
        ? { ...d.hero, ...(langTx.hero as object) } : d.hero,
      inside_section: langTx.inside_section && typeof langTx.inside_section === "object" && d.inside_section
        ? { ...d.inside_section, ...(langTx.inside_section as object) } : d.inside_section,
      recipe_showcase: langTx.recipe_showcase && typeof langTx.recipe_showcase === "object" && d.recipe_showcase
        ? { ...d.recipe_showcase, ...(langTx.recipe_showcase as object) } : d.recipe_showcase,
      audience_section: langTx.audience_section && typeof langTx.audience_section === "object" && d.audience_section
        ? { ...d.audience_section, ...(langTx.audience_section as object) } : d.audience_section,
      transformation_section: langTx.transformation_section && typeof langTx.transformation_section === "object" && d.transformation_section
        ? { ...d.transformation_section, ...(langTx.transformation_section as object) } : d.transformation_section,
      benefits_section: langTx.benefits_section && typeof langTx.benefits_section === "object" && d.benefits_section
        ? { ...d.benefits_section, ...(langTx.benefits_section as object) } : d.benefits_section,
      faq_items: Array.isArray(langTx.faq_items) ? langTx.faq_items as FAQItem[] : d.faq_items,
      purchase_cta: langTx.purchase_cta && typeof langTx.purchase_cta === "object" && d.purchase_cta
        ? { ...d.purchase_cta, ...(langTx.purchase_cta as object) } : d.purchase_cta,
    };
  })();

  // isRO: form fields show translated content but are not editable
  const isRO = activeLang !== "ru";
  const roStyle = isRO ? { background: "var(--bg-hover)", opacity: 0.85 } : undefined;

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div style={{ padding: "32px", color: "var(--text-secondary)" }}>Загрузка лендинга...</div>;
  }

  if (!data) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "2px dashed var(--border-medium)" }}>
        <div style={{ fontSize: "52px", marginBottom: "16px" }}>📄</div>
        <p style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>Лендинг ещё не создан</p>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px" }}>Создай черновик — он заполнится данными каталога автоматически</p>
        <button className="btn-large btn-primary" onClick={createDraft}>Создать черновик</button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Language tabs ── */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600, marginRight: "4px" }}>Язык:</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", flex: 1 }}>
            {TRANSLATION_LANGUAGES.map(({ code, label }) => {
              const hasTranslation = code !== "ru" && !!translations[code];
              return (
                <button
                  key={code}
                  onClick={() => setActiveLang(code)}
                  style={{
                    padding: "5px 12px", border: "1px solid", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600,
                    background: activeLang === code ? "var(--accent-primary, #007aff)" : "var(--bg-surface)",
                    color: activeLang === code ? "#fff" : hasTranslation ? "var(--accent-primary, #007aff)" : "var(--text-secondary)",
                    borderColor: activeLang === code ? "var(--accent-primary, #007aff)" : hasTranslation ? "rgba(0,122,255,0.35)" : "var(--border-light)",
                  }}
                >
                  {label}{hasTranslation ? " ✓" : ""}
                </button>
              );
            })}
          </div>
          <button
            className="btn btn-secondary"
            onClick={translateAll}
            disabled={isTranslating}
            style={{ fontSize: "12px", whiteSpace: "nowrap", opacity: isTranslating ? 0.6 : 1 }}
            title="Автоматически перевести все секции через DeepL на 7 языков"
          >
            {isTranslating ? "Перевожу..." : "🌐 Перевести через DeepL"}
          </button>
        </div>
        {activeLang !== "ru" && (
          <div style={{ marginTop: "8px", padding: "8px 12px", background: "rgba(0,122,255,0.06)", borderRadius: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
            {translations[activeLang]
              ? `Показан перевод на ${TRANSLATION_LANGUAGES.find(l => l.code === activeLang)?.label}. Базовый контент редактируется на вкладке «Русский».`
              : `Перевод на ${TRANSLATION_LANGUAGES.find(l => l.code === activeLang)?.label} ещё не создан. Нажми «Перевести через DeepL».`}
          </div>
        )}
      </div>

      {/* ── AI Prompt panel ── */}
      {showAiPrompt && (
        <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "14px", padding: "16px", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>✨ AI заполнит лендинг на всех 8 языках</div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "10px", lineHeight: 1.5 }}>
            AI создаст контент на русском, затем DeepL автоматически переведёт на English, Deutsch, Français, Italiano, Español, Português и Українська.
          </p>
          <textarea
            className="input"
            rows={3}
            placeholder={`Например: акцент на быстрые блюда до 30 минут, аудитория — занятые люди 25–40 лет, цвета в тёмно-зелёном стиле`}
            value={aiUserPrompt}
            onChange={(e) => setAiUserPrompt(e.target.value)}
            style={{ fontFamily: "inherit", fontSize: "13px", marginBottom: "10px", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn btn-primary"
              onClick={generateWithAi}
              disabled={isAiLoading}
              style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", border: "none", opacity: isAiLoading ? 0.6 : 1 }}
            >
              {isAiLoading ? "Генерирую..." : "✨ Сгенерировать"}
            </button>
            <button className="btn btn-secondary" onClick={() => { setShowAiPrompt(false); setAiUserPrompt(""); }}>Отмена</button>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
        {/* Mode tabs */}
        <div style={{ display: "flex", background: "var(--bg-hover)", borderRadius: "8px", padding: "3px", gap: "2px" }}>
          {(["form", "json"] as const).map((m) => (
            <button
              key={m}
              onClick={() => m === "json" ? switchToJson() : switchToForm()}
              style={{
                padding: "6px 16px", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                background: mode === m ? "var(--bg-surface)" : "transparent",
                color: mode === m ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
              }}
            >
              {m === "form" ? "Форма" : "JSON"}
            </button>
          ))}
        </div>

        {/* Publish toggle */}
        <button
          onClick={() => upd({ is_published: !data.is_published })}
          style={{
            padding: "6px 14px", borderRadius: "8px", border: "1px solid", cursor: "pointer", fontSize: "13px", fontWeight: 700,
            background: data.is_published ? "rgba(52,199,89,0.12)" : "var(--bg-hover)",
            color: data.is_published ? "#34c759" : "var(--text-secondary)",
            borderColor: data.is_published ? "rgba(52,199,89,0.4)" : "var(--border-light)",
          }}
          title={data.is_published ? "Нажми чтобы скрыть из приложения" : "Нажми чтобы опубликовать в приложении"}
        >
          {data.is_published ? "● Опубликован" : "○ Черновик"}
        </button>

        {/* Copy prompt */}
        <button
          className="btn btn-secondary"
          onClick={copyPrompt}
          style={{ marginLeft: "auto", fontSize: "13px" }}
          title="Скопировать промпт для заполнения через внешний AI-чат"
        >
          📋 Скопировать промпт
        </button>

        {/* AI */}
        <button
          className="btn btn-secondary"
          onClick={() => setShowAiPrompt((v) => !v)}
          disabled={isAiLoading}
          style={{ background: showAiPrompt ? "rgba(99,102,241,0.12)" : undefined, color: "#6366f1", borderColor: "rgba(99,102,241,0.3)", fontWeight: 700 }}
        >
          ✨ AI заполнить
        </button>

        {/* Save */}
        <button className="btn btn-primary" onClick={saveLanding}>Сохранить</button>

        {/* Delete — separated visually */}
        <button
          className="btn btn-secondary"
          onClick={deleteLanding}
          style={{ color: "var(--accent-danger)", borderColor: "rgba(255,59,48,0.3)", marginLeft: "4px" }}
        >
          Удалить
        </button>
      </div>

      {/* ── Status bar ── */}
      {saveStatus && (
        <div style={{
          marginBottom: "12px", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 500,
          background: saveStatus.includes("⚠️") ? "rgba(255,159,10,0.1)" : saveStatus.includes("Ошибка") ? "rgba(255,59,48,0.1)" : "rgba(52,199,89,0.1)",
          color: saveStatus.includes("⚠️") ? "#ff9f0a" : saveStatus.includes("Ошибка") ? "var(--accent-danger)" : "var(--text-secondary)",
          border: "1px solid",
          borderColor: saveStatus.includes("⚠️") ? "rgba(255,159,10,0.25)" : saveStatus.includes("Ошибка") ? "rgba(255,59,48,0.25)" : "rgba(52,199,89,0.2)",
        }}>
          {saveStatus}
          {mode === "json" && !saveStatus.includes("⚠️") && saveStatus.includes("Готово") && Object.keys(translations).length < 2 && (
            <span style={{ marginLeft: "12px", color: "#ff9f0a" }}>— переводов нет, нажми 🌐 Перевести через DeepL</span>
          )}
        </div>
      )}

      {jsonError && (
        <div style={{ padding: "10px 14px", background: "rgba(255,59,48,0.1)", borderRadius: "8px", color: "var(--accent-danger)", fontSize: "13px", marginBottom: "12px" }}>
          {jsonError}
        </div>
      )}

      {/* ── JSON mode ── */}
      {mode === "json" && (
        <>
          <div style={{ padding: "8px 12px", background: "rgba(0,122,255,0.06)", border: "1px solid rgba(0,122,255,0.15)", borderRadius: "8px", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
            Вставь JSON с полем <code style={{ background: "rgba(0,0,0,0.1)", padding: "1px 5px", borderRadius: "4px" }}>translations</code> (из промпта) → <strong>Сохранить</strong> — переводы на все 8 языков подхватятся автоматически
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            style={{ width: "100%", minHeight: "600px", fontFamily: "monospace", fontSize: "12px", padding: "16px", background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", resize: "vertical", lineHeight: 1.5 }}
            spellCheck={false}
          />
        </>
      )}

      {/* ── Form mode ── */}
      {mode === "form" && (
        <div>
          {/* ── Заголовок и описание (синхронизируются в preview_card + hero) ── */}
          <SectionBlock title="📝 Заголовок и описание">
            <Field
              label={isRO ? "Заголовок (только просмотр)" : "Заголовок *"}
              hint={isRO ? undefined : "Используется и в карточке каталога (список), и в шапке лендинга"}
              counter={{ current: viewData.preview_card.title.length, max: 40 }}
            >
              <input
                className="input"
                style={roStyle}
                readOnly={isRO}
                value={viewData.preview_card.title}
                onChange={(e) => upd({
                  preview_card: { ...data.preview_card, title: e.target.value },
                  hero: { ...data.hero, title: e.target.value },
                })}
              />
            </Field>
            <Field label="Подзаголовок" hint={isRO ? undefined : "Краткое описание — что получит покупатель"} span>
              <textarea
                className="input"
                style={roStyle}
                readOnly={isRO}
                rows={2}
                value={viewData.preview_card.subtitle ?? ""}
                onChange={(e) => upd({
                  preview_card: { ...data.preview_card, subtitle: e.target.value },
                  hero: { ...data.hero, subtitle: e.target.value },
                })}
              />
            </Field>
            <Field label="URL изображения" hint={isRO ? undefined : "Обложка каталога (карточка + hero)"} span>
              <input
                className="input"
                style={roStyle}
                readOnly={isRO}
                placeholder="https://..."
                value={data.preview_card.imageUrl ?? ""}
                onChange={(e) => upd({
                  preview_card: { ...data.preview_card, imageUrl: e.target.value },
                  hero: { ...data.hero, imageUrl: e.target.value },
                })}
              />
              {data.preview_card.imageUrl && (
                <div style={{ marginTop: "8px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <img
                    src={data.preview_card.imageUrl}
                    alt="preview"
                    style={{ height: "80px", width: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--border-light)", flexShrink: 0 }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.display = ""; }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)", alignSelf: "center" }}>
                    Превью изображения (квадрат 80×80)
                  </span>
                </div>
              )}
            </Field>
          </SectionBlock>

          {/* ── Цвета оформления (единый блок для всех трёх структур) ── */}
          <SectionBlock title="🎨 Цвета оформления">
            <ColorField
              label="Основной фон (карточка + hero)"
              value={data.preview_card.backgroundHex}
              onChange={(v) => upd({
                preview_card: { ...data.preview_card, backgroundHex: v },
                hero: { ...data.hero, backgroundHex: v },
                theme: { ...data.theme, heroBackgroundHex: v },
              })}
            />
            <ColorField
              label="Оверлей (поверх фона)"
              value={data.preview_card.overlayHex}
              onChange={(v) => upd({
                preview_card: { ...data.preview_card, overlayHex: v },
                hero: { ...data.hero, overlayHex: v },
                theme: { ...data.theme, heroOverlayHex: v },
              })}
            />
            <ColorField
              label="Акцент (кнопки, значки)"
              value={data.preview_card.accentHex ?? data.theme.accentHex}
              onChange={(v) => upd({
                preview_card: { ...data.preview_card, accentHex: v },
                theme: { ...data.theme, accentHex: v },
              })}
            />
            <ColorField
              label="Доп. акцент (жёлтый/золотой)"
              value={data.theme.secondaryAccentHex}
              onChange={(v) => upd({ theme: { ...data.theme, secondaryAccentHex: v } })}
            />
            <ColorField
              label="Фон страницы (очень тёмный)"
              value={data.theme.pageBackgroundHex}
              onChange={(v) => upd({ theme: { ...data.theme, pageBackgroundHex: v } })}
            />
            <ColorField
              label="Фон карточек контента"
              value={data.theme.cardBackgroundHex}
              onChange={(v) => upd({ theme: { ...data.theme, cardBackgroundHex: v } })}
            />
          </SectionBlock>

          {/* ── Значки (синхронизированы в карточке и hero) ── */}
          <SectionBlock title="🏷️ Значки (карточка и лендинг)" open={false}>
            <BadgesField
              label="Значки — показываются и в карточке каталога, и в шапке лендинга"
              value={viewData.preview_card.badges}
              onChange={isRO ? () => {} : (v) => upd({
                preview_card: { ...data.preview_card, badges: v },
                hero: { ...data.hero, badges: v },
              })}
            />
          </SectionBlock>

          {/* ── Порядок ── */}
          <SectionBlock title="⚙️ Порядок отображения" open={false}>
            <Field label="Порядок (меньше = выше в списке)">
              <input className="input" type="number" value={data.sort_order} onChange={(e) => upd({ sort_order: parseInt(e.target.value) || 0 })} style={{ maxWidth: "120px" }} />
            </Field>
          </SectionBlock>

          {/* ── Секция «Что внутри» ── */}
          <SectionBlock title="📦 Секция «Что внутри»" open={!!data.inside_section}>
            <OptionalSection label="Секция" enabled={!!data.inside_section} onToggle={isRO ? () => {} : (v) => upd({ inside_section: v ? { title: "Что внутри", subtitle: "", items: [] } : null })}>
              {data.inside_section && <>
                <Field label="Заголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.inside_section?.title ?? ""} onChange={(e) => upd({ inside_section: { ...data.inside_section!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.inside_section?.subtitle ?? ""} onChange={(e) => upd({ inside_section: { ...data.inside_section!, subtitle: e.target.value } })} />
                </Field>
                <BulletItemsList items={viewData.inside_section?.items ?? []} onChange={isRO ? () => {} : (items) => upd({ inside_section: { ...data.inside_section!, items } })} />
              </>}
            </OptionalSection>
          </SectionBlock>

          {/* ── Витрина рецептов ── */}
          <SectionBlock title="🍽️ Витрина рецептов" open={!!data.recipe_showcase}>
            <OptionalSection label="Секция" enabled={!!data.recipe_showcase} onToggle={isRO ? () => {} : (v) => upd({ recipe_showcase: v ? { title: "Примеры рецептов", subtitle: "" } : null })}>
              {data.recipe_showcase && <>
                <Field label="Заголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.recipe_showcase?.title ?? ""} onChange={(e) => upd({ recipe_showcase: { ...data.recipe_showcase!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.recipe_showcase?.subtitle ?? ""} onChange={(e) => upd({ recipe_showcase: { ...data.recipe_showcase!, subtitle: e.target.value } })} />
                </Field>
              </>}
            </OptionalSection>
          </SectionBlock>

          {/* ── Аудитория ── */}
          <SectionBlock title="👥 Секция «Кому подойдёт»" open={!!data.audience_section}>
            <OptionalSection label="Секция" enabled={!!data.audience_section} onToggle={isRO ? () => {} : (v) => upd({ audience_section: v ? { title: "Кому подойдёт", subtitle: "", items: [] } : null })}>
              {data.audience_section && <>
                <Field label="Заголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.audience_section?.title ?? ""} onChange={(e) => upd({ audience_section: { ...data.audience_section!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.audience_section?.subtitle ?? ""} onChange={(e) => upd({ audience_section: { ...data.audience_section!, subtitle: e.target.value } })} />
                </Field>
                <BulletItemsList items={viewData.audience_section?.items ?? []} onChange={isRO ? () => {} : (items) => upd({ audience_section: { ...data.audience_section!, items } })} />
              </>}
            </OptionalSection>
          </SectionBlock>

          {/* ── Трансформация ── */}
          <SectionBlock title="🔄 Секция «Узнаёшь себя?»" open={!!data.transformation_section}>
            <OptionalSection label="Секция" enabled={!!data.transformation_section} onToggle={isRO ? () => {} : (v) => upd({ transformation_section: v ? { title: "Узнаёшь себя?", beforeLabel: "До", afterLabel: "После", pairs: [] } : null })}>
              {data.transformation_section && <>
                <Field label="Заголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.transformation_section?.title ?? ""} onChange={(e) => upd({ transformation_section: { ...data.transformation_section!, title: e.target.value } })} />
                </Field>
                <Field label="Метка «До»">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.transformation_section?.beforeLabel ?? ""} onChange={(e) => upd({ transformation_section: { ...data.transformation_section!, beforeLabel: e.target.value } })} />
                </Field>
                <Field label="Метка «После»">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.transformation_section?.afterLabel ?? ""} onChange={(e) => upd({ transformation_section: { ...data.transformation_section!, afterLabel: e.target.value } })} />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Пары «До → После»</label>
                  {(viewData.transformation_section?.pairs ?? []).map((pair, i) => (
                    <div key={pair.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "6px", marginBottom: "6px" }}>
                      <input className="input" style={roStyle} readOnly={isRO} placeholder="До..." value={pair.beforeText} onChange={(e) => { const p = [...data.transformation_section!.pairs]; p[i] = { ...pair, beforeText: e.target.value }; upd({ transformation_section: { ...data.transformation_section!, pairs: p } }); }} />
                      <input className="input" style={roStyle} readOnly={isRO} placeholder="После..." value={pair.afterText} onChange={(e) => { const p = [...data.transformation_section!.pairs]; p[i] = { ...pair, afterText: e.target.value }; upd({ transformation_section: { ...data.transformation_section!, pairs: p } }); }} />
                      {!isRO && <button className="btn btn-secondary" onClick={() => upd({ transformation_section: { ...data.transformation_section!, pairs: data.transformation_section!.pairs.filter((_, j) => j !== i) } })} style={{ color: "var(--accent-danger)" }}>×</button>}
                    </div>
                  ))}
                  {!isRO && <button className="btn btn-secondary" onClick={() => upd({ transformation_section: { ...data.transformation_section!, pairs: [...data.transformation_section!.pairs, { id: uid(), beforeText: "", afterText: "" }] } })} style={{ marginTop: "4px", fontSize: "13px" }}>+ Добавить пару</button>}
                </div>
              </>}
            </OptionalSection>
          </SectionBlock>

          {/* ── Преимущества ── */}
          <SectionBlock title="✨ Преимущества" open={!!data.benefits_section}>
            <OptionalSection label="Секция" enabled={!!data.benefits_section} onToggle={isRO ? () => {} : (v) => upd({ benefits_section: v ? { title: "Преимущества", subtitle: "", cards: [] } : null })}>
              {data.benefits_section && <>
                <Field label="Заголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.benefits_section?.title ?? ""} onChange={(e) => upd({ benefits_section: { ...data.benefits_section!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.benefits_section?.subtitle ?? ""} onChange={(e) => upd({ benefits_section: { ...data.benefits_section!, subtitle: e.target.value } })} />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Карточки</label>
                  {(viewData.benefits_section?.cards ?? []).map((card, i) => (
                    <div key={card.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "6px", marginBottom: "6px" }}>
                      <input className="input" style={roStyle} readOnly={isRO} placeholder="Метка" value={card.eyebrow ?? ""} onChange={(e) => { const c = [...data.benefits_section!.cards]; c[i] = { ...card, eyebrow: e.target.value }; upd({ benefits_section: { ...data.benefits_section!, cards: c } }); }} />
                      <input className="input" style={roStyle} readOnly={isRO} placeholder="Заголовок *" value={card.title} onChange={(e) => { const c = [...data.benefits_section!.cards]; c[i] = { ...card, title: e.target.value }; upd({ benefits_section: { ...data.benefits_section!, cards: c } }); }} />
                      <input className="input" style={roStyle} readOnly={isRO} placeholder="Текст *" value={card.text} onChange={(e) => { const c = [...data.benefits_section!.cards]; c[i] = { ...card, text: e.target.value }; upd({ benefits_section: { ...data.benefits_section!, cards: c } }); }} />
                      {!isRO && <button className="btn btn-secondary" onClick={() => upd({ benefits_section: { ...data.benefits_section!, cards: data.benefits_section!.cards.filter((_, j) => j !== i) } })} style={{ color: "var(--accent-danger)" }}>×</button>}
                    </div>
                  ))}
                  {!isRO && <button className="btn btn-secondary" onClick={() => upd({ benefits_section: { ...data.benefits_section!, cards: [...data.benefits_section!.cards, { id: uid(), eyebrow: "", title: "", text: "" }] } })} style={{ marginTop: "4px", fontSize: "13px" }}>+ Добавить карточку</button>}
                </div>
              </>}
            </OptionalSection>
          </SectionBlock>

          {/* ── FAQ ── */}
          <SectionBlock title="❓ FAQ">
            <div style={{ gridColumn: "1 / -1" }}>
              {viewData.faq_items.map((item, i) => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: "6px", marginBottom: "8px", alignItems: "start" }}>
                  <input className="input" style={roStyle} readOnly={isRO} placeholder="Вопрос *" value={item.question} onChange={(e) => { const f = [...data.faq_items]; f[i] = { ...item, question: e.target.value }; upd({ faq_items: f }); }} />
                  <textarea className="input" readOnly={isRO} rows={2} placeholder="Ответ *" value={item.answer} onChange={(e) => { const f = [...data.faq_items]; f[i] = { ...item, answer: e.target.value }; upd({ faq_items: f }); }} style={{ resize: "vertical", ...(roStyle ?? {}) }} />
                  {!isRO && <button className="btn btn-secondary" onClick={() => upd({ faq_items: data.faq_items.filter((_, j) => j !== i) })} style={{ color: "var(--accent-danger)" }}>×</button>}
                </div>
              ))}
              {!isRO && <button className="btn btn-secondary" onClick={() => upd({ faq_items: [...data.faq_items, { id: uid(), question: "", answer: "" }] })} style={{ marginTop: "4px", fontSize: "13px" }}>+ Добавить вопрос</button>}
            </div>
          </SectionBlock>

          {/* ── CTA покупки ── */}
          <SectionBlock title="💰 Кнопка покупки (CTA)" open={!!data.purchase_cta}>
            <OptionalSection label="Секция" enabled={!!data.purchase_cta} onToggle={isRO ? () => {} : (v) => upd({ purchase_cta: v ? { title: "Открыть каталог", subtitle: "", priceBadge: "$2", features: [], buttonTitle: "Открыть каталог" } : null })}>
              {data.purchase_cta && <>
                <Field label="Заголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.purchase_cta?.title ?? ""} onChange={(e) => upd({ purchase_cta: { ...data.purchase_cta!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.purchase_cta?.subtitle ?? ""} onChange={(e) => upd({ purchase_cta: { ...data.purchase_cta!, subtitle: e.target.value } })} />
                </Field>
                <Field label="Значок цены">
                  <input className="input" style={roStyle} readOnly={isRO} placeholder="$2 / $4.99" value={data.purchase_cta.priceBadge ?? ""} onChange={(e) => upd({ purchase_cta: { ...data.purchase_cta!, priceBadge: e.target.value } })} />
                </Field>
                <Field label="Текст кнопки">
                  <input className="input" style={roStyle} readOnly={isRO} value={viewData.purchase_cta?.buttonTitle ?? ""} onChange={(e) => upd({ purchase_cta: { ...data.purchase_cta!, buttonTitle: e.target.value } })} />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Фичи (SF-иконка, заголовок, подзаголовок)</label>
                  {(viewData.purchase_cta?.features ?? []).map((f, i) => (
                    <div key={f.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr auto", gap: "6px", marginBottom: "6px" }}>
                      <input className="input" readOnly={isRO} placeholder="SF-иконка" value={f.icon ?? ""} onChange={(e) => { const fs = [...data.purchase_cta!.features]; fs[i] = { ...f, icon: e.target.value }; upd({ purchase_cta: { ...data.purchase_cta!, features: fs } }); }} style={{ fontFamily: "monospace", fontSize: "12px", ...(roStyle ?? {}) }} />
                      <input className="input" style={roStyle} readOnly={isRO} placeholder="Заголовок *" value={f.title} onChange={(e) => { const fs = [...data.purchase_cta!.features]; fs[i] = { ...f, title: e.target.value }; upd({ purchase_cta: { ...data.purchase_cta!, features: fs } }); }} />
                      <input className="input" style={roStyle} readOnly={isRO} placeholder="Подзаголовок" value={f.subtitle ?? ""} onChange={(e) => { const fs = [...data.purchase_cta!.features]; fs[i] = { ...f, subtitle: e.target.value }; upd({ purchase_cta: { ...data.purchase_cta!, features: fs } }); }} />
                      {!isRO && <button className="btn btn-secondary" onClick={() => upd({ purchase_cta: { ...data.purchase_cta!, features: data.purchase_cta!.features.filter((_, j) => j !== i) } })} style={{ color: "var(--accent-danger)" }}>×</button>}
                    </div>
                  ))}
                  {!isRO && <button className="btn btn-secondary" onClick={() => upd({ purchase_cta: { ...data.purchase_cta!, features: [...data.purchase_cta!.features, { id: uid(), icon: "", title: "", subtitle: "" }] } })} style={{ marginTop: "4px", fontSize: "13px" }}>+ Добавить</button>}
                </div>
              </>}
            </OptionalSection>
          </SectionBlock>
        </div>
      )}
    </div>
  );
}

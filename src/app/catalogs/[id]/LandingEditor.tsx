"use client";
import { useState, useEffect } from "react";

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

function Field({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return (
    <div className="form-group" style={span ? { gridColumn: "1 / -1" } : undefined}>
      <label className="form-label">{label}</label>
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

function BadgesField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [newBadge, setNewBadge] = useState("");
  const add = () => { if (newBadge.trim()) { onChange([...value, newBadge.trim()]); setNewBadge(""); } };
  return (
    <div className="form-group" style={{ gridColumn: "1 / -1" }}>
      <label className="form-label">Значки</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px", minHeight: "28px" }}>
        {value.map((badge, i) => (
          <span key={i} style={{ background: "var(--bg-hover)", padding: "4px 10px", borderRadius: "20px", fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
            {badge}
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-danger)", fontSize: "15px", lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          className="input"
          placeholder="Новый значок — нажми Enter"
          value={newBadge}
          onChange={(e) => setNewBadge(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { add(); e.preventDefault(); } }}
          style={{ flex: 1 }}
        />
        <button className="btn btn-secondary" type="button" onClick={add}>+</button>
      </div>
    </div>
  );
}

function OptionalToggle({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", paddingBottom: "12px", borderBottom: "1px solid var(--border-light)", marginBottom: "4px" }}>
      <label style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
        {label}
      </label>
    </div>
  );
}

function BulletItemsList({ items, onChange }: { items: BulletItem[]; onChange: (v: BulletItem[]) => void }) {
  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <label className="form-label">Пункты</label>
      {items.map((item, i) => (
        <div key={item.id} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr auto", gap: "6px", marginBottom: "6px", alignItems: "start" }}>
          <input className="input" placeholder="😊" value={item.emoji ?? ""} onChange={(e) => { const next = [...items]; next[i] = { ...item, emoji: e.target.value }; onChange(next); }} style={{ fontSize: "20px", textAlign: "center" }} />
          <input className="input" placeholder="Заголовок (необяз.)" value={item.title ?? ""} onChange={(e) => { const next = [...items]; next[i] = { ...item, title: e.target.value }; onChange(next); }} />
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

  useEffect(() => { loadLanding(); }, [cuisineId]);

  async function loadLanding() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/landings/${cuisineId}`);
      const result = await res.json();
      const loaded = result.data as LandingData | null;
      if (loaded) {
        setData(loaded);
        setJsonText(JSON.stringify(loaded, null, 2));
      } else {
        setData(null);
        setJsonText("");
      }
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }

  function createDraft() {
    const draft = defaultLanding(cuisineId, cuisineName, cuisineDescription);
    setData(draft);
    setJsonText(JSON.stringify(draft, null, 2));
  }

  async function generateWithAi() {
    setIsAiLoading(true);
    setSaveStatus("AI генерирует лендинг...");
    try {
      const res = await fetch("/api/admin/ai/landing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuisineName,
          cuisineDescription,
          price: cuisinePrice || "$2",
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
      setShowAiPrompt(false);
      setAiUserPrompt("");
      setSaveStatus("AI заполнил лендинг ✨ — проверь и сохрани");
    } catch {
      setSaveStatus("Ошибка соединения с AI");
    } finally {
      setIsAiLoading(false);
    }
  }

  function buildCopyPrompt(): string {
    return `Ты конвертируешь текст лендинга в строгий JSON для мобильного приложения.

ЗАДАЧА: Возьми текст ниже и заполни JSON-структуру. Не придумывай ничего от себя — только переноси текст из описания в нужные поля. Если какого-то блока нет в тексте — оставь разумный минимум.

ПРАВИЛА:
- Верни ТОЛЬКО валидный JSON, без markdown-обёртки, без комментариев
- Все "id" поля замени на реальные UUID v4 (формат: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
- HEX-цвета без символа # (например: FF375F, не #FF375F)
- Подбери цвета под тему каталога: pageBackgroundHex — очень тёмный (0B0B0D..1A1A2E), heroBackgroundHex — насыщенный под тему
- "imageUrl" всегда null
- "recipe_preview_ids" всегда []
- "is_published" всегда false
- "sort_order" всегда 0
- Язык текста в JSON должен совпадать с языком исходного текста

JSON-СТРУКТУРА (заполни все поля):
{
  "preview_card": {
    "title": "короткий заголовок для карточки в списке (до 40 символов)",
    "subtitle": "1-2 предложения о пользе",
    "badges": ["метка 1", "метка 2", "метка 3"],
    "imageUrl": null,
    "backgroundHex": "RRGGBB",
    "overlayHex": "RRGGBB",
    "accentHex": "RRGGBB"
  },
  "hero": {
    "title": "заголовок лендинга (можно с \\n для переноса)",
    "subtitle": "1-2 предложения подзаголовка",
    "badges": ["метка 1", "метка 2", "метка 3"],
    "imageUrl": null,
    "backgroundHex": "RRGGBB",
    "overlayHex": "RRGGBB"
  },
  "inside_section": {
    "title": "Что внутри",
    "subtitle": "подзаголовок секции",
    "items": [
      {"id": "uuid", "emoji": "🍜", "title": "заголовок пункта или null", "text": "текст пункта"},
      {"id": "uuid", "emoji": "🧾", "title": null, "text": "текст пункта"},
      {"id": "uuid", "emoji": "🛒", "title": null, "text": "текст пункта"}
    ]
  },
  "recipe_showcase": {
    "title": "заголовок секции примеров рецептов",
    "subtitle": "подзаголовок"
  },
  "audience_section": {
    "title": "Кому подойдёт",
    "subtitle": "подзаголовок",
    "items": [
      {"id": "uuid", "emoji": "✨", "title": null, "text": "текст"},
      {"id": "uuid", "emoji": "⏱", "title": null, "text": "текст"},
      {"id": "uuid", "emoji": "📚", "title": null, "text": "текст"}
    ]
  },
  "transformation_section": {
    "title": "Узнаёшь себя?",
    "subtitle": null,
    "beforeLabel": "До",
    "afterLabel": "После",
    "pairs": [
      {"id": "uuid", "beforeText": "боль/проблема", "afterText": "решение"},
      {"id": "uuid", "beforeText": "боль/проблема", "afterText": "решение"},
      {"id": "uuid", "beforeText": "боль/проблема", "afterText": "решение"}
    ]
  },
  "benefits_section": {
    "title": "Преимущества",
    "subtitle": "подзаголовок",
    "cards": [
      {"id": "uuid", "eyebrow": "короткая метка", "title": "заголовок карточки", "text": "описание"},
      {"id": "uuid", "eyebrow": "короткая метка", "title": "заголовок карточки", "text": "описание"},
      {"id": "uuid", "eyebrow": "короткая метка", "title": "заголовок карточки", "text": "описание"}
    ]
  },
  "faq_items": [
    {"id": "uuid", "question": "вопрос?", "answer": "ответ"},
    {"id": "uuid", "question": "вопрос?", "answer": "ответ"},
    {"id": "uuid", "question": "вопрос?", "answer": "ответ"},
    {"id": "uuid", "question": "вопрос?", "answer": "ответ"}
  ],
  "purchase_cta": {
    "title": "Открыть каталог",
    "subtitle": "краткое описание что входит",
    "priceBadge": "$4",
    "features": [
      {"id": "uuid", "icon": "book.closed", "title": "N рецептов", "subtitle": "внутри каталога"},
      {"id": "uuid", "icon": "list.bullet.rectangle", "title": "Пошаговые инструкции", "subtitle": "без лишней теории"},
      {"id": "uuid", "icon": "arrow.clockwise", "title": "Обновления", "subtitle": "бесплатно навсегда"}
    ],
    "buttonTitle": "Открыть каталог"
  },
  "theme": {
    "pageBackgroundHex": "0E0E11",
    "heroBackgroundHex": "RRGGBB",
    "heroOverlayHex": "RRGGBB",
    "cardBackgroundHex": "F2F2F7",
    "accentHex": "RRGGBB",
    "secondaryAccentHex": "F4D000",
    "textOnDarkHex": "FFFFFF"
  },
  "recipe_preview_ids": [],
  "is_published": false,
  "sort_order": 0
}

ТЕКСТ ЛЕНДИНГА:
${cuisineName ? `Каталог: ${cuisineName}` : ""}
${cuisineDescription ? `Описание: ${cuisineDescription}` : ""}

[ВСТАВЬ СЮДА ПОЛНЫЙ ТЕКСТ ЛЕНДИНГА]`;
  }

  function copyPrompt() {
    const prompt = buildCopyPrompt();
    navigator.clipboard.writeText(prompt).then(() => {
      setSaveStatus("Промпт скопирован ✅ — вставь в AI-чат");
      setTimeout(() => setSaveStatus(""), 4000);
    });
  }

  function switchToJson() {
    if (data) setJsonText(JSON.stringify(data, null, 2));
    setJsonError("");
    setMode("json");
  }

  function switchToForm() {
    try {
      const parsed = JSON.parse(jsonText);
      setData(parsed);
      setJsonError("");
      setMode("form");
    } catch (e) {
      setJsonError("Невалидный JSON — исправь ошибки перед переключением");
    }
  }

  async function saveLanding() {
    let payload = data;
    if (mode === "json") {
      try {
        payload = JSON.parse(jsonText);
        setData(payload!);
        setJsonError("");
      } catch {
        setJsonError("Невалидный JSON — исправь ошибки перед сохранением");
        return;
      }
    }
    if (!payload) return;

    setSaveStatus("Сохраняю...");
    try {
      const res = await fetch(`/api/admin/landings/${cuisineId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        setSaveStatus(`Ошибка: ${result.error ?? "не удалось сохранить"}`);
        return;
      }
      setData(result.data);
      setJsonText(JSON.stringify(result.data, null, 2));
      setSaveStatus(`Готово ✅ (${new Date().toLocaleTimeString()})`);
    } catch {
      setSaveStatus("Ошибка соединения");
    }
  }

  async function deleteLanding() {
    if (!confirm("Удалить лендинг? Это действие необратимо.")) return;
    await fetch(`/api/admin/landings/${cuisineId}`, { method: "DELETE" });
    setData(null);
    setJsonText("");
    setSaveStatus("Удалено");
  }

  const upd = (patch: Partial<LandingData>) => setData((prev) => prev ? { ...prev, ...patch } : null);

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
      {/* ── AI Prompt panel ── */}
      {showAiPrompt && (
        <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "14px", padding: "16px", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "8px" }}>✨ AI заполнит лендинг</div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "10px", lineHeight: 1.5 }}>
            AI сгенерирует все секции на основе названия и описания каталога. Опционально уточни пожелания ниже.
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
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
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

        {/* Published badge */}
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600, padding: "6px 12px", background: data.is_published ? "rgba(52,199,89,0.12)" : "var(--bg-hover)", borderRadius: "8px", color: data.is_published ? "#34c759" : "var(--text-secondary)" }}>
          <input type="checkbox" checked={data.is_published} onChange={(e) => upd({ is_published: e.target.checked })} style={{ width: "15px", height: "15px" }} />
          {data.is_published ? "Опубликован" : "Черновик"}
        </label>

        {/* Copy prompt */}
        <button
          className="btn btn-secondary"
          onClick={copyPrompt}
          style={{ marginLeft: "auto", fontSize: "13px" }}
          title="Скопировать промпт для заполнения через внешний AI-чат"
        >
          📋 Копировать промпт
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
        <button className="btn btn-secondary" onClick={deleteLanding} style={{ color: "var(--accent-danger)" }}>Удалить</button>

        {saveStatus && <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{saveStatus}</span>}
      </div>

      {jsonError && (
        <div style={{ padding: "10px 14px", background: "rgba(255,59,48,0.1)", borderRadius: "8px", color: "var(--accent-danger)", fontSize: "13px", marginBottom: "12px" }}>
          {jsonError}
        </div>
      )}

      {/* ── JSON mode ── */}
      {mode === "json" && (
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          style={{ width: "100%", minHeight: "600px", fontFamily: "monospace", fontSize: "12px", padding: "16px", background: "var(--bg-surface)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", resize: "vertical", lineHeight: 1.5 }}
          spellCheck={false}
        />
      )}

      {/* ── Form mode ── */}
      {mode === "form" && (
        <div>
          {/* Статус и порядок */}
          <SectionBlock title="⚙️ Статус и порядок">
            <Field label="Порядок отображения">
              <input className="input" type="number" value={data.sort_order} onChange={(e) => upd({ sort_order: parseInt(e.target.value) || 0 })} style={{ maxWidth: "120px" }} />
            </Field>
          </SectionBlock>

          {/* Превью карточка */}
          <SectionBlock title="🃏 Превью карточка (список в Исследовать)">
            <Field label="Заголовок *">
              <input className="input" value={data.preview_card.title} onChange={(e) => upd({ preview_card: { ...data.preview_card, title: e.target.value } })} />
            </Field>
            <Field label="Подзаголовок">
              <input className="input" value={data.preview_card.subtitle ?? ""} onChange={(e) => upd({ preview_card: { ...data.preview_card, subtitle: e.target.value } })} />
            </Field>
            <Field label="URL изображения" span>
              <input className="input" placeholder="https://..." value={data.preview_card.imageUrl ?? ""} onChange={(e) => upd({ preview_card: { ...data.preview_card, imageUrl: e.target.value } })} />
            </Field>
            <BadgesField value={data.preview_card.badges} onChange={(v) => upd({ preview_card: { ...data.preview_card, badges: v } })} />
            <ColorField label="Фон" value={data.preview_card.backgroundHex} onChange={(v) => upd({ preview_card: { ...data.preview_card, backgroundHex: v } })} />
            <ColorField label="Оверлей" value={data.preview_card.overlayHex} onChange={(v) => upd({ preview_card: { ...data.preview_card, overlayHex: v } })} />
            <ColorField label="Акцент" value={data.preview_card.accentHex} onChange={(v) => upd({ preview_card: { ...data.preview_card, accentHex: v } })} />
          </SectionBlock>

          {/* Hero секция */}
          <SectionBlock title="🦸 Hero секция (верх лендинга)">
            <Field label="Заголовок *">
              <input className="input" value={data.hero.title} onChange={(e) => upd({ hero: { ...data.hero, title: e.target.value } })} />
            </Field>
            <Field label="Подзаголовок">
              <textarea className="input" rows={2} value={data.hero.subtitle ?? ""} onChange={(e) => upd({ hero: { ...data.hero, subtitle: e.target.value } })} />
            </Field>
            <Field label="URL изображения" span>
              <input className="input" placeholder="https://..." value={data.hero.imageUrl ?? ""} onChange={(e) => upd({ hero: { ...data.hero, imageUrl: e.target.value } })} />
            </Field>
            <BadgesField value={data.hero.badges} onChange={(v) => upd({ hero: { ...data.hero, badges: v } })} />
            <ColorField label="Фон" value={data.hero.backgroundHex} onChange={(v) => upd({ hero: { ...data.hero, backgroundHex: v } })} />
            <ColorField label="Оверлей" value={data.hero.overlayHex} onChange={(v) => upd({ hero: { ...data.hero, overlayHex: v } })} />
          </SectionBlock>

          {/* Тема */}
          <SectionBlock title="🎨 Тема оформления">
            <ColorField label="Фон страницы" value={data.theme.pageBackgroundHex} onChange={(v) => upd({ theme: { ...data.theme, pageBackgroundHex: v } })} />
            <ColorField label="Фон hero" value={data.theme.heroBackgroundHex} onChange={(v) => upd({ theme: { ...data.theme, heroBackgroundHex: v } })} />
            <ColorField label="Оверлей hero" value={data.theme.heroOverlayHex} onChange={(v) => upd({ theme: { ...data.theme, heroOverlayHex: v } })} />
            <ColorField label="Фон карточек" value={data.theme.cardBackgroundHex} onChange={(v) => upd({ theme: { ...data.theme, cardBackgroundHex: v } })} />
            <ColorField label="Акцент" value={data.theme.accentHex} onChange={(v) => upd({ theme: { ...data.theme, accentHex: v } })} />
            <ColorField label="Доп. акцент" value={data.theme.secondaryAccentHex} onChange={(v) => upd({ theme: { ...data.theme, secondaryAccentHex: v } })} />
            <ColorField label="Текст на тёмном" value={data.theme.textOnDarkHex} onChange={(v) => upd({ theme: { ...data.theme, textOnDarkHex: v } })} />
          </SectionBlock>

          {/* Секция "Что внутри" */}
          <SectionBlock title="📦 Секция «Что внутри»" open={!!data.inside_section}>
            <OptionalToggle label="Включить секцию" enabled={!!data.inside_section} onToggle={(v) => upd({ inside_section: v ? { title: "Что внутри", subtitle: "", items: [] } : null })} />
            {data.inside_section && (
              <>
                <Field label="Заголовок">
                  <input className="input" value={data.inside_section.title} onChange={(e) => upd({ inside_section: { ...data.inside_section!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" value={data.inside_section.subtitle ?? ""} onChange={(e) => upd({ inside_section: { ...data.inside_section!, subtitle: e.target.value } })} />
                </Field>
                <BulletItemsList items={data.inside_section.items} onChange={(items) => upd({ inside_section: { ...data.inside_section!, items } })} />
              </>
            )}
          </SectionBlock>

          {/* Витрина рецептов */}
          <SectionBlock title="🍽️ Витрина рецептов" open={!!data.recipe_showcase}>
            <OptionalToggle label="Включить секцию" enabled={!!data.recipe_showcase} onToggle={(v) => upd({ recipe_showcase: v ? { title: "Примеры рецептов", subtitle: "" } : null })} />
            {data.recipe_showcase && (
              <>
                <Field label="Заголовок">
                  <input className="input" value={data.recipe_showcase.title} onChange={(e) => upd({ recipe_showcase: { ...data.recipe_showcase!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" value={data.recipe_showcase.subtitle ?? ""} onChange={(e) => upd({ recipe_showcase: { ...data.recipe_showcase!, subtitle: e.target.value } })} />
                </Field>
              </>
            )}
          </SectionBlock>

          {/* Аудитория */}
          <SectionBlock title="👥 Секция «Кому подойдёт»" open={!!data.audience_section}>
            <OptionalToggle label="Включить секцию" enabled={!!data.audience_section} onToggle={(v) => upd({ audience_section: v ? { title: "Кому подойдёт", subtitle: "", items: [] } : null })} />
            {data.audience_section && (
              <>
                <Field label="Заголовок">
                  <input className="input" value={data.audience_section.title} onChange={(e) => upd({ audience_section: { ...data.audience_section!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" value={data.audience_section.subtitle ?? ""} onChange={(e) => upd({ audience_section: { ...data.audience_section!, subtitle: e.target.value } })} />
                </Field>
                <BulletItemsList items={data.audience_section.items} onChange={(items) => upd({ audience_section: { ...data.audience_section!, items } })} />
              </>
            )}
          </SectionBlock>

          {/* Трансформация */}
          <SectionBlock title="🔄 Секция «Узнаешь себя?»" open={!!data.transformation_section}>
            <OptionalToggle label="Включить секцию" enabled={!!data.transformation_section} onToggle={(v) => upd({ transformation_section: v ? { title: "Узнаешь себя?", beforeLabel: "До", afterLabel: "После", pairs: [] } : null })} />
            {data.transformation_section && (
              <>
                <Field label="Заголовок">
                  <input className="input" value={data.transformation_section.title} onChange={(e) => upd({ transformation_section: { ...data.transformation_section!, title: e.target.value } })} />
                </Field>
                <Field label="Метка «До»">
                  <input className="input" value={data.transformation_section.beforeLabel ?? ""} onChange={(e) => upd({ transformation_section: { ...data.transformation_section!, beforeLabel: e.target.value } })} />
                </Field>
                <Field label="Метка «После»">
                  <input className="input" value={data.transformation_section.afterLabel ?? ""} onChange={(e) => upd({ transformation_section: { ...data.transformation_section!, afterLabel: e.target.value } })} />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Пары «До → После»</label>
                  {data.transformation_section.pairs.map((pair, i) => (
                    <div key={pair.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "6px", marginBottom: "6px" }}>
                      <input className="input" placeholder="До..." value={pair.beforeText} onChange={(e) => { const p = [...data.transformation_section!.pairs]; p[i] = { ...pair, beforeText: e.target.value }; upd({ transformation_section: { ...data.transformation_section!, pairs: p } }); }} />
                      <input className="input" placeholder="После..." value={pair.afterText} onChange={(e) => { const p = [...data.transformation_section!.pairs]; p[i] = { ...pair, afterText: e.target.value }; upd({ transformation_section: { ...data.transformation_section!, pairs: p } }); }} />
                      <button className="btn btn-secondary" onClick={() => upd({ transformation_section: { ...data.transformation_section!, pairs: data.transformation_section!.pairs.filter((_, j) => j !== i) } })} style={{ color: "var(--accent-danger)" }}>×</button>
                    </div>
                  ))}
                  <button className="btn btn-secondary" onClick={() => upd({ transformation_section: { ...data.transformation_section!, pairs: [...data.transformation_section!.pairs, { id: uid(), beforeText: "", afterText: "" }] } })} style={{ marginTop: "4px", fontSize: "13px" }}>+ Добавить пару</button>
                </div>
              </>
            )}
          </SectionBlock>

          {/* Преимущества */}
          <SectionBlock title="✨ Преимущества" open={!!data.benefits_section}>
            <OptionalToggle label="Включить секцию" enabled={!!data.benefits_section} onToggle={(v) => upd({ benefits_section: v ? { title: "Преимущества", subtitle: "", cards: [] } : null })} />
            {data.benefits_section && (
              <>
                <Field label="Заголовок">
                  <input className="input" value={data.benefits_section.title} onChange={(e) => upd({ benefits_section: { ...data.benefits_section!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" value={data.benefits_section.subtitle ?? ""} onChange={(e) => upd({ benefits_section: { ...data.benefits_section!, subtitle: e.target.value } })} />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Карточки</label>
                  {data.benefits_section.cards.map((card, i) => (
                    <div key={card.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "6px", marginBottom: "6px" }}>
                      <input className="input" placeholder="Метка (необяз.)" value={card.eyebrow ?? ""} onChange={(e) => { const c = [...data.benefits_section!.cards]; c[i] = { ...card, eyebrow: e.target.value }; upd({ benefits_section: { ...data.benefits_section!, cards: c } }); }} />
                      <input className="input" placeholder="Заголовок *" value={card.title} onChange={(e) => { const c = [...data.benefits_section!.cards]; c[i] = { ...card, title: e.target.value }; upd({ benefits_section: { ...data.benefits_section!, cards: c } }); }} />
                      <input className="input" placeholder="Текст *" value={card.text} onChange={(e) => { const c = [...data.benefits_section!.cards]; c[i] = { ...card, text: e.target.value }; upd({ benefits_section: { ...data.benefits_section!, cards: c } }); }} />
                      <button className="btn btn-secondary" onClick={() => upd({ benefits_section: { ...data.benefits_section!, cards: data.benefits_section!.cards.filter((_, j) => j !== i) } })} style={{ color: "var(--accent-danger)" }}>×</button>
                    </div>
                  ))}
                  <button className="btn btn-secondary" onClick={() => upd({ benefits_section: { ...data.benefits_section!, cards: [...data.benefits_section!.cards, { id: uid(), eyebrow: "", title: "", text: "" }] } })} style={{ marginTop: "4px", fontSize: "13px" }}>+ Добавить карточку</button>
                </div>
              </>
            )}
          </SectionBlock>

          {/* FAQ */}
          <SectionBlock title="❓ FAQ">
            <div style={{ gridColumn: "1 / -1" }}>
              {data.faq_items.map((item, i) => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "6px", marginBottom: "6px" }}>
                  <input className="input" placeholder="Вопрос *" value={item.question} onChange={(e) => { const f = [...data.faq_items]; f[i] = { ...item, question: e.target.value }; upd({ faq_items: f }); }} />
                  <input className="input" placeholder="Ответ *" value={item.answer} onChange={(e) => { const f = [...data.faq_items]; f[i] = { ...item, answer: e.target.value }; upd({ faq_items: f }); }} />
                  <button className="btn btn-secondary" onClick={() => upd({ faq_items: data.faq_items.filter((_, j) => j !== i) })} style={{ color: "var(--accent-danger)" }}>×</button>
                </div>
              ))}
              <button className="btn btn-secondary" onClick={() => upd({ faq_items: [...data.faq_items, { id: uid(), question: "", answer: "" }] })} style={{ marginTop: "4px", fontSize: "13px" }}>+ Добавить вопрос</button>
            </div>
          </SectionBlock>

          {/* CTA покупки */}
          <SectionBlock title="💰 Кнопка покупки (CTA)" open={!!data.purchase_cta}>
            <OptionalToggle label="Включить CTA" enabled={!!data.purchase_cta} onToggle={(v) => upd({ purchase_cta: v ? { title: "Открыть каталог", subtitle: "", priceBadge: "$2", features: [], buttonTitle: "Открыть каталог" } : null })} />
            {data.purchase_cta && (
              <>
                <Field label="Заголовок">
                  <input className="input" value={data.purchase_cta.title} onChange={(e) => upd({ purchase_cta: { ...data.purchase_cta!, title: e.target.value } })} />
                </Field>
                <Field label="Подзаголовок">
                  <input className="input" value={data.purchase_cta.subtitle ?? ""} onChange={(e) => upd({ purchase_cta: { ...data.purchase_cta!, subtitle: e.target.value } })} />
                </Field>
                <Field label="Значок цены">
                  <input className="input" placeholder="$2 / $4.99" value={data.purchase_cta.priceBadge ?? ""} onChange={(e) => upd({ purchase_cta: { ...data.purchase_cta!, priceBadge: e.target.value } })} />
                </Field>
                <Field label="Текст кнопки">
                  <input className="input" value={data.purchase_cta.buttonTitle ?? ""} onChange={(e) => upd({ purchase_cta: { ...data.purchase_cta!, buttonTitle: e.target.value } })} />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Фичи (иконка SF, заголовок, подзаголовок)</label>
                  {data.purchase_cta.features.map((f, i) => (
                    <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "6px", marginBottom: "6px" }}>
                      <input className="input" placeholder="SF-иконка" value={f.icon ?? ""} onChange={(e) => { const fs = [...data.purchase_cta!.features]; fs[i] = { ...f, icon: e.target.value }; upd({ purchase_cta: { ...data.purchase_cta!, features: fs } }); }} />
                      <input className="input" placeholder="Заголовок *" value={f.title} onChange={(e) => { const fs = [...data.purchase_cta!.features]; fs[i] = { ...f, title: e.target.value }; upd({ purchase_cta: { ...data.purchase_cta!, features: fs } }); }} />
                      <input className="input" placeholder="Подзаголовок" value={f.subtitle ?? ""} onChange={(e) => { const fs = [...data.purchase_cta!.features]; fs[i] = { ...f, subtitle: e.target.value }; upd({ purchase_cta: { ...data.purchase_cta!, features: fs } }); }} />
                      <button className="btn btn-secondary" onClick={() => upd({ purchase_cta: { ...data.purchase_cta!, features: data.purchase_cta!.features.filter((_, j) => j !== i) } })} style={{ color: "var(--accent-danger)" }}>×</button>
                    </div>
                  ))}
                  <button className="btn btn-secondary" onClick={() => upd({ purchase_cta: { ...data.purchase_cta!, features: [...data.purchase_cta!.features, { id: uid(), icon: "", title: "", subtitle: "" }] } })} style={{ marginTop: "4px", fontSize: "13px" }}>+ Добавить</button>
                </div>
              </>
            )}
          </SectionBlock>
        </div>
      )}
    </div>
  );
}

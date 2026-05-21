"use client";

import { useState } from "react";

type TestResponse = {
  success?: boolean;
  model?: string;
  content?: string;
  usage?: Record<string, unknown> | null;
  error?: string;
};

const defaultPrompt = `Ты тестируешь модель для админки продуктов.
Верни ТОЛЬКО валидный JSON без markdown:
{
  "canonical_name": "Лимон",
  "translations": {
    "en": "Lemon",
    "de": "Zitrone",
    "it": "Limone",
    "fr": "Citron",
    "es": "Limón",
    "pt-BR": "Limão",
    "uk": "Лимон"
  }
}`;

const s = {
  card: (extra?: React.CSSProperties): React.CSSProperties => ({
    border: "1px solid #e0e0e0",
    borderRadius: 14,
    background: "#fff",
    padding: "20px 24px",
    ...extra,
  }),
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: "0.35px",
  } satisfies React.CSSProperties,
  input: {
    width: "100%",
    border: "1px solid #d4d4d4",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    outline: "none",
    background: "#fff",
  } satisfies React.CSSProperties,
  btn: (disabled?: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1.5px solid #000",
    background: "#000",
    color: "#fff",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  }),
};

export default function NvidiaModelPanel() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("google/gemma-3n-e2b-it");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [stream, setStream] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [output, setOutput] = useState("");
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);

  const runTest = async () => {
    if (loading) return;

    setLoading(true);
    setStatus("Отправляю запрос в NVIDIA…");
    setOutput("");
    setUsage(null);

    try {
      const response = await fetch("/api/admin/products/nvidia-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          model,
          prompt,
          stream,
          maxTokens: 512,
          temperature: 0.2,
          topP: 0.7,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as TestResponse;
        setStatus(`Ошибка: ${data.error ?? response.statusText}`);
        return;
      }

      if (stream) {
        const reader = response.body?.getReader();
        if (!reader) {
          setStatus("Ошибка: пустой stream");
          return;
        }

        const decoder = new TextDecoder();
        let text = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          setOutput(text);
        }
        setStatus("Готово: streaming работает");
      } else {
        const data = (await response.json()) as TestResponse;
        setOutput(data.content ?? JSON.stringify(data, null, 2));
        setUsage(data.usage ?? null);
        setStatus("Готово: JSON response работает");
      }
    } catch (error) {
      setStatus(`Ошибка сети: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 900 }}>
      <div style={s.card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 460px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{
                background: "#000",
                color: "#fff",
                borderRadius: 8,
                padding: "3px 10px",
                fontSize: 12,
                fontWeight: 700,
              }}>
                NVIDIA
              </span>
              <span style={{
                border: "1px solid #d4d4d4",
                borderRadius: 999,
                padding: "2px 10px",
                fontSize: 12,
                color: "#555",
                fontWeight: 700,
              }}>
                Gemma 3n
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, letterSpacing: "-0.5px" }}>
              Тест новой модели
            </h2>
            <p style={{ margin: "6px 0 0", color: "#737373", fontSize: 13, lineHeight: 1.5 }}>
              Отдельная проверка NVIDIA Chat Completions без влияния на текущую обработку продуктов.
            </p>
          </div>

          <button type="button" style={s.btn(loading)} disabled={loading} onClick={runTest}>
            {loading ? "Тестирую…" : "Запустить тест"}
          </button>
        </div>

        {status && (
          <div style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: status.startsWith("Ошибка") ? "#fff5f2" : "#f5f5f5",
            color: status.startsWith("Ошибка") ? "#c22b10" : "#444",
            fontSize: 13,
          }}>
            {status}
          </div>
        )}
      </div>

      <div style={s.card()}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14 }}>
          <label>
            <span style={s.label}>Model</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} style={s.input} />
          </label>

          <label>
            <span style={s.label}>API key</span>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Опционально: если NVIDIA_API_KEY не задан в env"
              type="password"
              style={s.input}
            />
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, color: "#444" }}>
          <input checked={stream} onChange={(e) => setStream(e.target.checked)} type="checkbox" />
          Streaming response
        </label>

        <label style={{ display: "block", marginTop: 14 }}>
          <span style={s.label}>Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={12}
            style={{ ...s.input, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.5 }}
          />
        </label>
      </div>

      <div style={s.card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <div style={s.label}>Response</div>
          {usage && (
            <div style={{ fontSize: 12, color: "#737373" }}>
              usage: {JSON.stringify(usage)}
            </div>
          )}
        </div>
        <pre style={{
          margin: 0,
          minHeight: 180,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontSize: 13,
          lineHeight: 1.55,
          color: output ? "#111" : "#aaa",
          background: "#fafafa",
          border: "1px solid #f0f0f0",
          borderRadius: 10,
          padding: 14,
        }}>
          {output || "Ответ модели появится здесь"}
        </pre>
      </div>
    </div>
  );
}

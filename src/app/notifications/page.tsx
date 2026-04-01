"use client";

import { useState, useEffect, useCallback } from "react";

type BroadcastType = "promo" | "system";

interface LogEntry {
  id: string;
  type: string;
  reference_id: string | null;
  sent_count: number;
  created_at: string;
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<"send" | "history">("send");

  // Send form
  const [type, setType] = useState<BroadcastType>("promo");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; sent?: number; total?: number; error?: string } | null>(null);

  // History
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/admin/notifications/log");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "history") loadLogs();
  }, [tab, loadLogs]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, type }),
      });
      const data = await res.json();
      setSendResult(data);
      if (data.ok) {
        setTitle("");
        setBody("");
      }
    } catch (err) {
      setSendResult({ ok: false, error: String(err) });
    } finally {
      setSending(false);
    }
  };

  const handleCatalogPing = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/cron/send-catalog-notification", { method: "POST" });
      const data = await res.json();
      setSendResult(data);
    } catch (err) {
      setSendResult({ ok: false, error: String(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: "32px", maxWidth: "720px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "24px" }}>
        🔔 Уведомления
      </h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "28px" }}>
        {(["send", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              background: tab === t ? "#fff" : "transparent",
              color: tab === t ? "#111" : "#666",
              fontWeight: tab === t ? 600 : 400,
              fontSize: "15px",
              cursor: "pointer",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
            }}
          >
            {t === "send" ? "Отправить" : "История"}
          </button>
        ))}
      </div>

      {/* ── Send Tab ── */}
      {tab === "send" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Manual catalog ping */}
          <div style={{
            background: "#f8f8f8",
            borderRadius: "12px",
            padding: "20px",
            border: "1px solid #e8e8e8",
          }}>
            <p style={{ fontWeight: 600, marginBottom: "8px" }}>🍽️ Каталог</p>
            <p style={{ fontSize: "14px", color: "#666", marginBottom: "14px" }}>
              Найти новые каталоги добавленные за последние 25ч и отправить пуш.
              Запускается автоматически pg_cron в 21:00 UTC.
            </p>
            <button
              type="button"
              onClick={handleCatalogPing}
              disabled={sending}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                background: "#111",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 500,
                cursor: sending ? "not-allowed" : "pointer",
                opacity: sending ? 0.6 : 1,
              }}
            >
              {sending ? "Отправка…" : "Запустить вручную"}
            </button>
          </div>

          {/* Broadcast form */}
          <form
            onSubmit={handleSend}
            style={{
              background: "#f8f8f8",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e8e8e8",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: "4px" }}>📢 Рассылка</p>

            {/* Type */}
            <div>
              <label style={{ fontSize: "13px", color: "#555", display: "block", marginBottom: "6px" }}>
                Тип
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {(["promo", "system"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: `2px solid ${type === t ? "#111" : "#ddd"}`,
                      background: type === t ? "#111" : "#fff",
                      color: type === t ? "#fff" : "#444",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {t === "promo" ? "🎁 Promo" : "⚙️ System"}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label style={{ fontSize: "13px", color: "#555", display: "block", marginBottom: "6px" }}>
                Заголовок
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Заголовок уведомления"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "15px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Body */}
            <div>
              <label style={{ fontSize: "13px", color: "#555", display: "block", marginBottom: "6px" }}>
                Текст
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Текст уведомления"
                required
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "15px",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={sending || !title.trim() || !body.trim()}
              style={{
                padding: "12px 24px",
                borderRadius: "8px",
                border: "none",
                background: "#111",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                cursor: sending ? "not-allowed" : "pointer",
                opacity: sending || !title.trim() || !body.trim() ? 0.5 : 1,
                alignSelf: "flex-start",
              }}
            >
              {sending ? "Отправка…" : "Отправить всем"}
            </button>
          </form>

          {/* Result */}
          {sendResult && (
            <div style={{
              padding: "14px 18px",
              borderRadius: "10px",
              background: sendResult.ok ? "#f0fdf4" : "#fff0f0",
              border: `1px solid ${sendResult.ok ? "#bbf7d0" : "#fecaca"}`,
              color: sendResult.ok ? "#166534" : "#991b1b",
              fontSize: "14px",
            }}>
              {sendResult.ok
                ? `✅ Отправлено: ${sendResult.sent ?? 0} из ${sendResult.total ?? sendResult.sent ?? 0} устройств`
                : `❌ Ошибка: ${sendResult.error}`}
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === "history" && (
        <div>
          {logsLoading ? (
            <p style={{ color: "#666" }}>Загрузка…</p>
          ) : logs.length === 0 ? (
            <p style={{ color: "#666" }}>История пуста</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e8e8e8" }}>
                  {["Тип", "Отправлено", "Дата"].map((h) => (
                    <th
                      key={h}
                      style={{ textAlign: "left", padding: "8px 12px", color: "#555", fontWeight: 600 }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 500,
                        background:
                          log.type === "catalog" ? "#dbeafe" :
                          log.type === "promo"   ? "#fef9c3" : "#f3f4f6",
                        color:
                          log.type === "catalog" ? "#1d4ed8" :
                          log.type === "promo"   ? "#854d0e" : "#374151",
                      }}>
                        {log.type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{log.sent_count}</td>
                    <td style={{ padding: "10px 12px", color: "#666" }}>
                      {new Date(log.created_at).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

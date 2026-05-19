"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./notifications.module.css";

type BroadcastType = "promo" | "system";
type CtaAction = "none" | "subscription" | "catalog";

interface LogEntry {
  id: string;
  type: string;
  reference_id: string | null;
  sent_count: number;
  created_at: string;
}

const broadcastTypes: Array<{ value: BroadcastType; label: string; caption: string }> = [
  { value: "promo", label: "Promo", caption: "Акции и обновления" },
  { value: "system", label: "System", caption: "Сервисные сообщения" },
];

const ctaOptions: Array<{ value: CtaAction; label: string }> = [
  { value: "none", label: "Без кнопки" },
  { value: "subscription", label: "Подписка" },
  { value: "catalog", label: "Каталог" },
];

const logTypeLabels: Record<string, string> = {
  catalog: "Catalog",
  promo: "Promo",
  system: "System",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<"send" | "history">("send");

  const [type, setType] = useState<BroadcastType>("promo");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaAction, setCtaAction] = useState<CtaAction>("none");
  const [ctaTitle, setCtaTitle] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    sent?: number;
    failed?: number;
    total?: number;
    reason?: string;
    error?: string;
    failures?: Array<{ tokenSuffix: string; reason: string; status?: number; error?: string }>;
  } | null>(null);

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
      const trimmedImageUrl = imageUrl.trim();
      const trimmedCtaTitle = ctaTitle.trim();

      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          type,
          imageUrl: trimmedImageUrl || null,
          ctaAction: ctaAction === "none" ? null : ctaAction,
          ctaTitle: trimmedCtaTitle || null,
        }),
      });
      const data = await res.json();
      setSendResult(data);
      if (data.ok) {
        setTitle("");
        setBody("");
        setImageUrl("");
        setCtaAction("none");
        setCtaTitle("");
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

  const hasValidImageUrl = (() => {
    const value = imageUrl.trim();
    if (!value) return false;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  })();

  const resultText = sendResult?.ok
    ? `Отправлено: ${sendResult.sent ?? 0} из ${sendResult.total ?? sendResult.sent ?? 0} устройств${
        sendResult.failed
          ? `, ошибок: ${sendResult.failed}: ${sendResult.failures?.[0]?.reason ?? "Unknown"}`
          : ""
      }${sendResult.reason ? `: ${sendResult.reason}` : ""}`
    : `Ошибка: ${sendResult?.error ?? "Unknown"}`;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.kicker}>Admin / Notifications</div>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.title}>Уведомления</h1>
            <p className={styles.subtitle}>
              Управление массовыми push-рассылками, сервисными сообщениями и ежедневной отправкой
              новых каталогов.
            </p>
          </div>
          <div className={styles.heroMeta} aria-label="Статус канала">
            <span className={styles.inverseBadge}>APNs</span>
            <span className={styles.outlineBadge}>Production</span>
          </div>
        </div>
      </header>

      <div className={styles.tabBar} role="tablist" aria-label="Разделы уведомлений">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "send"}
          className={`${styles.tabButton} ${tab === "send" ? styles.tabButtonActive : ""}`}
          onClick={() => setTab("send")}
        >
          Отправить
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={`${styles.tabButton} ${tab === "history" ? styles.tabButtonActive : ""}`}
          onClick={() => setTab("history")}
        >
          История
        </button>
      </div>

      {tab === "send" && (
        <div className={styles.sendGrid}>
          <form className={`${styles.card} ${styles.formCard}`} onSubmit={handleSend}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Broadcast</p>
                <h2 className={styles.cardTitle}>Рассылка пользователям</h2>
              </div>
              <span className={styles.neutralBadge}>{type}</span>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Тип сообщения</label>
              <div className={styles.segmentGroup}>
                {broadcastTypes.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.segmentButton} ${
                      type === option.value ? styles.segmentButtonActive : ""
                    }`}
                    onClick={() => setType(option.value)}
                    aria-pressed={type === option.value}
                  >
                    <span>{option.label}</span>
                    <small>{option.caption}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="notification-title">
                Заголовок
              </label>
              <input
                id="notification-title"
                className={styles.input}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Заголовок уведомления"
                required
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="notification-body">
                Текст
              </label>
              <textarea
                id="notification-body"
                className={`${styles.input} ${styles.textarea}`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Текст уведомления"
                required
                rows={4}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="notification-image">
                URL изображения
              </label>
              <input
                id="notification-image"
                className={styles.input}
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
              <p className={styles.hint}>
                Поле опционально. Если пусто, сообщение откроется без hero-изображения.
              </p>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Целевое действие кнопки</label>
              <div className={styles.pillGroup}>
                {ctaOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.pillButton} ${
                      ctaAction === option.value ? styles.pillButtonActive : ""
                    }`}
                    onClick={() => setCtaAction(option.value)}
                    aria-pressed={ctaAction === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className={styles.hint}>
                Кнопка внизу открытого сообщения появится только если здесь выбран переход.
              </p>
            </div>

            {ctaAction !== "none" && (
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="notification-cta">
                  Текст кнопки
                </label>
                <input
                  id="notification-cta"
                  className={styles.input}
                  type="text"
                  value={ctaTitle}
                  onChange={(e) => setCtaTitle(e.target.value)}
                  placeholder={ctaAction === "subscription" ? "Открыть подписку" : "Открыть каталог"}
                />
                <p className={styles.hint}>
                  Поле опционально. Если пусто, приложение подставит дефолтный текст.
                </p>
              </div>
            )}

            <div className={styles.formFooter}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={sending || !title.trim() || !body.trim()}
              >
                {sending ? "Отправка..." : "Отправить всем"}
              </button>
              <span className={styles.footerHint}>Отправка идет по пользователям с активными токенами.</span>
            </div>

            {sendResult && (
              <div className={`${styles.resultBox} ${sendResult.ok ? styles.resultSuccess : styles.resultError}`}>
                {resultText}
              </div>
            )}
          </form>

          <aside className={styles.sideStack}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>Catalog Automation</p>
                  <h2 className={styles.cardTitle}>Новые каталоги</h2>
                </div>
                <span className={styles.outlineBadge}>Cron</span>
              </div>
              <p className={styles.cardText}>
                Найти новые каталоги добавленные за последние 25ч и отправить пуш. Запускается
                автоматически Vercel Cron в 10:00 UTC.
              </p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleCatalogPing}
                disabled={sending}
              >
                {sending ? "Отправка..." : "Запустить вручную"}
              </button>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>Preview</p>
                  <h2 className={styles.cardTitle}>Карточка сообщения</h2>
                </div>
              </div>

              <div className={styles.preview}>
                {hasValidImageUrl && (
                  <img className={styles.previewImage} src={imageUrl.trim()} alt="Preview" />
                )}
                <div className={styles.previewContent}>
                  <div className={styles.previewTopline}>
                    <span className={styles.inverseBadge}>{type}</span>
                    {ctaAction !== "none" && <span className={styles.neutralBadge}>{ctaAction}</span>}
                  </div>
                  <h3>{title.trim() || "Заголовок уведомления"}</h3>
                  <p>{body.trim() || "Текст сообщения будет показан здесь перед отправкой."}</p>
                  {ctaAction !== "none" && (
                    <div className={styles.previewCta}>
                      {ctaTitle.trim() || (ctaAction === "subscription" ? "Открыть подписку" : "Открыть каталог")}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === "history" && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Delivery Log</p>
              <h2 className={styles.cardTitle}>История отправок</h2>
            </div>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={loadLogs}
              disabled={logsLoading}
            >
              {logsLoading ? "Обновление..." : "Обновить"}
            </button>
          </div>

          {logsLoading ? (
            <div className={styles.emptyState}>Загрузка истории...</div>
          ) : logs.length === 0 ? (
            <div className={styles.emptyState}>История пуста</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Reference</th>
                    <th>Отправлено</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <span className={styles.neutralBadge}>{logTypeLabels[log.type] ?? log.type}</span>
                      </td>
                      <td className={styles.monoCell}>{log.reference_id ?? "-"}</td>
                      <td>{log.sent_count}</td>
                      <td className={styles.mutedCell}>{formatDate(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./social-monitor.module.css";

type TabKey = "feed" | "settings" | "analytics" | "trends";

type TrendRow = {
  id: string;
  topic: string;
  mention_count: number;
  window_count: number;
  previous_window_count: number;
  growth_ratio: number;
  is_trending: boolean;
  sample_post_url: string | null;
  sample_post_text: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

type MonitorSettings = {
  product_name: string;
  product_description: string;
  core_features: string[];
  target_audience: string;
  competitors: string[];
  extra_context: string;
  enabled_sources: string[];
  check_interval_minutes: number;
  high_score_threshold: number;
  notifications_enabled: boolean;
  last_scan_at: string | null;
  next_scan_at: string | null;
};

type MonitorSource = {
  id: string;
  name: string;
  enabled: boolean;
  status: "connected" | "not_configured" | "error";
  auth_type: string;
  config?: Record<string, unknown>;
  last_checked_at: string | null;
};

type MonitorPost = {
  id: string;
  source: string;
  author_name: string | null;
  author_handle: string | null;
  author_url: string | null;
  country: string | null;
  language: string | null;
  posted_at: string | null;
  text: string;
  text_translation: string | null;
  original_url: string;
  ai_score: number;
  ai_summary: string;
  ai_reason: string;
  ai_problem: string;
  ai_goal: string;
  ai_emotion: string;
  ai_conversion_probability: number;
  ai_should_reply: boolean;
  ai_reply: string;
  detected_competitors: string[];
  reply_status: string;
  feedback: "useful" | "not_useful" | null;
  status: string;
  created_at: string;
};

type RunRow = {
  id: string;
  status: string;
  manual: boolean;
  started_at: string;
  finished_at: string | null;
  sources_checked: string[];
  posts_found: number;
  posts_analyzed: number;
  error: string | null;
};

type Analytics = {
  totals: {
    posts: number;
    prospects: number;
    high_intent: number;
    found_24h: number;
    useful: number;
    not_useful: number;
    with_reply: number;
    unseen_notifications: number;
  };
  top_sources: Array<{ key: string; count: number }>;
  top_languages: Array<{ key: string; count: number }>;
  top_countries: Array<{ key: string; count: number }>;
  top_problems: Array<{ key: string; count: number }>;
  top_competitors: Array<{ key: string; count: number }>;
  runs: RunRow[];
};

const blankSettings: MonitorSettings = {
  product_name: "Dishday",
  product_description: "",
  core_features: [],
  target_audience: "",
  competitors: [],
  extra_context: "",
  enabled_sources: ["reddit"],
  check_interval_minutes: 180,
  high_score_threshold: 78,
  notifications_enabled: true,
  last_scan_at: null,
  next_scan_at: null,
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const asLines = (items: string[]) => items.join("\n");

const fromLines = (value: string) =>
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const scoreTone = (score: number) => {
  if (score >= 80) return styles.scoreHigh;
  if (score >= 55) return styles.scoreMedium;
  return styles.scoreLow;
};

export default function SocialMonitorPage() {
  const [tab, setTab] = useState<TabKey>("feed");
  const [settings, setSettings] = useState<MonitorSettings>(blankSettings);
  const [sources, setSources] = useState<MonitorSource[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [posts, setPosts] = useState<MonitorPost[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<MonitorPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("");
  const [semantic, setSemantic] = useState(false);

  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [feedbackFilter, setFeedbackFilter] = useState("");
  const [hasReplyFilter, setHasReplyFilter] = useState("");
  const [minScore, setMinScore] = useState("0");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [featuresText, setFeaturesText] = useState("");
  const [competitorsText, setCompetitorsText] = useState("");

  const loadConfig = useCallback(async () => {
    const response = await fetch("/api/admin/social-monitor/config");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось загрузить настройки");
    setSettings(data.settings);
    setSources(data.sources || []);
    setRuns(data.runs || []);
    setFeaturesText(asLines(data.settings.core_features || []));
    setCompetitorsText(asLines(data.settings.competitors || []));
  }, []);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (query.trim()) params.set("q", query.trim());
      if (sourceFilter) params.set("source", sourceFilter);
      if (languageFilter) params.set("language", languageFilter);
      if (countryFilter) params.set("country", countryFilter);
      if (feedbackFilter) params.set("feedback", feedbackFilter);
      if (hasReplyFilter) params.set("hasReply", hasReplyFilter);
      if (minScore) params.set("minScore", minScore);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const response = await fetch(`/api/admin/social-monitor/posts?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить публикации");
      setPosts(data.data || []);
      setSemantic(Boolean(data.semantic));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setPostsLoading(false);
    }
  }, [countryFilter, dateFrom, dateTo, feedbackFilter, hasReplyFilter, languageFilter, minScore, query, sourceFilter]);

  const loadAnalytics = useCallback(async () => {
    const response = await fetch("/api/admin/social-monitor/analytics");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось загрузить аналитику");
    setAnalytics(data);
  }, []);

  const loadTrends = useCallback(async () => {
    setTrendsLoading(true);
    try {
      const response = await fetch("/api/admin/social-monitor/trends?limit=100");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить тренды");
      setTrends(data.data || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setStatus("");
      try {
        await loadConfig();
        await loadAnalytics();
      } catch (error) {
        if (mounted) setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadAnalytics, loadConfig]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    if (tab === "trends") void loadTrends();
  }, [tab, loadTrends]);

  const uniqueLanguages = useMemo(
    () => Array.from(new Set(posts.map((post) => post.language).filter(Boolean))).sort() as string[],
    [posts]
  );
  const uniqueCountries = useMemo(
    () => Array.from(new Set(posts.map((post) => post.country).filter(Boolean))).sort() as string[],
    [posts]
  );

  const summary = useMemo(() => {
    const high = posts.filter((post) => post.ai_score >= settings.high_score_threshold).length;
    const shouldReply = posts.filter((post) => post.ai_should_reply).length;
    const average = posts.length
      ? Math.round(posts.reduce((sum, post) => sum + post.ai_score, 0) / posts.length)
      : 0;
    return { high, shouldReply, average };
  }, [posts, settings.high_score_threshold]);

  async function saveSettings() {
    setSaving(true);
    setStatus("");
    try {
      const payload = {
        ...settings,
        core_features: fromLines(featuresText),
        competitors: fromLines(competitorsText),
      };
      const response = await fetch("/api/admin/social-monitor/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить");
      setSettings(data.settings);
      setSources(data.sources || []);
      setStatus("Настройки сохранены");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function runScan() {
    setScanning(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/social-monitor/scan", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Сканирование не выполнено");
      setStatus(`Сканирование завершено: новых публикаций ${data.posts_found}, проанализировано ${data.posts_analyzed}`);
      await Promise.all([loadConfig(), loadPosts(), loadAnalytics()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  }

  async function updatePost(post: MonitorPost, update: Record<string, unknown>) {
    const response = await fetch(`/api/admin/social-monitor/posts/${post.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось обновить публикацию");
    setPosts((current) => current.map((item) => (item.id === post.id ? { ...item, ...data.post } : item)));
    setSelectedPost((current) => (current?.id === post.id ? { ...current, ...data.post } : current));
  }

  async function copyReply(post: MonitorPost) {
    if (!post.ai_reply) return;
    await navigator.clipboard.writeText(post.ai_reply);
    await updatePost(post, { reply_status: "copied", status: "reviewed" });
  }

  const renderFeed = () => (
    <div className={styles.feedLayout}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Discovery Feed</p>
            <h2 className={styles.cardTitle}>Найденные публикации</h2>
          </div>
          <button className={styles.primaryButton} type="button" onClick={runScan} disabled={scanning}>
            {scanning ? "Сканирование..." : "Запустить scan"}
          </button>
        </div>

        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            void loadPosts();
          }}
        >
          <label className={styles.searchField}>
            <span>Смысловой поиск</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="люди не знают что приготовить"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            <span>Источник</span>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="">Все</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Язык</span>
            <select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
              <option value="">Все</option>
              {uniqueLanguages.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Страна</span>
            <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}>
              <option value="">Все</option>
              {uniqueCountries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Минимум AI</span>
            <input type="number" min="0" max="100" value={minScore} onChange={(event) => setMinScore(event.target.value)} />
          </label>
          <label>
            <span>Ответ</span>
            <select value={hasReplyFilter} onChange={(event) => setHasReplyFilter(event.target.value)}>
              <option value="">Все</option>
              <option value="true">Есть</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label>
            <span>Оценка</span>
            <select value={feedbackFilter} onChange={(event) => setFeedbackFilter(event.target.value)}>
              <option value="">Все</option>
              <option value="useful">Полезные</option>
              <option value="not_useful">Бесполезные</option>
            </select>
          </label>
          <label>
            <span>От</span>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>
            <span>До</span>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <button className={styles.secondaryButton} type="submit" disabled={postsLoading}>
            {postsLoading ? "Поиск..." : "Применить"}
          </button>
        </form>

        <div className={styles.feedMeta}>
          <span>{posts.length} публикаций</span>
          <span>{summary.high} high-intent</span>
          <span>{summary.shouldReply} с рекомендацией ответить</span>
          <span>Средний score {summary.average}</span>
          {semantic && <span className={styles.semanticBadge}>semantic</span>}
        </div>

        {postsLoading ? (
          <div className={styles.emptyState}>Загрузка публикаций...</div>
        ) : posts.length === 0 ? (
          <div className={styles.emptyState}>Публикации пока не найдены. Заполните настройки и запустите scan.</div>
        ) : (
          <div className={styles.postList}>
            {posts.map((post) => (
              <button
                key={post.id}
                type="button"
                className={`${styles.postRow} ${selectedPost?.id === post.id ? styles.postRowActive : ""}`}
                onClick={() => setSelectedPost(post)}
              >
                <div className={`${styles.score} ${scoreTone(post.ai_score)}`}>{post.ai_score}</div>
                <div className={styles.postMain}>
                  <div className={styles.postTopline}>
                    <span className={styles.badge}>{post.source}</span>
                    <span>{post.author_handle || post.author_name || "Unknown author"}</span>
                    <span>{post.language || "?"}</span>
                    <span>{formatDateTime(post.posted_at || post.created_at)}</span>
                  </div>
                  <p className={styles.postText}>{post.text}</p>
                  <p className={styles.postReason}>{post.ai_summary}</p>
                </div>
                <div className={styles.rowFlags}>
                  {post.ai_should_reply && <span className={styles.replyBadge}>reply</span>}
                  {post.feedback && <span className={styles.mutedBadge}>{post.feedback}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <aside className={styles.detailPanel}>
        {selectedPost ? (
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Post Detail</p>
                <h2 className={styles.cardTitle}>{selectedPost.author_handle || selectedPost.author_name || "Автор"}</h2>
              </div>
              <div className={`${styles.score} ${scoreTone(selectedPost.ai_score)}`}>{selectedPost.ai_score}</div>
            </div>

            <div className={styles.detailStack}>
              <div>
                <p className={styles.label}>Оригинальный текст</p>
                <p className={styles.fullText}>{selectedPost.text}</p>
              </div>
              {selectedPost.text_translation && (
                <div>
                  <p className={styles.label}>Перевод</p>
                  <p className={styles.fullText}>{selectedPost.text_translation}</p>
                </div>
              )}
              <div className={styles.analysisGrid}>
                <div>
                  <span>Проблема</span>
                  <strong>{selectedPost.ai_problem || "-"}</strong>
                </div>
                <div>
                  <span>Цель</span>
                  <strong>{selectedPost.ai_goal || "-"}</strong>
                </div>
                <div>
                  <span>Эмоция</span>
                  <strong>{selectedPost.ai_emotion || "-"}</strong>
                </div>
                <div>
                  <span>Конверсия</span>
                  <strong>{selectedPost.ai_conversion_probability}%</strong>
                </div>
              </div>
              <div>
                <p className={styles.label}>Почему найдено</p>
                <p className={styles.fullText}>{selectedPost.ai_reason || selectedPost.ai_summary}</p>
              </div>
              <div className={styles.replyBox}>
                <div className={styles.replyHeader}>
                  <p className={styles.label}>Предложенный ответ</p>
                  <span className={selectedPost.ai_should_reply ? styles.replyBadge : styles.mutedBadge}>
                    {selectedPost.ai_should_reply ? "стоит ответить" : "не обязательно"}
                  </span>
                </div>
                <p>{selectedPost.ai_reply || "AI не предложил ответ для этой публикации."}</p>
                <div className={styles.actionRow}>
                  <button className={styles.primaryButton} type="button" onClick={() => copyReply(selectedPost)} disabled={!selectedPost.ai_reply}>
                    Скопировать
                  </button>
                  <a className={styles.linkButton} href={selectedPost.original_url} target="_blank" rel="noreferrer">
                    Открыть пост
                  </a>
                </div>
              </div>
              <div className={styles.actionRow}>
                <button className={styles.secondaryButton} type="button" onClick={() => updatePost(selectedPost, { feedback: "useful", status: "reviewed" })}>
                  Полезно
                </button>
                <button className={styles.ghostButton} type="button" onClick={() => updatePost(selectedPost, { feedback: "not_useful", status: "reviewed" })}>
                  Бесполезно
                </button>
                <button className={styles.ghostButton} type="button" onClick={() => updatePost(selectedPost, { status: "archived" })}>
                  В архив
                </button>
              </div>
            </div>
          </article>
        ) : (
          <section className={styles.card}>
            <p className={styles.eyebrow}>Post Detail</p>
            <h2 className={styles.cardTitle}>Выберите публикацию</h2>
            <p className={styles.cardText}>Здесь появится полный текст, AI-анализ, перевод и готовый вариант ответа.</p>
          </section>
        )}
      </aside>
    </div>
  );

  const renderSettings = () => (
    <div className={styles.settingsGrid}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Product Intelligence</p>
            <h2 className={styles.cardTitle}>Информация о продукте</h2>
          </div>
          <button className={styles.primaryButton} type="button" onClick={saveSettings} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>

        <div className={styles.formGrid}>
          <label>
            <span>Название приложения</span>
            <input
              value={settings.product_name}
              onChange={(event) => setSettings({ ...settings, product_name: event.target.value })}
              placeholder="Dishday"
            />
          </label>
          <label>
            <span>Интервал проверки, минут</span>
            <input
              type="number"
              min="15"
              value={settings.check_interval_minutes}
              onChange={(event) => setSettings({ ...settings, check_interval_minutes: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Порог уведомлений</span>
            <input
              type="number"
              min="0"
              max="100"
              value={settings.high_score_threshold}
              onChange={(event) => setSettings({ ...settings, high_score_threshold: Number(event.target.value) })}
            />
          </label>
          <label className={styles.wideField}>
            <span>Описание</span>
            <textarea
              value={settings.product_description}
              onChange={(event) => setSettings({ ...settings, product_description: event.target.value })}
              rows={4}
            />
          </label>
          <label className={styles.wideField}>
            <span>Основные функции</span>
            <textarea value={featuresText} onChange={(event) => setFeaturesText(event.target.value)} rows={5} />
          </label>
          <label className={styles.wideField}>
            <span>Целевая аудитория</span>
            <textarea
              value={settings.target_audience}
              onChange={(event) => setSettings({ ...settings, target_audience: event.target.value })}
              rows={3}
            />
          </label>
          <label className={styles.wideField}>
            <span>Конкуренты</span>
            <textarea value={competitorsText} onChange={(event) => setCompetitorsText(event.target.value)} rows={4} />
          </label>
          <label className={styles.wideField}>
            <span>Дополнительный контекст для AI</span>
            <textarea
              value={settings.extra_context}
              onChange={(event) => setSettings({ ...settings, extra_context: event.target.value })}
              rows={4}
            />
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={settings.notifications_enabled}
              onChange={(event) => setSettings({ ...settings, notifications_enabled: event.target.checked })}
            />
            <span>Создавать уведомления для публикаций выше порога</span>
          </label>
        </div>
      </section>

      <aside className={styles.sideStack}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Sources</p>
          <h2 className={styles.cardTitle}>Подключенные источники</h2>
          <div className={styles.sourceList}>
            {sources.map((source) => {
              const enabled = settings.enabled_sources.includes(source.id);
              return (
                <label key={source.id} className={styles.sourceItem}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...settings.enabled_sources, source.id]
                        : settings.enabled_sources.filter((id) => id !== source.id);
                      setSettings({ ...settings, enabled_sources: Array.from(new Set(next)) });
                    }}
                  />
                  <span>
                    <strong>{source.name}</strong>
                    <small>
                      {source.status} / {source.auth_type}
                      {source.id === "threads"
                        ? ` / env: ${String(source.config?.access_token_env || "THREADS_ACCESS_TOKEN")}`
                        : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className={styles.card}>
          <p className={styles.eyebrow}>Scheduler</p>
          <h2 className={styles.cardTitle}>Фоновая проверка</h2>
          <div className={styles.metricList}>
            <div>
              <span>Последний scan</span>
              <strong>{formatDateTime(settings.last_scan_at)}</strong>
            </div>
            <div>
              <span>Следующий scan</span>
              <strong>{formatDateTime(settings.next_scan_at)}</strong>
            </div>
          </div>
          <button className={styles.secondaryButton} type="button" onClick={runScan} disabled={scanning}>
            {scanning ? "Сканирование..." : "Запустить вручную"}
          </button>
        </section>
      </aside>
    </div>
  );

  const renderTrends = () => (
    <div className={styles.feedLayout}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Threads Trend Discovery</p>
            <h2 className={styles.cardTitle}>Трендовые темы</h2>
          </div>
          <button className={styles.primaryButton} type="button" onClick={loadTrends} disabled={trendsLoading}>
            {trendsLoading ? "Загрузка..." : "Обновить"}
          </button>
        </div>
        <p className={styles.cardText}>
          Threads не даёт официального API трендов, поэтому мы сами считаем частоту упоминаний тем в
          собранных постах (по широким seed-запросам вроде «recipe», «viral recipe», «cooking hack») и
          сравниваем прогон к прогону. Тема помечается как 🔥 trending, если упоминаний ≥ {" "}
          {3} за один scan и рост ≥ 2.5x к предыдущему scan-у. При появлении новой трендовой темы создаётся
          уведомление.
        </p>

        {trendsLoading ? (
          <div className={styles.emptyState}>Загрузка трендов...</div>
        ) : trends.length === 0 ? (
          <div className={styles.emptyState}>
            Пока нет данных. Включите источник Threads в настройках и запустите scan хотя бы дважды —
            тренд считается по росту между прогонами.
          </div>
        ) : (
          <div className={styles.postList}>
            {trends.map((trend) => (
              <div key={trend.id} className={styles.postRow}>
                <div className={`${styles.score} ${trend.is_trending ? styles.scoreHigh : styles.scoreMedium}`}>
                  {trend.window_count}
                </div>
                <div className={styles.postMain}>
                  <div className={styles.postTopline}>
                    {trend.is_trending && <span className={styles.replyBadge}>🔥 trending</span>}
                    <span className={styles.badge}>x{trend.growth_ratio.toFixed(1)} рост</span>
                    <span>всего упоминаний: {trend.mention_count}</span>
                    <span>последний раз: {formatDateTime(trend.last_seen_at)}</span>
                  </div>
                  <p className={styles.postText}>{trend.topic}</p>
                  {trend.sample_post_text && <p className={styles.postReason}>{trend.sample_post_text}</p>}
                  {trend.sample_post_url && (
                    <a className={styles.linkButton} href={trend.sample_post_url} target="_blank" rel="noreferrer">
                      Открыть пример поста
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const renderAnalytics = () => (
    <div className={styles.analyticsGrid}>
      <section className={`${styles.card} ${styles.wideAnalytics}`}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Analytics</p>
            <h2 className={styles.cardTitle}>Сводка</h2>
          </div>
          <button className={styles.ghostButton} type="button" onClick={loadAnalytics}>
            Обновить
          </button>
        </div>
        <div className={styles.kpiGrid}>
          <div><span>Публикации</span><strong>{analytics?.totals.posts ?? 0}</strong></div>
          <div><span>Потенциальные клиенты</span><strong>{analytics?.totals.prospects ?? 0}</strong></div>
          <div><span>High intent</span><strong>{analytics?.totals.high_intent ?? 0}</strong></div>
          <div><span>За 24ч</span><strong>{analytics?.totals.found_24h ?? 0}</strong></div>
          <div><span>Полезные</span><strong>{analytics?.totals.useful ?? 0}</strong></div>
          <div><span>С ответом</span><strong>{analytics?.totals.with_reply ?? 0}</strong></div>
        </div>
      </section>
      <TopList title="Проблемы пользователей" items={analytics?.top_problems || []} />
      <TopList title="Источники" items={analytics?.top_sources || []} />
      <TopList title="Страны" items={analytics?.top_countries || []} />
      <TopList title="Языки" items={analytics?.top_languages || []} />
      <TopList title="Конкуренты" items={analytics?.top_competitors || []} />
      <section className={`${styles.card} ${styles.wideAnalytics}`}>
        <p className={styles.eyebrow}>Runs</p>
        <h2 className={styles.cardTitle}>История запусков</h2>
        <div className={styles.runList}>
          {(analytics?.runs || runs).map((run) => (
            <div key={run.id} className={styles.runRow}>
              <span className={styles.badge}>{run.status}</span>
              <span>{run.manual ? "manual" : "cron"}</span>
              <span>{formatDateTime(run.started_at)}</span>
              <strong>{run.posts_analyzed} analyzed</strong>
              {run.error && <span className={styles.errorText}>{run.error}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>Admin / AI Social Monitor</p>
          <h1>AI Social Monitor</h1>
          <p>
            Фоновый поиск людей в социальных сетях, которым может быть полезен Dishday:
            генерация запросов, AI-анализ, score, ответы, история и аналитика.
          </p>
        </div>
        <div className={styles.heroActions}>
          <span className={styles.statusPill}>Threshold {settings.high_score_threshold}</span>
          <button className={styles.primaryButton} type="button" onClick={runScan} disabled={scanning}>
            {scanning ? "Scan..." : "Scan now"}
          </button>
        </div>
      </header>

      <div className={styles.tabBar} role="tablist" aria-label="AI Social Monitor">
        <button type="button" role="tab" aria-selected={tab === "feed"} className={tab === "feed" ? styles.tabActive : ""} onClick={() => setTab("feed")}>
          Лента
        </button>
        <button type="button" role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? styles.tabActive : ""} onClick={() => setTab("settings")}>
          Настройки
        </button>
        <button type="button" role="tab" aria-selected={tab === "analytics"} className={tab === "analytics" ? styles.tabActive : ""} onClick={() => setTab("analytics")}>
          Аналитика
        </button>
        <button type="button" role="tab" aria-selected={tab === "trends"} className={tab === "trends" ? styles.tabActive : ""} onClick={() => setTab("trends")}>
          Тренды
        </button>
      </div>

      {status && <div className={styles.statusBox}>{status}</div>}
      {loading ? (
        <div className={styles.emptyState}>Загрузка AI Social Monitor...</div>
      ) : (
        <>
          {tab === "feed" && renderFeed()}
          {tab === "settings" && renderSettings()}
          {tab === "analytics" && renderAnalytics()}
          {tab === "trends" && renderTrends()}
        </>
      )}
    </div>
  );
}

function TopList({ title, items }: { title: string; items: Array<{ key: string; count: number }> }) {
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>Top</p>
      <h2 className={styles.cardTitle}>{title}</h2>
      <div className={styles.topList}>
        {items.length === 0 ? (
          <div className={styles.emptyInline}>Нет данных</div>
        ) : (
          items.map((item) => (
            <div key={item.key}>
              <span>{item.key}</span>
              <strong>{item.count}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

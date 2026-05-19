"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./reviews-moderation.module.css";

type TargetType = "recipe_review" | "cuisine_review";

type Profile = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type Review = {
  id: string;
  target_type: TargetType;
  user_id: string;
  rating: number;
  review_text?: string | null;
  created_at: string;
  moderation_status?: string;
  is_hidden?: boolean;
  reported_count?: number;
  author?: Profile | null;
  source?: { id: string; title?: string | null; name?: string | null } | null;
};

type ReviewReport = {
  id: string;
  target_type: TargetType;
  recipe_review_id?: string | null;
  cuisine_review_id?: string | null;
  reported_by: string;
  reason: string;
  status: string;
  created_at: string;
  reporter?: Profile | null;
  review?: Review | null;
};

type Tab = "reports" | "reviews";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function authorName(profile?: Profile | null) {
  return profile?.name || profile?.email || "Без имени";
}

function sourceTitle(review?: Review | null) {
  if (!review?.source) return "Источник не найден";
  return review.source.title || review.source.name || "Без названия";
}

function typeLabel(type: TargetType) {
  return type === "recipe_review" ? "Рецепт" : "Каталог";
}

function actionSuccessMessage(action: "hide" | "restore" | "dismiss" | "block_author") {
  switch (action) {
    case "hide":
      return "Отзыв скрыт";
    case "restore":
      return "Отзыв возвращён";
    case "dismiss":
      return "Жалоба отклонена";
    case "block_author":
      return "Автор заблокирован";
  }
}

function isReviewHidden(review?: Review | null) {
  return Boolean(review?.is_hidden || review?.moderation_status === "rejected");
}

export default function ReviewsModerationPage() {
  const [tab, setTab] = useState<Tab>("reports");
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setStatus("");

    try {
      const url = tab === "reports"
        ? "/api/admin/review-reports?mode=reports&status=pending&limit=200"
        : "/api/admin/review-reports?mode=reviews&limit=200";

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        setStatus(`Ошибка: ${data.error || "не удалось загрузить данные"}`);
        return;
      }

      if (tab === "reports") {
        setReports(data.reports || []);
      } else {
        setReviews(data.reviews || []);
      }
    } catch {
      setStatus("Ошибка: не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const hiddenReviews = reviews.filter(isReviewHidden).length;
    const reportedReviews = reviews.filter((review) => (review.reported_count || 0) > 0).length;
    return {
      reports: reports.length,
      reviews: reviews.length,
      hiddenReviews,
      reportedReviews,
    };
  }, [reports, reviews]);

  async function runAction(params: {
    action: "hide" | "restore" | "dismiss" | "block_author";
    reportId?: string;
    review?: Review | null;
  }) {
    if (!params.review && params.action !== "dismiss") return;

    const id = params.reportId || params.review?.id || params.action;
    setBusyId(id);
    setStatus("");

    try {
      const res = await fetch("/api/admin/review-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: params.action,
          reportId: params.reportId,
          targetType: params.review?.target_type,
          reviewId: params.review?.id,
          authorId: params.review?.user_id,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(`Ошибка: ${data.error || "действие не выполнено"}`);
        return;
      }

      await loadData();
      setStatus(actionSuccessMessage(params.action));
    } catch {
      setStatus("Ошибка: не удалось выполнить действие");
    } finally {
      setBusyId(null);
    }
  }

  const activeItems = tab === "reports" ? reports : reviews;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.kicker}>Admin / Review Moderation</div>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.title}>Модерация отзывов</h1>
            <p className={styles.subtitle}>
              Очередь жалоб и полный список текстовых отзывов с быстрыми действиями: скрыть,
              вернуть, отклонить жалобу или заблокировать автора.
            </p>
          </div>
          <div className={styles.heroBadges}>
            <span className={styles.inverseBadge}>Moderation</span>
            <span className={styles.outlineBadge}>200 latest</span>
          </div>
        </div>
      </header>

      <section className={styles.metricsGrid} aria-label="Сводка модерации">
        <MetricCard value={String(metrics.reports)} label="pending reports" />
        <MetricCard value={String(metrics.reviews)} label="reviews loaded" />
        <MetricCard value={String(metrics.reportedReviews)} label="reported reviews" />
        <MetricCard value={String(metrics.hiddenReviews)} label="hidden reviews" />
      </section>

      <div className={styles.toolbar}>
        <div className={styles.tabBar} role="tablist" aria-label="Разделы модерации">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "reports"}
            className={`${styles.tabButton} ${tab === "reports" ? styles.tabButtonActive : ""}`}
            onClick={() => setTab("reports")}
          >
            Жалобы
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "reviews"}
            className={`${styles.tabButton} ${tab === "reviews" ? styles.tabButtonActive : ""}`}
            onClick={() => setTab("reviews")}
          >
            Все отзывы
          </button>
        </div>
        <button type="button" onClick={loadData} className={styles.secondaryButton} disabled={loading}>
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      {status && (
        <div className={`${styles.statusBox} ${status.startsWith("Ошибка") ? styles.statusError : ""}`}>
          {status}
        </div>
      )}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>{tab === "reports" ? "Reports Queue" : "Review Index"}</p>
            <h2>{tab === "reports" ? `Новые жалобы (${reports.length})` : `Все отзывы (${reviews.length})`}</h2>
          </div>
          <span className={styles.neutralBadge}>{tab === "reports" ? "pending" : "all statuses"}</span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Загрузка...</div>
        ) : activeItems.length === 0 ? (
          <div className={styles.emptyState}>{tab === "reports" ? "Жалоб пока нет." : "Отзывов пока нет."}</div>
        ) : (
          <div className={styles.reviewList}>
            {tab === "reports"
              ? reports.map((report) => (
                  <ReviewCard
                    key={report.id}
                    review={report.review}
                    report={report}
                    busy={busyId === report.id}
                    onHide={() => runAction({ action: "hide", reportId: report.id, review: report.review })}
                    onRestore={() => runAction({ action: "restore", reportId: report.id, review: report.review })}
                    onDismiss={() => runAction({ action: "dismiss", reportId: report.id, review: report.review })}
                    onBlockAuthor={() => runAction({ action: "block_author", reportId: report.id, review: report.review })}
                  />
                ))
              : reviews.map((review) => (
                  <ReviewCard
                    key={`${review.target_type}-${review.id}`}
                    review={review}
                    busy={busyId === review.id}
                    onHide={() => runAction({ action: "hide", review })}
                    onRestore={() => runAction({ action: "restore", review })}
                    onBlockAuthor={() => runAction({ action: "block_author", review })}
                  />
                ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}

function ReviewCard({
  review,
  report,
  busy,
  onHide,
  onRestore,
  onDismiss,
  onBlockAuthor,
}: {
  review?: Review | null;
  report?: ReviewReport;
  busy: boolean;
  onHide: () => void;
  onRestore: () => void;
  onDismiss?: () => void;
  onBlockAuthor: () => void;
}) {
  if (!review) {
    return (
      <article className={styles.reviewCard}>
        <div className={styles.reviewMain}>
          <div>
            <p className={styles.eyebrow}>Missing Review</p>
            <h3>Отзыв не найден</h3>
            {report && <p className={styles.mutedText}>Жалоба: {report.id}</p>}
          </div>
          {onDismiss && (
            <button className={styles.secondaryButton} disabled={busy} onClick={onDismiss}>
              Отклонить жалобу
            </button>
          )}
        </div>
      </article>
    );
  }

  const hidden = isReviewHidden(review);
  const reportMeta = report
    ? [
        `Статус: ${report.status}`,
        `От: ${authorName(report.reporter)}`,
        `Дата: ${formatDate(report.created_at)}`,
      ]
    : [];

  return (
    <article className={styles.reviewCard}>
      <div className={styles.reviewMain}>
        <div className={styles.reviewContent}>
          <div className={styles.badgeRow}>
            <span className={styles.neutralBadge}>{typeLabel(review.target_type)}</span>
            <span className={hidden ? styles.outlineDangerBadge : styles.inverseBadge}>
              {hidden ? "Скрыт" : "Показывается"}
            </span>
            <span className={styles.outlineBadge}>Rating {review.rating}/5</span>
            {review.reported_count ? (
              <span className={styles.outlineDangerBadge}>Жалоб: {review.reported_count}</span>
            ) : null}
          </div>

          <h3>{sourceTitle(review)}</h3>
          <p className={styles.mutedText}>
            Автор: {authorName(review.author)} / {formatDate(review.created_at)}
          </p>

          <div className={styles.reviewText}>
            {review.review_text || "Текста нет, только оценка."}
          </div>
        </div>

        {report && (
          <aside className={styles.reportPanel}>
            <p className={styles.eyebrow}>Report</p>
            <strong>{report.reason || "Причина не указана"}</strong>
            {reportMeta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </aside>
        )}
      </div>

      <div className={styles.actionsRow}>
        {hidden ? (
          <button className={styles.secondaryButton} disabled={busy} onClick={onRestore}>
            Вернуть отзыв
          </button>
        ) : (
          <button className={styles.dangerButton} disabled={busy} onClick={onHide}>
            Скрыть отзыв
          </button>
        )}
        <button className={styles.dangerButton} disabled={busy} onClick={onBlockAuthor}>
          Заблокировать автора
        </button>
        {onDismiss && (
          <button className={styles.ghostButton} disabled={busy} onClick={onDismiss}>
            Отклонить жалобу
          </button>
        )}
      </div>
    </article>
  );
}

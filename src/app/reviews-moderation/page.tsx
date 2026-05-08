"use client";

import { useCallback, useEffect, useState } from "react";

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
        ? "/api/admin/review-reports?mode=reports&status=all&limit=200"
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
    } catch {
      setStatus("Ошибка: не удалось выполнить действие");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Модерация отзывов</h1>
        <p className="section-subtitle">
          Здесь видны жалобы пользователей и все текстовые отзывы. Можно скрыть плохой отзыв или заблокировать автора.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => setTab("reports")}
          className={tab === "reports" ? "btn btn-primary" : "btn btn-secondary"}
        >
          Жалобы
        </button>
        <button
          onClick={() => setTab("reviews")}
          className={tab === "reviews" ? "btn btn-primary" : "btn btn-secondary"}
        >
          Все отзывы
        </button>
        <button onClick={loadData} className="btn btn-secondary" style={{ marginLeft: "auto" }}>
          Обновить
        </button>
      </div>

      {status && (
        <div style={{
          padding: 14,
          borderRadius: 12,
          marginBottom: 20,
          background: status.startsWith("Ошибка") ? "#fee2e2" : "#dcfce7",
          color: status.startsWith("Ошибка") ? "#991b1b" : "#166534",
        }}>
          {status}
        </div>
      )}

      {loading ? (
        <div className="section">Загрузка...</div>
      ) : tab === "reports" ? (
        <div className="section">
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
            Жалобы ({reports.length})
          </h2>
          {reports.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>Жалоб пока нет.</p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {reports.map((report) => (
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
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="section">
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
            Все отзывы ({reviews.length})
          </h2>
          {reviews.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>Отзывов пока нет.</p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {reviews.map((review) => (
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
        </div>
      )}
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
      <div className="card" style={{ padding: 18 }}>
        <strong>Отзыв не найден</strong>
        {report && <p style={{ marginTop: 8 }}>Жалоба: {report.id}</p>}
      </div>
    );
  }

  const hidden = review.is_hidden || review.moderation_status === "rejected";

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              padding: "4px 8px",
              borderRadius: 999,
              background: review.target_type === "recipe_review" ? "#dbeafe" : "#fce7f3",
              color: review.target_type === "recipe_review" ? "#1d4ed8" : "#be185d",
              fontSize: 13,
              fontWeight: 700,
            }}>
              {typeLabel(review.target_type)}
            </span>
            <span style={{
              padding: "4px 8px",
              borderRadius: 999,
              background: hidden ? "#fee2e2" : "#dcfce7",
              color: hidden ? "#991b1b" : "#166534",
              fontSize: 13,
              fontWeight: 700,
            }}>
              {hidden ? "Скрыт" : "Показывается"}
            </span>
            {review.reported_count ? (
              <span style={{ color: "#b45309", fontWeight: 700 }}>
                Жалоб: {review.reported_count}
              </span>
            ) : null}
          </div>

          <h3 style={{ marginTop: 12, fontSize: 20, fontWeight: 700 }}>
            {sourceTitle(review)}
          </h3>
          <p style={{ color: "var(--text-secondary)", marginTop: 4 }}>
            Автор: {authorName(review.author)} · Оценка: {review.rating}/5 · {formatDate(review.created_at)}
          </p>
        </div>

        {report && (
          <div style={{ minWidth: 220, textAlign: "right", color: "var(--text-secondary)" }}>
            <div>Жалоба: {report.status}</div>
            <div>{formatDate(report.created_at)}</div>
            <div>От: {authorName(report.reporter)}</div>
          </div>
        )}
      </div>

      <div style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 12,
        background: "var(--bg-secondary)",
        whiteSpace: "pre-wrap",
        lineHeight: 1.5,
      }}>
        {review.review_text || "Текста нет, только оценка."}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        {hidden ? (
          <button className="btn btn-secondary" disabled={busy} onClick={onRestore}>
            Вернуть отзыв
          </button>
        ) : (
          <button className="btn btn-danger" disabled={busy} onClick={onHide}>
            Скрыть отзыв
          </button>
        )}
        <button className="btn btn-danger" disabled={busy} onClick={onBlockAuthor}>
          Заблокировать автора
        </button>
        {onDismiss && (
          <button className="btn btn-secondary" disabled={busy} onClick={onDismiss}>
            Отклонить жалобу
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { ExternalLink, Image, Loader2, Search, X } from "lucide-react";
import styles from "./MagnificStockPicker.module.css";

interface StockResource {
  id: number;
  title: string;
  sourceUrl: string;
  previewUrl: string;
  imageType: string;
  orientation: string;
  imageSize: string | null;
  authorName: string | null;
  licenses: Array<{ type: string; url: string }>;
}

interface SelectedStockImage {
  url: string;
  alt: string;
}

export default function MagnificStockPicker({
  initialQuery,
  slugHint,
  language,
  disabled = false,
  onSelect,
}: {
  initialQuery: string;
  slugHint: string;
  language: string;
  disabled?: boolean;
  onSelect: (image: SelectedStockImage) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<StockResource[]>([]);
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setQuery(initialQuery);
  }, [initialQuery, isOpen]);

  const search = async (event?: FormEvent) => {
    event?.preventDefault();
    const term = query.trim();
    if (term.length < 2) {
      setError("Введите запрос минимум из двух символов.");
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/magnific/resources?q=${encodeURIComponent(term)}&lang=${encodeURIComponent(language)}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Поиск Magnific недоступен.");
      setResults(Array.isArray(payload.resources) ? payload.resources : []);
    } catch (searchError) {
      setResults([]);
      setError(searchError instanceof Error ? searchError.message : "Поиск Magnific недоступен.");
    } finally {
      setSearching(false);
    }
  };

  const importImage = async (resource: StockResource) => {
    setImportingId(resource.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/magnific/resources/${resource.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slugHint,
          language,
          title: resource.title,
          sourceUrl: resource.sourceUrl,
          authorName: resource.authorName,
          licenseUrl: resource.licenses[0]?.url || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || "Не удалось импортировать изображение.");
      await onSelect({ url: payload.url, alt: payload.alt || resource.title });
      setIsOpen(false);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Не удалось импортировать изображение.");
    } finally {
      setImportingId(null);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className={styles.openButton}
        disabled={disabled}
        onClick={() => setIsOpen(true)}
      >
        <Image size={17} />
        Найти обложку в Magnific
      </button>
    );
  }

  return (
    <section className={styles.panel} aria-label="Поиск изображений Magnific">
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Сток Magnific</div>
          <div className={styles.subtitle}>Фотография будет скачана и сохранена в ImageKit.</div>
        </div>
        <button type="button" className={styles.closeButton} onClick={() => setIsOpen(false)} aria-label="Закрыть">
          <X size={17} />
        </button>
      </div>

      <form className={styles.searchBar} onSubmit={search}>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Например: healthy family dinner table"
          disabled={searching || importingId !== null}
        />
        <button type="submit" className="btn btn-primary" disabled={searching || importingId !== null}>
          {searching ? <Loader2 className={styles.spinner} size={17} /> : <Search size={17} />}
          {searching ? "Ищем…" : "Найти"}
        </button>
      </form>

      {error && <div className={styles.error}>{error}</div>}
      {!searching && !error && results.length === 0 && (
        <div className={styles.empty}>Введите описание нужной фотографии. Лучше использовать короткий запрос на английском.</div>
      )}

      {results.length > 0 && (
        <div className={styles.grid}>
          {results.map((resource) => {
            const license = resource.licenses[0];
            const isImporting = importingId === resource.id;
            return (
              <article key={resource.id} className={styles.card}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.thumbnail} src={resource.previewUrl} alt={resource.title} loading="lazy" />
                <div className={styles.cardBody}>
                  <div className={styles.cardTitle}>{resource.title}</div>
                  <div className={styles.meta}>
                    {resource.authorName || "Magnific"}
                    {resource.imageSize ? ` · ${resource.imageSize}` : ""}
                  </div>
                  <div className={styles.cardActions}>
                    <a href={resource.sourceUrl} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                      Источник <ExternalLink size={12} />
                    </a>
                    {license?.url && (
                      <a href={license.url} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                        Лицензия
                      </a>
                    )}
                    <button
                      type="button"
                      className={styles.useButton}
                      disabled={importingId !== null}
                      onClick={() => void importImage(resource)}
                    >
                      {isImporting ? <Loader2 className={styles.spinner} size={14} /> : null}
                      {isImporting ? "Импорт…" : "Использовать"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

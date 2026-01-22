"use client";

import { useEffect, useState } from "react";

export default function SchemaPage() {
  const [content, setContent] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const loadSchema = async () => {
    setStatus("Загружаем схему...");
    const response = await fetch("/api/admin/schema?format=html");
    const result = await response.json();
    if (!response.ok) {
      setStatus(`Ошибка: ${result.error || "не удалось загрузить"}`);
      return;
    }
    setContent(result.content || "");
    setStatus("Готово");
  };

  const refreshSchema = async () => {
    setStatus("Обновляем... это может занять 10-20 секунд");
    const response = await fetch("/api/admin/schema/refresh", { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      setStatus(`Ошибка: ${result.error || "не удалось обновить"}`);
      return;
    }
    await loadSchema();
  };

  useEffect(() => {
    loadSchema();
  }, []);

  return (
    <div>
      <h1 className="page-title">Схема базы</h1>
      <p className="page-subtitle">Актуальная структура БД и описание таблиц.</p>

      <div className="panel">
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <button className="btn" onClick={refreshSchema} type="button">
            Обновить
          </button>
          <button className="btn btn-secondary" onClick={loadSchema} type="button">
            Перезагрузить
          </button>
        </div>
        {status && <div className="status">{status}</div>}
        {content ? (
          <iframe
            title="Schema"
            style={{
              width: "100%",
              height: "70vh",
              border: "none",
              borderRadius: 12,
              background: "#ffffff",
            }}
            srcDoc={content}
          />
        ) : (
          <div className="schema-view">Нет данных</div>
        )}
      </div>
    </div>
  );
}

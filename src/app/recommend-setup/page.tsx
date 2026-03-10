"use client";

import { useState, useEffect } from "react";

interface Stats {
  total: number;
  untagged: number;
  unembedded: number;
}

interface Result {
  ok: boolean;
  message?: string;
  tagged?: number;
  embedded?: number;
  total?: number;
  errors?: string[];
  error?: string;
}

export default function RecommendSetupPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, Result>>({});

  async function loadStats() {
    const res = await fetch("/api/admin/recommend-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stats" }),
    });
    const data = await res.json();
    setStats(data);
  }

  async function run(action: string) {
    setLoading(action);
    setResult((r) => ({ ...r, [action]: { ok: false, message: "Running..." } }));
    try {
      const res = await fetch("/api/admin/recommend-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setResult((r) => ({ ...r, [action]: data }));
      await loadStats();
    } catch (e) {
      setResult((r) => ({ ...r, [action]: { ok: false, error: String(e) } }));
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => { loadStats(); }, []);

  const btn = (label: string, action: string, color: string) => (
    <button
      onClick={() => run(action)}
      disabled={loading !== null}
      className={`px-5 py-2.5 rounded-lg font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
    >
      {loading === action ? "⏳ Выполняется..." : label}
    </button>
  );

  const resultBox = (action: string) => {
    const r = result[action];
    if (!r) return null;
    const isRunning = r.message === "Running...";
    const color = isRunning ? "bg-yellow-50 border-yellow-200 text-yellow-800" : r.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800";
    return (
      <div className={`mt-3 p-3 rounded-lg border text-sm ${color}`}>
        {isRunning && <span>Идёт выполнение, подождите...</span>}
        {!isRunning && r.ok && (
          <div>
            <span className="font-semibold">✅ Готово.</span>{" "}
            {r.message ?? `Обработано: ${r.tagged ?? r.embedded ?? 0} из ${r.total ?? "?"}`}
            {r.errors && r.errors.length > 0 && <div className="mt-1 text-xs opacity-70">Ошибок: {r.errors.length}</div>}
          </div>
        )}
        {!isRunning && !r.ok && <span className="font-semibold">❌ {r.error ?? "Ошибка"}</span>}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Настройка рекомендаций</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">Выполни шаги по порядку для активации векторного поиска.</p>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Всего рецептов", value: stats.total },
            { label: "Без mood_tags", value: stats.untagged, warn: stats.untagged > 0 },
            { label: "Без эмбеддинга", value: stats.unembedded, warn: stats.unembedded > 0 },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-4 border ${s.warn ? "border-orange-200 bg-orange-50 dark:bg-orange-950/20" : "border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700"}`}>
              <div className={`text-2xl font-bold ${s.warn ? "text-orange-600" : "text-gray-900 dark:text-white"}`}>{s.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Steps */}
      <div className="space-y-6">
        {/* Step 1 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-pink-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">1</div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Применить миграцию</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Добавляет колонки <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">mood_tags</code> и <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">embedding</code>, индексы и функцию <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">match_recipes</code>.</p>
              {btn("Запустить миграцию", "migrate", "bg-gray-700 hover:bg-gray-800")}
              {resultBox("migrate")}
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-pink-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">2</div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Тегировать рецепты (GPT)</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Присваивает mood_tags каждому рецепту без тегов через GPT-4o-mini. Занимает 1-5 минут.</p>
              {btn("Запустить тегирование", "tag", "bg-blue-600 hover:bg-blue-700")}
              {resultBox("tag")}
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-pink-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">3</div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Сгенерировать эмбеддинги</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Создаёт векторы для рецептов без эмбеддинга через OpenAI text-embedding-3-small.</p>
              {btn("Сгенерировать эмбеддинги", "embed", "bg-purple-600 hover:bg-purple-700")}
              {resultBox("embed")}
            </div>
          </div>
        </div>
      </div>

      <button onClick={loadStats} className="mt-6 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline">
        Обновить статистику
      </button>
    </div>
  );
}

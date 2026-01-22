"use client";

import { useState, useEffect, useCallback } from "react";

interface ModeratorStats {
  totalProcessed: number;
  autoLinked: number;
  aiCalls: number;
  tokensUsed: number;
  cacheHits: number;
  errors: number;
}

interface CacheStats {
  productCount: number;
  indexedNames: number;
  cacheAge: number;
  isStale: boolean;
}

interface ProcessResult {
  success: boolean;
  action: string;
  productId?: string;
  productName?: string;
  confidence?: number;
  aiUsed: boolean;
  details?: unknown;
}

interface BatchSummary {
  total: number;
  autoLinked: number;
  suggested: number;
  skipped: number;
  errors: number;
  aiUsed: number;
}

export default function AIModeratorPage() {
  const [stats, setStats] = useState<ModeratorStats | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [efficiency, setEfficiency] = useState<number>(100);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Single ingredient test
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<ProcessResult | null>(null);

  // Batch processing
  const [batchInput, setBatchInput] = useState("");
  const [batchResults, setBatchResults] = useState<ProcessResult[]>([]);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-moderator");
      const data = await res.json();
      if (data.stats) setStats(data.stats);
      if (data.cache) setCacheStats(data.cache);
      if (data.efficiency !== undefined) setEfficiency(data.efficiency);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Test single ingredient
  const testIngredient = async () => {
    if (!testInput.trim()) return;
    setProcessing(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/ai-moderator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process_single",
          ingredients: testInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.result) setTestResult(data.result);
      if (data.stats) setStats(data.stats);
    } catch (error) {
      console.error("Failed to test ingredient:", error);
    }
    setProcessing(false);
  };

  // Process batch
  const processBatch = async () => {
    const items = batchInput
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;

    setProcessing(true);
    setBatchResults([]);
    setBatchSummary(null);
    try {
      const res = await fetch("/api/admin/ai-moderator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process_batch",
          ingredients: items,
        }),
      });
      const data = await res.json();
      if (data.results) setBatchResults(data.results);
      if (data.summary) setBatchSummary(data.summary);
      if (data.stats) setStats(data.stats);
    } catch (error) {
      console.error("Failed to process batch:", error);
    }
    setProcessing(false);
  };

  // Refresh cache
  const refreshCache = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-moderator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_cache" }),
      });
      const data = await res.json();
      if (data.cache) setCacheStats(data.cache);
    } catch (error) {
      console.error("Failed to refresh cache:", error);
    }
    setLoading(false);
  };

  // Reset stats
  const resetStats = async () => {
    try {
      const res = await fetch("/api/admin/ai-moderator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_stats" }),
      });
      const data = await res.json();
      if (data.stats) setStats(data.stats);
    } catch (error) {
      console.error("Failed to reset stats:", error);
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "auto_linked":
        return "bg-green-100 text-green-800";
      case "suggested":
        return "bg-yellow-100 text-yellow-800";
      case "skipped":
        return "bg-gray-100 text-gray-800";
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "auto_linked":
        return "Связан";
      case "suggested":
        return "На модерацию";
      case "skipped":
        return "Пропущен";
      case "error":
        return "Ошибка";
      case "created":
        return "Создан";
      case "filled":
        return "Заполнен";
      default:
        return action;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Модератор</h1>
            <p className="text-gray-600">
              Автоматическая модерация продуктов с экономией токенов
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetStats}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Сбросить статистику
            </button>
            <button
              onClick={refreshCache}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "..." : "Обновить кэш"}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-gray-900">
              {stats?.totalProcessed || 0}
            </div>
            <div className="text-sm text-gray-500">Обработано</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-600">
              {stats?.autoLinked || 0}
            </div>
            <div className="text-sm text-gray-500">Авто-связано</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-blue-600">
              {stats?.cacheHits || 0}
            </div>
            <div className="text-sm text-gray-500">Из кэша</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-yellow-600">
              {stats?.aiCalls || 0}
            </div>
            <div className="text-sm text-gray-500">AI запросов</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-purple-600">
              {stats?.tokensUsed || 0}
            </div>
            <div className="text-sm text-gray-500">Токенов</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-emerald-600">{efficiency}%</div>
            <div className="text-sm text-gray-500">Эффективность</div>
          </div>
        </div>

        {/* Cache Info */}
        {cacheStats && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-2">Кэш продуктов</h3>
            <div className="flex gap-6 text-sm">
              <span>
                Продуктов: <strong>{cacheStats.productCount}</strong>
              </span>
              <span>
                Индексировано имен: <strong>{cacheStats.indexedNames}</strong>
              </span>
              <span>
                Возраст кэша:{" "}
                <strong>
                  {cacheStats.cacheAge >= 0
                    ? `${Math.round(cacheStats.cacheAge / 1000)}с`
                    : "не загружен"}
                </strong>
              </span>
              <span
                className={cacheStats.isStale ? "text-red-600" : "text-green-600"}
              >
                {cacheStats.isStale ? "Устарел" : "Актуален"}
              </span>
            </div>
          </div>
        )}

        {/* Test Single Ingredient */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Тест одного ингредиента
          </h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && testIngredient()}
              placeholder="Введите название ингредиента..."
              className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={testIngredient}
              disabled={processing || !testInput.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {processing ? "..." : "Тест"}
            </button>
          </div>

          {testResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-1 rounded text-sm ${getActionColor(
                    testResult.action
                  )}`}
                >
                  {getActionLabel(testResult.action)}
                </span>
                {testResult.productName && (
                  <span className="text-gray-900 font-medium">
                    {testResult.productName}
                  </span>
                )}
                {testResult.confidence && (
                  <span className="text-gray-500 text-sm">
                    {Math.round(testResult.confidence * 100)}%
                  </span>
                )}
                {testResult.aiUsed && (
                  <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                    AI
                  </span>
                )}
              </div>
              {testResult.details ? (
                <pre className="mt-2 text-xs text-gray-600 overflow-auto">
                  {JSON.stringify(testResult.details, null, 2)}
                </pre>
              ) : null}
            </div>
          )}
        </div>

        {/* Batch Processing */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Пакетная обработка
          </h2>
          <textarea
            value={batchInput}
            onChange={(e) => setBatchInput(e.target.value)}
            placeholder="Введите названия ингредиентов (по одному на строку)..."
            rows={6}
            className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
          <div className="flex justify-between items-center mt-4">
            <span className="text-sm text-gray-500">
              {batchInput.split("\n").filter((s) => s.trim()).length} ингредиентов
            </span>
            <button
              onClick={processBatch}
              disabled={
                processing || !batchInput.split("\n").filter((s) => s.trim()).length
              }
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {processing ? "Обработка..." : "Обработать пакет"}
            </button>
          </div>

          {/* Batch Summary */}
          {batchSummary && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Результат</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-green-600">
                  Связано: <strong>{batchSummary.autoLinked}</strong>
                </span>
                <span className="text-yellow-600">
                  На модерацию: <strong>{batchSummary.suggested}</strong>
                </span>
                <span className="text-gray-600">
                  Пропущено: <strong>{batchSummary.skipped}</strong>
                </span>
                <span className="text-red-600">
                  Ошибок: <strong>{batchSummary.errors}</strong>
                </span>
                <span className="text-purple-600">
                  AI использован: <strong>{batchSummary.aiUsed}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Batch Results Table */}
          {batchResults.length > 0 && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      Ингредиент
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      Действие
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">
                      Результат
                    </th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600">
                      Уверенность
                    </th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600">
                      AI
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batchResults.map((result, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-2">
                        {batchInput.split("\n").filter((s) => s.trim())[index]}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${getActionColor(
                            result.action
                          )}`}
                        >
                          {getActionLabel(result.action)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {result.productName || "-"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {result.confidence
                          ? `${Math.round(result.confidence * 100)}%`
                          : "-"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {result.aiUsed ? (
                          <span className="text-purple-600">Да</span>
                        ) : (
                          <span className="text-gray-400">Нет</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Setup Instructions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Настройка Real-time обработки
          </h2>
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              Для автоматической обработки новых продуктов в реальном времени
              настройте Supabase Database Webhook:
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>
                Откройте Supabase Dashboard {"->"} Database {"->"} Webhooks
              </li>
              <li>
                Создайте новый webhook для события <code>INSERT</code> на таблице{" "}
                <code>product_dictionary</code>
              </li>
              <li>
                Укажите URL:{" "}
                <code className="bg-gray-100 px-2 py-0.5 rounded">
                  https://your-domain.com/api/webhooks/product-created
                </code>
              </li>
              <li>
                Добавьте заголовок:{" "}
                <code className="bg-gray-100 px-2 py-0.5 rounded">
                  Authorization: Bearer YOUR_WEBHOOK_SECRET
                </code>
              </li>
              <li>
                Добавьте переменную окружения{" "}
                <code className="bg-gray-100 px-2 py-0.5 rounded">
                  WEBHOOK_SECRET
                </code>{" "}
                в .env.local
              </li>
            </ol>
            <p className="mt-4">
              После настройки каждый новый продукт будет автоматически:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Проверен на дубликаты среди существующих продуктов</li>
              <li>Заполнен недостающими данными (КБЖУ, описание) через AI</li>
              <li>Отправлен на модерацию при необходимости</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

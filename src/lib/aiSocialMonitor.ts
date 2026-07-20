import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const DEFAULT_SETTINGS_ID = "default";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const THREADS_DEFAULT_FIELDS = [
  "id",
  "text",
  "permalink",
  "username",
  "timestamp",
  "media_type",
  "media_product_type",
].join(",");

export type SocialMonitorSettings = {
  id: string;
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
  search_strategy: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type SocialMonitorSource = {
  id: string;
  name: string;
  enabled: boolean;
  status: "connected" | "not_configured" | "error";
  auth_type: "none" | "api_key" | "oauth" | "json_endpoint";
  config: Record<string, unknown>;
  last_checked_at: string | null;
};

export type QuerySpec = {
  source: string;
  query_text: string;
  language: string | null;
  country: string | null;
  rationale: string;
};

export type RawSocialPost = {
  source: string;
  external_id: string;
  author_name: string | null;
  author_handle: string | null;
  author_url: string | null;
  country: string | null;
  language: string | null;
  posted_at: string | null;
  text: string;
  original_url: string;
  raw: Record<string, unknown>;
};

type AnalysisResult = {
  ai_score: number;
  ai_summary: string;
  ai_reason: string;
  ai_problem: string;
  ai_goal: string;
  ai_emotion: string;
  ai_conversion_probability: number;
  ai_should_reply: boolean;
  ai_reply: string;
  text_translation: string | null;
  detected_competitors: string[];
  ai_analysis: Record<string, unknown>;
};

type SourceConnector = {
  id: string;
  displayName: string;
  authType: SocialMonitorSource["auth_type"];
  search: (source: SocialMonitorSource, queries: QuerySpec[], limit: number) => Promise<RawSocialPost[]>;
};

const defaultSettings: SocialMonitorSettings = {
  id: DEFAULT_SETTINGS_ID,
  product_name: "Dishday",
  product_description:
    "Dishday helps people decide what to cook, plan meals, use pantry ingredients, save recipes, build shopping lists, and discover practical recipe ideas.",
  core_features: [
    "AI meal recommendations",
    "Recipe import from social links",
    "Pantry-based cooking ideas",
    "Meal planning",
    "Shopping lists",
    "Personal recipe library",
  ],
  target_audience:
    "Busy people, families, students, home cooks, and anyone who often does not know what to cook or wants to reduce food waste.",
  competitors: ["Mealime", "Samsung Food", "Yummly", "Paprika", "Intent", "SideChef"],
  extra_context:
    "Look for natural complaints and intent signals, not only exact app keywords. Good matches include people asking what to cook, struggling with meal planning, pantry leftovers, dinner ideas, recipe organization, family meals, and food decision fatigue.",
  enabled_sources: ["reddit"],
  check_interval_minutes: 180,
  high_score_threshold: 78,
  notifications_enabled: true,
  last_scan_at: null,
  next_scan_at: null,
  search_strategy: null,
};

const fallbackQueries = [
  "what should I cook for dinner",
  "I don't know what to eat",
  "meal planning app",
  "what can I make with ingredients I have",
  "how to organize recipes",
  "quick dinner ideas family",
  "pantry recipe ideas",
  "tired of deciding what to cook",
];

// Широкие темы для обнаружения трендов в Threads — не привязаны к боли/интенту,
// нужны чтобы увидеть, что вообще сейчас обсуждают в теме еды/готовки.
const TREND_SEED_QUERIES = [
  "recipe",
  "dinner idea",
  "viral recipe",
  "tiktok recipe",
  "cooking hack",
  "meal prep",
  "food trend",
  "what I ate today",
  "new recipe",
  "easy recipe",
];

const TREND_MIN_MENTIONS = 3;
const TREND_GROWTH_RATIO = 2.5;

const TOPIC_STOPWORDS = new Set(
  [
    "the", "and", "for", "with", "you", "your", "this", "that", "have", "has",
    "just", "like", "from", "into", "about", "when", "what", "how", "why",
    "who", "are", "was", "were", "will", "would", "could", "should", "can",
    "cant", "dont", "didnt", "doesnt", "not", "but", "all", "any", "some",
    "one", "get", "got", "make", "made", "makes", "making", "really", "very",
    "still", "now", "today", "here", "there", "then", "than", "its", "it's",
    "i'm", "im", "i've", "ive", "my", "me", "we", "our", "they", "them",
    "their", "she", "him", "her", "his", "did", "does", "out", "off", "over",
    "again", "more", "most", "much", "also", "back", "these", "those",
  ].map((word) => word.toLowerCase())
);

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeSettings(row: Record<string, unknown>): SocialMonitorSettings {
  return {
    ...defaultSettings,
    ...row,
    core_features: toArray(row.core_features) || defaultSettings.core_features,
    competitors: toArray(row.competitors),
    enabled_sources: toArray(row.enabled_sources),
    search_strategy:
      row.search_strategy && typeof row.search_strategy === "object"
        ? (row.search_strategy as Record<string, unknown>)
        : null,
  };
}

function stripJsonFence(value: string) {
  let text = value.trim();
  if (text.startsWith("```json")) text = text.slice(7);
  else if (text.startsWith("```")) text = text.slice(3);
  if (text.endsWith("```")) text = text.slice(0, -3);
  return text.trim();
}

function stableExternalId(source: string, text: string, url: string) {
  return `${source}:${createHash("sha256").update(`${url}\n${text}`).digest("hex").slice(0, 32)}`;
}

function getTextFromChatResponse(payload: unknown) {
  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
  return choices?.[0]?.message?.content?.trim() ?? "";
}

async function callOpenAIJson<T>(messages: Array<{ role: "system" | "user"; content: string }>): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.35,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const content = getTextFromChatResponse(payload);
  if (!content) return null;
  return JSON.parse(stripJsonFence(content)) as T;
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !text.trim()) return null;

  const response = await fetch(OPENAI_EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  return payload.data?.[0]?.embedding ?? null;
}

export async function ensureSocialMonitorDefaults() {
  await supabaseAdmin.from("ai_social_monitor_sources").upsert(
    [
      {
        id: "reddit",
        name: "Reddit",
        enabled: true,
        status: "connected",
        auth_type: "none",
        config: { limit_per_query: 12 },
      },
      {
        id: "json_endpoint",
        name: "Custom JSON endpoint",
        enabled: false,
        status: "not_configured",
        auth_type: "json_endpoint",
        config: {
          endpoint_url: "",
          method: "GET",
          query_param: "q",
        },
      },
      {
        id: "x",
        name: "X / Twitter",
        enabled: false,
        status: "not_configured",
        auth_type: "api_key",
        config: {},
      },
      {
        id: "threads",
        name: "Threads",
        enabled: false,
        status: "not_configured",
        auth_type: "api_key",
        config: {
          base_url: "https://graph.threads.net/v1.0",
          endpoint_path: "/keyword_search",
          query_param: "q",
          search_type_param: "search_type",
          search_type: "RECENT",
          fields: THREADS_DEFAULT_FIELDS,
          limit_per_query: 10,
          access_token_env: "THREADS_ACCESS_TOKEN",
        },
      },
    ],
    { onConflict: "id", ignoreDuplicates: true }
  );
}

export async function getSocialMonitorSettings() {
  await ensureSocialMonitorDefaults();

  const { data, error } = await supabaseAdmin
    .from("ai_social_monitor_settings")
    .select("*")
    .eq("id", DEFAULT_SETTINGS_ID)
    .maybeSingle();

  if (error) throw error;
  if (data) return normalizeSettings(data as Record<string, unknown>);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("ai_social_monitor_settings")
    .insert(defaultSettings)
    .select("*")
    .single();

  if (insertError) throw insertError;
  return normalizeSettings(inserted as Record<string, unknown>);
}

export async function saveSocialMonitorSettings(input: Partial<SocialMonitorSettings>) {
  const interval = Math.max(15, Number(input.check_interval_minutes || defaultSettings.check_interval_minutes));
  const payload = {
    id: DEFAULT_SETTINGS_ID,
    product_name: String(input.product_name || defaultSettings.product_name).trim(),
    product_description: String(input.product_description || "").trim(),
    core_features: toArray(input.core_features),
    target_audience: String(input.target_audience || "").trim(),
    competitors: toArray(input.competitors),
    extra_context: String(input.extra_context || "").trim(),
    enabled_sources: toArray(input.enabled_sources),
    check_interval_minutes: interval,
    high_score_threshold: Math.min(100, Math.max(0, Number(input.high_score_threshold ?? 78))),
    notifications_enabled: Boolean(input.notifications_enabled),
    next_scan_at: new Date(Date.now() + interval * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("ai_social_monitor_settings")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeSettings(data as Record<string, unknown>);
}

export async function getSocialMonitorSources() {
  await ensureSocialMonitorDefaults();
  const { data, error } = await supabaseAdmin
    .from("ai_social_monitor_sources")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as SocialMonitorSource[]).map((source) => {
    if (source.id !== "threads") return source;
    const hasToken = Boolean(getSourceEnvToken(source, "THREADS_ACCESS_TOKEN"));
    return {
      ...source,
      status: hasToken ? ("connected" as const) : ("not_configured" as const),
    };
  });
}

async function generateSearchQueries(settings: SocialMonitorSettings, sources: SocialMonitorSource[]) {
  const enabledSourceIds = sources.filter((source) => source.enabled).map((source) => source.id);
  type QueryResponse = { queries?: QuerySpec[] };

  const aiResult = await callOpenAIJson<QueryResponse>([
    {
      role: "system",
      content:
        "You generate practical social-search queries for finding people who may need a consumer cooking and meal planning app. Return JSON only.",
    },
    {
      role: "user",
      content: JSON.stringify({
        product: {
          name: settings.product_name,
          description: settings.product_description,
          features: settings.core_features,
          audience: settings.target_audience,
          competitors: settings.competitors,
          extra_context: settings.extra_context,
        },
        sources: enabledSourceIds,
        task:
          "For every source, create natural queries that real people might use when expressing problems. Do not rely only on predefined keywords. Include intent, competitor, and pain-point phrasing. Return {\"queries\":[{\"source\":\"reddit\",\"query_text\":\"...\",\"language\":\"en\",\"country\":null,\"rationale\":\"...\"}]} with max 8 queries per source.",
      }),
    },
  ]);

  const generated = (aiResult?.queries ?? [])
    .filter((query) => enabledSourceIds.includes(query.source) && query.query_text?.trim())
    .slice(0, enabledSourceIds.length * 8);

  const fallback = enabledSourceIds.flatMap((source) =>
    fallbackQueries.map((query_text) => ({
      source,
      query_text,
      language: "en",
      country: null,
      rationale: "Fallback query based on meal planning and cooking-intent pain points.",
    }))
  );

  const queries = generated.length > 0 ? generated : fallback;

  if (queries.length > 0) {
    await supabaseAdmin.from("ai_social_monitor_queries").insert(
      queries.map((query) => ({
        source: query.source,
        query_text: query.query_text,
        language: query.language,
        country: query.country,
        rationale: query.rationale,
        generated_by: generated.length > 0 ? "ai" : "fallback",
      }))
    );
  }

  return queries;
}

async function searchReddit(_: SocialMonitorSource, queries: QuerySpec[], limit: number) {
  const posts: RawSocialPost[] = [];

  for (const query of queries.slice(0, 8)) {
    const url = new URL("https://www.reddit.com/search.json");
    url.searchParams.set("q", query.query_text);
    url.searchParams.set("sort", "new");
    url.searchParams.set("limit", String(Math.min(25, limit)));

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "DishdayAdminSocialMonitor/1.0",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;

      const payload = (await response.json()) as {
        data?: { children?: Array<{ data?: Record<string, unknown> }> };
      };
      const children = payload.data?.children ?? [];

      for (const child of children) {
        const data = child.data ?? {};
        const title = String(data.title ?? "").trim();
        const selftext = String(data.selftext ?? "").trim();
        const permalink = String(data.permalink ?? "");
        const text = [title, selftext].filter(Boolean).join("\n\n");
        if (!text) continue;

        posts.push({
          source: "reddit",
          external_id: `reddit:${String(data.id ?? stableExternalId("reddit", text, permalink))}`,
          author_name: data.author ? String(data.author) : null,
          author_handle: data.author ? `u/${String(data.author)}` : null,
          author_url: data.author ? `https://www.reddit.com/user/${String(data.author)}` : null,
          country: query.country,
          language: query.language,
          posted_at:
            typeof data.created_utc === "number"
              ? new Date(data.created_utc * 1000).toISOString()
              : null,
          text,
          original_url: permalink ? `https://www.reddit.com${permalink}` : String(data.url ?? ""),
          raw: data,
        });
      }
    } catch {
      continue;
    }
  }

  return posts;
}

async function searchJsonEndpoint(source: SocialMonitorSource, queries: QuerySpec[], limit: number) {
  const endpointUrl = String(source.config?.endpoint_url || "").trim();
  if (!endpointUrl) return [];

  const method = String(source.config?.method || "GET").toUpperCase();
  const queryParam = String(source.config?.query_param || "q");
  const posts: RawSocialPost[] = [];

  for (const query of queries.slice(0, 8)) {
    try {
      let response: Response;
      if (method === "POST") {
        response = await fetch(endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.query_text, source: source.id, limit }),
          signal: AbortSignal.timeout(20_000),
        });
      } else {
        const url = new URL(endpointUrl);
        url.searchParams.set(queryParam, query.query_text);
        url.searchParams.set("limit", String(limit));
        response = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
      }

      if (!response.ok) continue;
      const payload = (await response.json()) as { posts?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      const rows = Array.isArray(payload) ? payload : payload.posts ?? [];

      for (const row of rows) {
        const text = String(row.text ?? row.body ?? row.content ?? "").trim();
        const originalUrl = String(row.original_url ?? row.url ?? "").trim();
        if (!text || !originalUrl) continue;

        posts.push({
          source: source.id,
          external_id: String(row.external_id ?? stableExternalId(source.id, text, originalUrl)),
          author_name: row.author_name ? String(row.author_name) : null,
          author_handle: row.author_handle ? String(row.author_handle) : null,
          author_url: row.author_url ? String(row.author_url) : null,
          country: row.country ? String(row.country) : query.country,
          language: row.language ? String(row.language) : query.language,
          posted_at: row.posted_at ? String(row.posted_at) : null,
          text,
          original_url: originalUrl,
          raw: row,
        });
      }
    } catch {
      continue;
    }
  }

  return posts;
}

function getSourceEnvToken(source: SocialMonitorSource, fallbackEnv: string) {
  const envName = String(source.config?.access_token_env || fallbackEnv).trim();
  return envName ? process.env[envName] : undefined;
}

function normalizeThreadsRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data as Array<Record<string, unknown>>;
  if (Array.isArray(record.posts)) return record.posts as Array<Record<string, unknown>>;
  if (Array.isArray(record.results)) return record.results as Array<Record<string, unknown>>;
  if (record.data && typeof record.data === "object") {
    const nested = record.data as Record<string, unknown>;
    if (Array.isArray(nested.data)) return nested.data as Array<Record<string, unknown>>;
    if (Array.isArray(nested.posts)) return nested.posts as Array<Record<string, unknown>>;
  }

  return [];
}

function toIsoDateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function searchThreads(source: SocialMonitorSource, queries: QuerySpec[], limit: number) {
  const accessToken = getSourceEnvToken(source, "THREADS_ACCESS_TOKEN");
  if (!accessToken) return [];

  const baseUrl = String(source.config?.base_url || "https://graph.threads.net/v1.0").replace(/\/+$/, "");
  const endpointPath = String(source.config?.endpoint_path || "/keyword_search");
  const queryParam = String(source.config?.query_param || "q");
  const searchTypeParam = String(source.config?.search_type_param || "search_type");
  const searchType = String(source.config?.search_type || "RECENT");
  const fields = String(source.config?.fields || THREADS_DEFAULT_FIELDS);
  const posts: RawSocialPost[] = [];

  for (const query of queries.slice(0, 18)) {
    try {
      const url = new URL(`${baseUrl}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`);
      url.searchParams.set(queryParam, query.query_text);
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set("limit", String(Math.min(25, limit)));
      if (fields) url.searchParams.set("fields", fields);
      if (searchType) url.searchParams.set(searchTypeParam, searchType);

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        console.error("[AI Social Monitor] Threads search failed", response.status, await response.text());
        continue;
      }

      const payload = await response.json();
      const rows = normalizeThreadsRows(payload);

      for (const row of rows) {
        const text = String(row.text ?? row.caption ?? row.message ?? "").trim();
        if (!text) continue;

        const id = String(row.id ?? stableExternalId("threads", text, String(row.permalink ?? "")));
        const username = row.username ? String(row.username) : null;
        const permalink = String(row.permalink ?? row.url ?? "").trim();

        posts.push({
          source: "threads",
          external_id: `threads:${id}`,
          author_name: username,
          author_handle: username ? `@${username}` : null,
          author_url: username ? `https://www.threads.net/@${username}` : null,
          country: query.country,
          language: query.language,
          posted_at: toIsoDateOrNull(row.timestamp),
          text,
          original_url: permalink || (username ? `https://www.threads.net/@${username}/post/${id}` : `https://www.threads.net/`),
          raw: row,
        });
      }
    } catch (error) {
      console.error("[AI Social Monitor] Threads search error", error);
      continue;
    }
  }

  return posts;
}

const connectors: Record<string, SourceConnector> = {
  reddit: {
    id: "reddit",
    displayName: "Reddit",
    authType: "none",
    search: searchReddit,
  },
  json_endpoint: {
    id: "json_endpoint",
    displayName: "Custom JSON endpoint",
    authType: "json_endpoint",
    search: searchJsonEndpoint,
  },
  threads: {
    id: "threads",
    displayName: "Threads",
    authType: "api_key",
    search: searchThreads,
  },
};

function fallbackAnalysis(settings: SocialMonitorSettings, post: RawSocialPost): AnalysisResult {
  const text = post.text.toLowerCase();
  const positiveSignals = [
    "what should i cook",
    "what to cook",
    "dinner",
    "meal plan",
    "meal planning",
    "ingredients",
    "pantry",
    "recipe",
    "grocery",
    "shopping list",
    "leftovers",
    "family meal",
    "what to eat",
  ];
  const competitorHit = settings.competitors.find((competitor) =>
    text.includes(competitor.toLowerCase())
  );
  const hits = positiveSignals.filter((signal) => text.includes(signal)).length;
  const score = Math.min(92, Math.max(18, hits * 12 + (competitorHit ? 18 : 0) + 22));

  return {
    ai_score: score,
    ai_summary: "Heuristic match based on cooking, meal planning, pantry, recipe, or competitor intent.",
    ai_reason:
      score >= 70
        ? "The post contains strong signs that the author is trying to solve a meal decision or planning problem."
        : "The post has some food-related intent, but the need for Dishday is not yet clear.",
    ai_problem: hits > 0 ? "The author is looking for help deciding, planning, or organizing meals." : "Unclear food-related need.",
    ai_goal: "Find a practical next meal or reduce friction around cooking decisions.",
    ai_emotion: text.includes("tired") || text.includes("stuck") ? "frustrated" : "neutral",
    ai_conversion_probability: score,
    ai_should_reply: score >= settings.high_score_threshold,
    ai_reply:
      score >= settings.high_score_threshold
        ? "I have run into this too. One thing that helps is starting from what you already have and turning that into a short dinner list. Dishday is built around that workflow, so it might be useful if you want a low-effort way to get ideas without browsing recipes for ages."
        : "This might be worth watching, but I would not reply unless the author asks for app or workflow recommendations.",
    text_translation: post.language && post.language !== "en" ? post.text : null,
    detected_competitors: competitorHit ? [competitorHit] : [],
    ai_analysis: { mode: "heuristic", signal_count: hits },
  };
}

async function analyzePublication(settings: SocialMonitorSettings, post: RawSocialPost): Promise<AnalysisResult> {
  type AiResponse = {
    score?: number;
    summary?: string;
    reason?: string;
    problem?: string;
    goal?: string;
    emotion?: string;
    conversion_probability?: number;
    should_reply?: boolean;
    reply?: string;
    translation?: string | null;
    detected_competitors?: string[];
  };

  const result = await callOpenAIJson<AiResponse>([
    {
      role: "system",
      content:
        "You analyze social posts for product-led opportunity discovery. Be strict, avoid hype, and return JSON only.",
    },
    {
      role: "user",
      content: JSON.stringify({
        product: {
          name: settings.product_name,
          description: settings.product_description,
          features: settings.core_features,
          audience: settings.target_audience,
          competitors: settings.competitors,
          extra_context: settings.extra_context,
        },
        post: {
          source: post.source,
          author: post.author_handle || post.author_name,
          country: post.country,
          language: post.language,
          text: post.text,
          url: post.original_url,
        },
        task:
          "Decide whether the author is likely to benefit from the product. Return {score:0-100,summary,reason,problem,goal,emotion,conversion_probability:0-100,should_reply:boolean,reply,translation,detected_competitors:[...]} . The reply must sound natural and helpful, not promotional.",
      }),
    },
  ]);

  if (!result) return fallbackAnalysis(settings, post);

  const score = Math.min(100, Math.max(0, Math.round(Number(result.score ?? result.conversion_probability ?? 0))));
  return {
    ai_score: score,
    ai_summary: String(result.summary || "AI analysis completed."),
    ai_reason: String(result.reason || result.summary || "Matched by AI analysis."),
    ai_problem: String(result.problem || "Not specified"),
    ai_goal: String(result.goal || "Not specified"),
    ai_emotion: String(result.emotion || "neutral"),
    ai_conversion_probability: Math.min(
      100,
      Math.max(0, Math.round(Number(result.conversion_probability ?? score)))
    ),
    ai_should_reply: Boolean(result.should_reply ?? score >= settings.high_score_threshold),
    ai_reply: String(result.reply || ""),
    text_translation: result.translation ? String(result.translation) : null,
    detected_competitors: Array.isArray(result.detected_competitors)
      ? result.detected_competitors.map(String)
      : [],
    ai_analysis: { mode: "ai", raw: result },
  };
}

async function saveNotificationIfNeeded(settings: SocialMonitorSettings, postId: string, analysis: AnalysisResult) {
  if (!settings.notifications_enabled || analysis.ai_score < settings.high_score_threshold) return;

  await supabaseAdmin.from("ai_social_monitor_notifications").upsert(
    {
      post_id: postId,
      type: "high_score",
      score: analysis.ai_score,
      title: `High-intent social post (${analysis.ai_score})`,
      body: analysis.ai_summary,
    },
    { onConflict: "post_id,type" }
  );
}

// Извлекает кандидатов в "темы" из текста поста: отдельные слова и биграммы,
// без стоп-слов и мусора. Это не NLP, а простой частотный сигнал —
// достаточно, чтобы заметить резкий рост упоминаний чего-то конкретного.
function extractTopics(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-zа-я0-9#'\s]/gi, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !TOPIC_STOPWORDS.has(word) && !/^\d+$/.test(word));

  const topics = new Set<string>();

  for (const word of words) {
    if (word.startsWith("#")) {
      topics.add(word);
    } else {
      topics.add(word);
    }
  }

  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i];
    const b = words[i + 1];
    if (!a || !b) continue;
    topics.add(`${a} ${b}`);
  }

  return Array.from(topics);
}

async function updateThreadsTrends(posts: RawSocialPost[]) {
  const threadsPosts = posts.filter((post) => post.source === "threads" && post.text.trim());
  if (threadsPosts.length === 0) return;

  const runCounts = new Map<string, { count: number; samplePost: RawSocialPost }>();

  for (const post of threadsPosts) {
    for (const topic of extractTopics(post.text)) {
      const existing = runCounts.get(topic);
      if (existing) {
        existing.count += 1;
      } else {
        runCounts.set(topic, { count: 1, samplePost: post });
      }
    }
  }

  // Оставляем только темы, у которых в этом прогоне достаточно упоминаний,
  // иначе будет шум из тысяч случайных слов, встретившихся один раз.
  const candidates = Array.from(runCounts.entries()).filter(([, value]) => value.count >= 2);
  if (candidates.length === 0) return;

  const topics = candidates.map(([topic]) => topic);
  const { data: existingRows, error: fetchError } = await supabaseAdmin
    .from("ai_social_monitor_trends")
    .select("*")
    .eq("source", "threads")
    .in("topic", topics);

  if (fetchError) throw fetchError;

  const existingByTopic = new Map(
    ((existingRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.topic), row])
  );

  const now = new Date().toISOString();
  const newlyTrending: Array<{ id: string; topic: string; windowCount: number; growth: number }> = [];

  for (const [topic, value] of candidates) {
    const existing = existingByTopic.get(topic);
    const previousWindowCount = existing ? Number(existing.window_count || 0) : 0;
    const wasTrending = existing ? Boolean(existing.is_trending) : false;
    const growthRatio = previousWindowCount > 0 ? value.count / previousWindowCount : value.count;
    const isTrending = value.count >= TREND_MIN_MENTIONS && growthRatio >= TREND_GROWTH_RATIO;

    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from("ai_social_monitor_trends")
      .upsert(
        {
          source: "threads",
          topic,
          mention_count: existing ? Number(existing.mention_count || 0) + value.count : value.count,
          window_count: value.count,
          previous_window_count: previousWindowCount,
          growth_ratio: Number(growthRatio.toFixed(2)),
          is_trending: isTrending,
          sample_post_url: value.samplePost.original_url,
          sample_post_text: value.samplePost.text.slice(0, 400),
          first_seen_at: existing ? String(existing.first_seen_at) : now,
          last_seen_at: now,
          updated_at: now,
        },
        { onConflict: "source,topic" }
      )
      .select("id")
      .single();

    if (upsertError) throw upsertError;

    if (isTrending && !wasTrending) {
      newlyTrending.push({
        id: (upserted as { id: string }).id,
        topic,
        windowCount: value.count,
        growth: growthRatio,
      });
    }
  }

  for (const trend of newlyTrending) {
    await supabaseAdmin.from("ai_social_monitor_notifications").upsert(
      {
        trend_id: trend.id,
        type: "trending_topic",
        score: Math.min(100, Math.round(trend.growth * 10)),
        title: `Trending on Threads: "${trend.topic}"`,
        body: `${trend.windowCount} mentions this scan, ${trend.growth.toFixed(1)}x growth vs previous scan.`,
      },
      { onConflict: "trend_id,type" }
    );
  }
}

export async function runSocialMonitorScan(options: { manual?: boolean } = {}) {
  const startedAt = new Date().toISOString();
  const settings = await getSocialMonitorSettings();
  const sources = (await getSocialMonitorSources()).filter(
    (source) => settings.enabled_sources.includes(source.id) && source.enabled
  );

  const { data: run, error: runError } = await supabaseAdmin
    .from("ai_social_monitor_runs")
    .insert({
      status: "running",
      started_at: startedAt,
      manual: Boolean(options.manual),
      sources_checked: sources.map((source) => source.id),
    })
    .select("id")
    .single();

  if (runError) throw runError;
  const runId = (run as { id: string }).id;

  try {
    const queries = await generateSearchQueries(settings, sources);
    const rawPosts: RawSocialPost[] = [];

    for (const source of sources) {
      const connector = connectors[source.id];
      if (!connector) continue;

      let sourceQueries = queries.filter((query) => query.source === source.id);
      if (source.id === "threads") {
        const seedQueries: QuerySpec[] = TREND_SEED_QUERIES.map((queryText) => ({
          source: "threads",
          query_text: queryText,
          language: "en",
          country: null,
          rationale: "Trend discovery seed query.",
        }));
        // Seed-запросы для трендов идут первыми, чтобы не быть вытесненными
        // лимитом на количество запросов к Threads за один прогон.
        sourceQueries = [...seedQueries, ...sourceQueries];
      }
      const limit = Number(source.config?.limit_per_query || 10);
      const sourcePosts = await connector.search(source, sourceQueries, limit);
      rawPosts.push(...sourcePosts);

      await supabaseAdmin
        .from("ai_social_monitor_sources")
        .update({ last_checked_at: new Date().toISOString(), status: "connected" })
        .eq("id", source.id);
    }

    await updateThreadsTrends(rawPosts);

    let postsFound = 0;
    let postsAnalyzed = 0;

    for (const post of rawPosts) {
      const { data: existing } = await supabaseAdmin
        .from("ai_social_monitor_posts")
        .select("id")
        .eq("source", post.source)
        .eq("external_id", post.external_id)
        .maybeSingle();

      if (existing) continue;

      postsFound += 1;
      const analysis = await analyzePublication(settings, post);
      const embedding = await generateEmbedding(
        [
          post.text,
          analysis.ai_problem,
          analysis.ai_goal,
          analysis.ai_summary,
          analysis.ai_reason,
        ].join("\n")
      );

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("ai_social_monitor_posts")
        .insert({
          source: post.source,
          external_id: post.external_id,
          author_name: post.author_name,
          author_handle: post.author_handle,
          author_url: post.author_url,
          country: post.country,
          language: post.language,
          posted_at: post.posted_at,
          text: post.text,
          text_translation: analysis.text_translation,
          original_url: post.original_url,
          raw: post.raw,
          ai_score: analysis.ai_score,
          ai_summary: analysis.ai_summary,
          ai_reason: analysis.ai_reason,
          ai_problem: analysis.ai_problem,
          ai_goal: analysis.ai_goal,
          ai_emotion: analysis.ai_emotion,
          ai_conversion_probability: analysis.ai_conversion_probability,
          ai_should_reply: analysis.ai_should_reply,
          ai_reply: analysis.ai_reply,
          detected_competitors: analysis.detected_competitors,
          ai_analysis: analysis.ai_analysis,
          embedding,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;
      postsAnalyzed += 1;
      await saveNotificationIfNeeded(settings, (inserted as { id: string }).id, analysis);
    }

    const finishedAt = new Date().toISOString();
    const nextScanAt = new Date(Date.now() + settings.check_interval_minutes * 60 * 1000).toISOString();

    await Promise.all([
      supabaseAdmin
        .from("ai_social_monitor_runs")
        .update({
          status: "completed",
          finished_at: finishedAt,
          posts_found: postsFound,
          posts_analyzed: postsAnalyzed,
          generated_queries: queries,
        })
        .eq("id", runId),
      supabaseAdmin
        .from("ai_social_monitor_settings")
        .update({ last_scan_at: finishedAt, next_scan_at: nextScanAt })
        .eq("id", DEFAULT_SETTINGS_ID),
    ]);

    return {
      ok: true,
      run_id: runId,
      sources_checked: sources.map((source) => source.id),
      queries_generated: queries.length,
      posts_seen: rawPosts.length,
      posts_found: postsFound,
      posts_analyzed: postsAnalyzed,
      next_scan_at: nextScanAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from("ai_social_monitor_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
      .eq("id", runId);
    throw error;
  }
}

export async function getSocialMonitorTrends(options: { onlyTrending?: boolean; limit?: number } = {}) {
  let query = supabaseAdmin
    .from("ai_social_monitor_trends")
    .select("*")
    .eq("source", "threads")
    .order("is_trending", { ascending: false })
    .order("window_count", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.onlyTrending) {
    query = query.eq("is_trending", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export function verifyCronAuth(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "development") return true;
  if (!cronSecret) return false;

  return authHeader === `Bearer ${cronSecret}`;
}

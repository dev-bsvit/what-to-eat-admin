// verifyUser.ts — проверяет JWT токен из iOS приложения,
// возвращает user_id и статус подписки.
// Используется во всех /api/ai/* эндпоинтах.

import { createClient } from "@supabase/supabase-js";

export type SubscriptionStatus = "free" | "monthly" | "yearly" | "lifetime";

export interface VerifiedUser {
  userId: string;
  subscriptionStatus: SubscriptionStatus;
  isPremium: boolean;
}

// Лимиты бесплатного тарифа (зеркало из iOS Subscription.swift)
export const FREE_LIMITS = {
  aiUsesPerDay: 1,
};

// Создаём клиент без service role — для проверки пользовательского JWT
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function verifyUser(request: Request): Promise<VerifiedUser> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401);
  }

  const jwt = authHeader.slice(7);

  // Проверяем токен через Supabase
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    throw new AuthError("Invalid or expired token", 401);
  }

  // Получаем статус подписки через service role (обходит RLS)
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("subscription_status, subscription_expires_at")
    .eq("id", user.id)
    .single();

  const rawStatus = profile?.subscription_status ?? "free";
  const expiresAt = profile?.subscription_expires_at
    ? new Date(profile.subscription_expires_at)
    : null;

  // Подписка истекла — считаем free
  let subscriptionStatus: SubscriptionStatus = "free";
  if (rawStatus === "lifetime") {
    subscriptionStatus = "lifetime";
  } else if (
    (rawStatus === "monthly" || rawStatus === "yearly") &&
    expiresAt &&
    expiresAt > new Date()
  ) {
    subscriptionStatus = rawStatus;
  }

  const isPremium = subscriptionStatus !== "free";

  return { userId: user.id, subscriptionStatus, isPremium };
}

// Проверяет и инкрементирует счётчик AI-запросов для free пользователей.
// Возвращает true если лимит не превышен, throws если превышен.
export async function checkAndIncrementAiUsage(userId: string): Promise<void> {
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Читаем текущий счётчик
  const { data } = await adminClient
    .from("ai_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  const currentCount = data?.count ?? 0;

  if (currentCount >= FREE_LIMITS.aiUsesPerDay) {
    throw new AuthError("Daily AI limit reached. Upgrade to Premium.", 403, "ai_limit_reached");
  }

  // Инкрементируем (upsert — создаём или обновляем запись за сегодня)
  await adminClient.from("ai_usage").upsert(
    { user_id: userId, date: today, count: currentCount + 1 },
    { onConflict: "user_id,date" }
  );
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number = 401,
    public reason?: string
  ) {
    super(message);
  }
}

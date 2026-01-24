import { NextResponse } from "next/server";
import { processIngredient, fillProductWithAI } from "@/lib/aiModerator";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Webhook handler for new products created in the database
 *
 * To enable real-time processing, set up a Supabase Database Webhook:
 * 1. Go to Supabase Dashboard > Database > Webhooks
 * 2. Create new webhook for INSERT on product_dictionary table
 * 3. Set URL to: https://your-domain.com/api/webhooks/product-created
 * 4. Add header: Authorization: Bearer YOUR_WEBHOOK_SECRET
 *
 * The webhook will automatically:
 * - Process new user-created products
 * - Try to link them to existing products
 * - Fill missing nutritional data with AI
 * - Create moderation tasks when needed
 */

// Verify webhook secret
function verifyWebhookAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const webhookSecret = process.env.WEBHOOK_SECRET;

  console.log(`[Webhook Auth] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[Webhook Auth] WEBHOOK_SECRET exists: ${!!webhookSecret}`);
  console.log(`[Webhook Auth] Auth header: ${authHeader?.substring(0, 20)}...`);

  // Allow in development
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  // If no secret configured, allow (for testing)
  if (!webhookSecret) {
    console.log("[Webhook Auth] No WEBHOOK_SECRET configured, allowing request");
    return true;
  }

  const isValid = authHeader === `Bearer ${webhookSecret}`;
  console.log(`[Webhook Auth] Validation result: ${isValid}`);
  return isValid;
}

interface SupabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: {
    id: string;
    canonical_name: string;
    auto_created?: boolean;
    user_created?: boolean;
    needs_moderation?: boolean;
    source_locale?: string;
    calories?: number | null;
    protein?: number | null;
    fat?: number | null;
    carbohydrates?: number | null;
    description?: string | null;
  };
  schema: string;
  old_record?: unknown;
}

export async function POST(request: Request) {
  // Verify authentication
  if (!verifyWebhookAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload: SupabaseWebhookPayload = await request.json();

    // Only process INSERT events
    if (payload.type !== "INSERT") {
      return NextResponse.json({ status: "ignored", reason: "Not an INSERT event" });
    }

    // Only process product_dictionary table
    if (payload.table !== "product_dictionary") {
      return NextResponse.json({ status: "ignored", reason: "Wrong table" });
    }

    const product = payload.record;

    // Process all new products (removed auto_created/user_created check)
    // Every new product should be processed for linking and data filling
    console.log(`[Webhook] Processing new product: ${product.canonical_name} (${product.id})`)

    const results: {
      productId: string;
      productName: string;
      linkResult?: unknown;
      fillResult?: unknown;
      moderationTaskCreated: boolean;
    } = {
      productId: product.id,
      productName: product.canonical_name,
      moderationTaskCreated: false,
    };

    // Step 1: Try to link to existing product
    const linkResult = await processIngredient(
      product.canonical_name,
      (product.source_locale as "ru" | "uk" | "en" | "fr" | "de" | "it" | "es" | "pt") || "ru"
    );
    results.linkResult = linkResult;

    // If linked to existing product, we might want to merge
    if (linkResult.action === "auto_linked" && linkResult.productId !== product.id) {
      // Create merge suggestion
      await supabaseAdmin.from("moderation_tasks").insert({
        task_type: "merge_suggestion",
        product_id: product.id,
        suggested_action: {
          productName: product.canonical_name,
          matchedWithId: linkResult.productId,
          matchedWithName: linkResult.productName,
          confidence: linkResult.confidence,
          autoCreated: true,
        },
        confidence: linkResult.confidence || 0.9,
        status: "pending",
      });
      results.moderationTaskCreated = true;
    }

    // Step 2: Fill missing data if product has gaps
    const needsFill =
      product.calories === null ||
      product.protein === null ||
      product.fat === null ||
      product.carbohydrates === null ||
      product.description === null;

    if (needsFill) {
      const fillResult = await fillProductWithAI(product.id, product.canonical_name);
      results.fillResult = fillResult;
    }

    // Step 3: Create moderation task if still needs review
    if (product.needs_moderation && !results.moderationTaskCreated) {
      await supabaseAdmin.from("moderation_tasks").insert({
        task_type: "new_product",
        product_id: product.id,
        suggested_action: {
          productName: product.canonical_name,
          userCreated: product.user_created,
          autoCreated: product.auto_created,
          sourceLocale: product.source_locale,
        },
        confidence: 0.5,
        status: "pending",
      });
      results.moderationTaskCreated = true;
    }

    return NextResponse.json({
      status: "processed",
      results,
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Also support GET for webhook verification
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Product webhook endpoint ready",
    supportedEvents: ["INSERT on product_dictionary"],
  });
}

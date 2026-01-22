import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

// ============================================================================
// Types
// ============================================================================

interface ImportedRecipe {
  title: string;
  description?: string;
  imageUrl?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  cuisine?: string;
  tags: string[];
  ingredients: Array<{
    name: string;
    amount: string;
    unit: string;
    note?: string;
  }>;
  steps: Array<{ text: string }>;
  sourceUrl: string;
  sourceDomain?: string;
  confidence: "high" | "medium" | "low";
}

interface InstagramExtraction {
  shortcode: string;
  caption: string;
  thumbnail_url?: string;
  video_path?: string | null;
  source_url: string;
  owner_username?: string;
}

type LinkSource = "instagram" | "tiktok" | "web";

// ============================================================================
// Constants
// ============================================================================

const OPENAI_URL = "https://api.openai.com/v1/responses";
const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const MODEL = "gpt-4o-mini";
const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

// Free tier limits
const FREE_IMPORTS_PER_DAY = 1;
const FREE_MAX_TOTAL_IMPORTS = 7;

// ============================================================================
// Supabase client
// ============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ============================================================================
// Link source detection
// ============================================================================

function detectLinkSource(url: string): LinkSource {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes("instagram.com") || lowerUrl.includes("instagr.am")) {
    return "instagram";
  }

  if (lowerUrl.includes("tiktok.com") || lowerUrl.includes("vm.tiktok.com")) {
    return "tiktok";
  }

  return "web";
}

function getDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function normalizeInstagramUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    parsed.search = "";
    parsed.hash = "";
    const path = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
    parsed.pathname = path;
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

// ============================================================================
// User limits checking
// ============================================================================

async function checkUserImportLimits(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  remaining?: number;
  isPremium: boolean;
}> {
  const supabase = getSupabaseAdmin();

  // Check if user has premium subscription
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status, subscription_expires_at")
    .eq("id", userId)
    .single();

  const isPremium = profile && (
    profile.subscription_status === "lifetime" ||
    (["monthly", "yearly"].includes(profile.subscription_status) &&
      profile.subscription_expires_at &&
      new Date(profile.subscription_expires_at) > new Date())
  );

  // Premium users have unlimited imports
  if (isPremium) {
    return { allowed: true, isPremium: true };
  }

  // Check user's import history
  const { data: imports, error } = await supabase
    .from("user_recipe_imports")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error checking import limits:", error);
    // Allow on error to not block users
    return { allowed: true, isPremium: false, remaining: 1 };
  }

  const totalImports = imports?.length || 0;

  // Check total limit (7 imports max for free users)
  if (totalImports >= FREE_MAX_TOTAL_IMPORTS) {
    return {
      allowed: false,
      reason: "free_limit_reached",
      remaining: 0,
      isPremium: false,
    };
  }

  // Check daily limit (1 per day)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayImports = imports?.filter((imp) => {
    const importDate = new Date(imp.created_at);
    return importDate >= today;
  }).length || 0;

  if (todayImports >= FREE_IMPORTS_PER_DAY) {
    return {
      allowed: false,
      reason: "daily_limit_reached",
      remaining: FREE_MAX_TOTAL_IMPORTS - totalImports,
      isPremium: false,
    };
  }

  return {
    allowed: true,
    remaining: FREE_MAX_TOTAL_IMPORTS - totalImports,
    isPremium: false,
  };
}

async function recordImport(userId: string, sourceUrl: string, sourceType: LinkSource) {
  const supabase = getSupabaseAdmin();

  await supabase.from("user_recipe_imports").insert({
    user_id: userId,
    source_url: sourceUrl,
    source_type: sourceType,
    created_at: new Date().toISOString(),
  });
}

// ============================================================================
// Process helpers
// ============================================================================

function runProcess(command: string, args: string[], cwd: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolve({ code: 127, stdout: "", stderr: message });
      return;
    }
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ code: 127, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

// ============================================================================
// Instagram import
// ============================================================================

async function transcribeAudio(apiKey: string, audioPath: string): Promise<string> {
  const audioBuffer = await fs.readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([audioBuffer]), path.basename(audioPath));
  form.append("model", TRANSCRIBE_MODEL);

  const response = await fetch(TRANSCRIBE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Transcription failed");
  }

  const data = await response.json();
  return data?.text ? String(data.text).trim() : "";
}

async function extractCoverFromVideo(videoPath: string, outputDir: string): Promise<string | null> {
  const coverPath = path.join(outputDir, `${path.basename(videoPath, ".mp4")}_cover.jpg`);
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const result = await runProcess(
    ffmpegPath,
    ["-y", "-ss", "00:00:01", "-i", videoPath, "-frames:v", "1", "-q:v", "2", coverPath],
    process.cwd()
  );

  if (result.code !== 0) {
    return null;
  }

  const buffer = await fs.readFile(coverPath);
  const base64 = buffer.toString("base64");
  return `data:image/jpeg;base64,${base64}`;
}

function looksLikeIngredients(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("ингредиенты") || lower.includes("ingredients")) return true;
  return text.split("\n").some((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^[-•]\s+/.test(trimmed)) return true;
    return /\d+(\s?[-–]?\s?\d+)?\s?(г|гр|кг|мл|л|шт|ч\.?л\.?|ст\.?л\.?)/i.test(trimmed);
  });
}

function looksLikeSteps(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("приготовление") || lower.includes("способ приготовления")) return true;
  if (lower.includes("шаг")) return true;
  return text.split("\n").some((line) => /^\d+[.)]\s+/.test(line.trim()));
}

function shouldSkipTranscription(caption: string): boolean {
  if (!caption) return false;
  return looksLikeIngredients(caption) && looksLikeSteps(caption);
}

function buildInstagramPrompt(inputText: string, sourceUrl: string, sourceDomain?: string): string {
  return `You get Instagram recipe text: caption + speech transcript (no translation).
Return JSON ONLY in the exact format below.

INPUT TEXT:
${inputText}

FORMAT:
{
  "title": "string",
  "description": "string?",
  "imageUrl": "string?",
  "prepTime": number,
  "cookTime": number,
  "servings": number,
  "cuisine": "string?",
  "tags": ["string"],
  "ingredients": [
    { "name": "string", "amount": "string", "unit": "string", "note": "string?" }
  ],
  "steps": [
    { "text": "string" }
  ],
  "sourceUrl": "${sourceUrl}",
  "sourceDomain": "${sourceDomain ?? ""}",
  "confidence": "high|medium|low"
}

RULES:
- Output ONLY valid JSON (no markdown).
- If info is missing, use null or empty arrays.
- Keep the original language; do NOT translate.
- prepTime/cookTime/servings are numbers or null.
- If amount/unit unknown, use empty strings.
- Steps are individual actions.
- tags should be simple, short words found in the text.
- confidence: high if ingredients+steps are clear, medium if partial, low if minimal.`;
}

function extractJson(content: string): string {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : content;
}

function normalizeRecipe(parsed: any, fallback: Partial<ImportedRecipe>): ImportedRecipe {
  return {
    title: String(parsed.title || fallback.title || "").trim(),
    description: parsed.description ? String(parsed.description).trim() : fallback.description,
    imageUrl: parsed.imageUrl || fallback.imageUrl,
    prepTime: Number.isFinite(parsed.prepTime) ? parsed.prepTime : fallback.prepTime,
    cookTime: Number.isFinite(parsed.cookTime) ? parsed.cookTime : fallback.cookTime,
    servings: Number.isFinite(parsed.servings) ? parsed.servings : fallback.servings,
    cuisine: parsed.cuisine ? String(parsed.cuisine).trim() : fallback.cuisine,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    ingredients: Array.isArray(parsed.ingredients)
      ? parsed.ingredients
          .map((i: any) => ({
            name: String(i.name || "").trim(),
            amount: String(i.amount || "").trim(),
            unit: String(i.unit || "").trim(),
            note: i.note ? String(i.note).trim() : undefined,
          }))
          .filter((i: any) => i.name.length > 0)
      : [],
    steps: Array.isArray(parsed.steps)
      ? parsed.steps
          .map((s: any) => ({
            text: String(s.text || s || "").trim(),
          }))
          .filter((s: any) => s.text.length > 0)
      : [],
    sourceUrl: String(parsed.sourceUrl || fallback.sourceUrl || "").trim(),
    sourceDomain: parsed.sourceDomain || fallback.sourceDomain,
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
  };
}

async function importFromInstagram(url: string, apiKey: string): Promise<ImportedRecipe> {
  const cwd = process.cwd();
  const outputDir = path.join(cwd, "tmp", "instagram");
  await fs.mkdir(outputDir, { recursive: true });

  const scriptPath = path.join(cwd, "scripts", "instagram_import.py");
  const normalizedUrl = normalizeInstagramUrl(url);
  const pythonCandidates = [
    process.env.PYTHON_PATH,
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "python3",
    "python",
  ].filter(Boolean) as string[];

  let extraction = { code: 127, stdout: "", stderr: "Python not found" };
  for (const candidate of pythonCandidates) {
    const result = await runProcess(candidate, [scriptPath, "--url", normalizedUrl, "--output", outputDir], cwd);
    if (result.code === 0) {
      extraction = result;
      break;
    }
    extraction = result;
  }

  if (extraction.code !== 0) {
    throw new Error(`Instagram extract failed: ${extraction.stderr || extraction.stdout}`);
  }

  let extracted: InstagramExtraction;
  try {
    extracted = JSON.parse(extraction.stdout.trim());
  } catch {
    throw new Error(`Invalid extractor response: ${extraction.stdout}`);
  }

  if ((extracted as any).error) {
    throw new Error((extracted as any).message || "Extraction failed");
  }

  console.info("[instagram:user] extracted", {
    shortcode: extracted.shortcode,
    hasCaption: Boolean(extracted.caption?.trim()),
    thumbnailUrl: extracted.thumbnail_url || null,
    videoPath: extracted.video_path || null,
    owner: extracted.owner_username || null,
  });

  let transcript = "";
  let coverDataUrl: string | null = null;
  const skipTranscription = shouldSkipTranscription(extracted.caption || "");
  console.info("[instagram:user] skipTranscription", { skip: skipTranscription });

  if (extracted.video_path) {
    const audioPath = path.join(outputDir, `${extracted.shortcode}.mp3`);
    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

    if (!skipTranscription) {
      const ffmpegResult = await runProcess(
        ffmpegPath,
        ["-y", "-i", extracted.video_path, "-vn", "-acodec", "mp3", audioPath],
        cwd
      );

      console.info("[instagram:user] ffmpeg audio", {
        code: ffmpegResult.code,
        stderr: ffmpegResult.stderr?.slice(0, 300),
      });

      if (ffmpegResult.code === 0) {
        transcript = await transcribeAudio(apiKey, audioPath);
      }
    }

    if (!extracted.thumbnail_url) {
      coverDataUrl = await extractCoverFromVideo(extracted.video_path, outputDir);
      console.info("[instagram:user] cover from video", { ok: Boolean(coverDataUrl) });
    }
  }

  const combinedText = [extracted.caption, transcript].filter(Boolean).join("\n\n").trim();
  console.info("[instagram:user] combinedText", { length: combinedText.length });
  if (!combinedText) {
    throw new Error("No text to parse");
  }

  const imageUrl = extracted.thumbnail_url || coverDataUrl || undefined;
  const prompt = buildInstagramPrompt(combinedText, extracted.source_url, getDomain(extracted.source_url));

  const aiResponse = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      temperature: 0.2,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    throw new Error(`AI error: ${errorText}`);
  }

  const aiData = await aiResponse.json();
  const aiText = aiData?.output?.[0]?.content?.[0]?.text;
  if (!aiText) {
    throw new Error("Empty AI response");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(extractJson(aiText));
  } catch {
    throw new Error(`Invalid JSON from AI: ${aiText}`);
  }

  const fallback: Partial<ImportedRecipe> = {
    title: extracted.caption?.split("\n")[0]?.trim() || "Instagram recipe",
    description: extracted.caption?.trim(),
    imageUrl: imageUrl,
    sourceUrl: extracted.source_url,
    sourceDomain: getDomain(extracted.source_url),
  };

  return normalizeRecipe(parsed, fallback);
}

// ============================================================================
// Web import (JSON-LD + HTML parsing)
// ============================================================================

async function importFromWeb(url: string, apiKey: string): Promise<ImportedRecipe> {
  console.log("🌐 Importing recipe from web:", url);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const domain = getDomain(url) || "";

  // Try JSON-LD first
  let recipe = extractFromJsonLD(html, url);
  let method = "JSON-LD";

  // Fallback to HTML parsing
  if (!recipe) {
    recipe = extractFromHtml(html, url);
    method = "HTML parsing";
  }

  if (!recipe) {
    throw new Error("Recipe not found on this page");
  }

  // AI cleanup if data is incomplete
  if (apiKey && (recipe.ingredients.length === 0 || recipe.steps.length === 0 || recipe.confidence === "low")) {
    console.log("🤖 Running AI cleanup...");
    const aiResult = await cleanupRecipeWithAI(recipe, apiKey);
    if (aiResult) {
      if (aiResult.ingredients.length > recipe.ingredients.length) {
        recipe.ingredients = aiResult.ingredients;
      }
      if (aiResult.steps.length > recipe.steps.length) {
        recipe.steps = aiResult.steps;
      }
      if (recipe.ingredients.length > 0 && recipe.steps.length > 0) {
        recipe.confidence = "medium";
      }
      method += " + AI cleanup";
    }
  }

  console.log(`✅ Recipe imported via ${method}`);
  return recipe;
}

function extractFromJsonLD(html: string, sourceUrl: string): ImportedRecipe | null {
  try {
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1].trim());
        const recipe = findRecipeInJson(data);
        if (recipe) {
          return parseRecipeFromJsonLD(recipe, sourceUrl);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore
  }
  return null;
}

function findRecipeInJson(data: any): any {
  if (!data) return null;

  if (data["@type"]) {
    const type = Array.isArray(data["@type"]) ? data["@type"] : [data["@type"]];
    if (type.some((t: string) => t.toLowerCase().includes("recipe"))) {
      return data;
    }
  }

  if (data["@graph"] && Array.isArray(data["@graph"])) {
    for (const item of data["@graph"]) {
      const found = findRecipeInJson(item);
      if (found) return found;
    }
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeInJson(item);
      if (found) return found;
    }
  }

  return null;
}

function parseRecipeFromJsonLD(data: any, sourceUrl: string): ImportedRecipe {
  const domain = getDomain(sourceUrl);

  return {
    title: getString(data.name) || "Recipe",
    description: getString(data.description),
    imageUrl: getImageUrl(data.image),
    prepTime: parseDuration(data.prepTime),
    cookTime: parseDuration(data.cookTime) || parseDuration(data.totalTime),
    servings: parseServings(data.recipeYield),
    cuisine: getString(data.recipeCuisine),
    tags: getStringArray(data.keywords),
    ingredients: parseIngredients(data.recipeIngredient),
    steps: parseInstructions(data.recipeInstructions),
    sourceUrl,
    sourceDomain: domain,
    confidence: "high",
  };
}

function extractFromHtml(html: string, sourceUrl: string): ImportedRecipe | null {
  const $ = cheerio.load(html);
  const domain = getDomain(sourceUrl);

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().split("|")[0].split("-")[0].trim() ||
    $("h1").first().text().trim();

  if (!title) return null;

  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content");

  const imageUrl =
    $('meta[property="og:image"]').attr("content") ||
    $("img").first().attr("src");

  // Parse ingredients
  const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
  $('[class*="ingredient"], [itemprop="recipeIngredient"], .ingredients li').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 3 && text.length < 200) {
      ingredients.push(parseIngredientText(text));
    }
  });

  // Parse steps
  const steps: Array<{ text: string }> = [];
  $('[class*="instruction"], [class*="step"], [itemprop="recipeInstructions"], ol li').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 20 && text.length < 2000) {
      steps.push({ text });
    }
  });

  return {
    title,
    description,
    imageUrl,
    prepTime: undefined,
    cookTime: undefined,
    servings: undefined,
    cuisine: undefined,
    tags: [],
    ingredients: ingredients.slice(0, 30),
    steps: steps.slice(0, 20),
    sourceUrl,
    sourceDomain: domain,
    confidence: ingredients.length > 0 && steps.length > 0 ? "medium" : "low",
  };
}

async function cleanupRecipeWithAI(
  recipe: ImportedRecipe,
  apiKey: string
): Promise<{ ingredients: Array<{ name: string; amount: string; unit: string }>; steps: Array<{ text: string }> } | null> {
  const prompt = `Extract recipe data. Return JSON only:
Recipe: ${recipe.title}
${recipe.description ? `Desc: ${recipe.description.slice(0, 200)}` : ""}
Ingr: ${recipe.ingredients.length > 0 ? JSON.stringify(recipe.ingredients.slice(0, 15).map((i) => i.name)) : "[]"}
Steps: ${recipe.steps.length > 0 ? recipe.steps.slice(0, 10).map((s) => s.text.slice(0, 100)).join("; ") : ""}

{"ingredients":[{"name":"","amount":"","unit":""}],"steps":[{"text":""}]}`;

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        temperature: 0.1,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.output?.[0]?.content?.[0]?.text;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);

    return {
      ingredients: Array.isArray(parsed.ingredients)
        ? parsed.ingredients
            .map((i: any) => ({
              name: String(i.name || "").trim(),
              amount: String(i.amount || "").trim(),
              unit: String(i.unit || "").trim(),
            }))
            .filter((i: any) => i.name.length > 0)
        : [],
      steps: Array.isArray(parsed.steps)
        ? parsed.steps
            .map((s: any) => ({
              text: String(s.text || s || "").trim(),
            }))
            .filter((s: any) => s.text.length > 0)
        : [],
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Utility functions
// ============================================================================

function getString(value: any): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return undefined;
}

function getStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function getImageUrl(value: any): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    return typeof first === "string" ? first : first?.url;
  }
  if (value && typeof value === "object") {
    return value.url || value.contentUrl;
  }
  return undefined;
}

function parseDuration(value: any): number | undefined {
  if (!value) return undefined;

  const str = String(value);
  const isoMatch = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (isoMatch) {
    const hours = parseInt(isoMatch[1] || "0");
    const minutes = parseInt(isoMatch[2] || "0");
    return hours * 60 + minutes;
  }

  const hourMatch = str.match(/(\d+)\s*(?:hour|час)/i);
  const minMatch = str.match(/(\d+)\s*(?:minute|мин)/i);

  let total = 0;
  if (hourMatch) total += parseInt(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);

  return total || undefined;
}

function parseServings(value: any): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }
  return undefined;
}

function parseIngredients(value: any): Array<{ name: string; amount: string; unit: string }> {
  if (!value) return [];

  const items: string[] = [];
  if (Array.isArray(value)) {
    items.push(...value.map((v) => (typeof v === "string" ? v : "")).filter(Boolean));
  } else if (typeof value === "string") {
    items.push(...value.split("\n").filter(Boolean));
  }

  return items.map(parseIngredientText);
}

function parseInstructions(value: any): Array<{ text: string }> {
  if (!value) return [];

  const steps: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        steps.push(item);
      } else if (item && typeof item === "object") {
        const text = item.text || item.name;
        if (typeof text === "string") steps.push(text);
      }
    }
  } else if (typeof value === "string") {
    steps.push(...value.split("\n").filter((s) => s.trim().length > 0));
  }

  return steps.map((text) => ({ text: text.trim() }));
}

function parseIngredientText(text: string): { name: string; amount: string; unit: string } {
  const cleaned = text.trim();
  const pattern = /^([\d/.,]+)\s*([а-яёa-z.]+)?\s*(.+)$/i;
  const match = cleaned.match(pattern);

  if (match) {
    const amount = match[1].replace(",", ".");
    const unit = (match[2] || "").trim();
    const name = (match[3] || "").trim();
    return { name: name || cleaned, amount, unit };
  }

  return { name: cleaned, amount: "", unit: "" };
}

// ============================================================================
// Main API handler
// ============================================================================

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await request.json();
    const { url, userId } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Check user limits
    const limits = await checkUserImportLimits(userId);
    if (!limits.allowed) {
      return NextResponse.json(
        {
          error: "import_limit_reached",
          reason: limits.reason,
          remaining: limits.remaining,
          isPremium: limits.isPremium,
          message:
            limits.reason === "daily_limit_reached"
              ? "Вы исчерпали дневной лимит импорта. Попробуйте завтра или оформите Premium."
              : "Вы исчерпали бесплатный лимит импорта. Оформите Premium для неограниченного импорта.",
        },
        { status: 429 }
      );
    }

    // Detect link source
    const linkSource = detectLinkSource(url);
    console.log(`📥 Import request: ${linkSource} - ${url}`);

    let recipe: ImportedRecipe;

    try {
      if (linkSource === "instagram") {
        recipe = await importFromInstagram(url, apiKey);
      } else if (linkSource === "tiktok") {
        // TikTok not supported yet, treat as web
        recipe = await importFromWeb(url, apiKey);
      } else {
        recipe = await importFromWeb(url, apiKey);
      }
    } catch (error) {
      console.error("Import error:", error);
      return NextResponse.json(
        {
          error: "import_failed",
          message: error instanceof Error ? error.message : "Failed to import recipe",
        },
        { status: 500 }
      );
    }

    // Record successful import
    await recordImport(userId, url, linkSource);

    return NextResponse.json({
      recipe,
      meta: {
        source: linkSource,
        timestamp: new Date().toISOString(),
        remaining: limits.remaining !== undefined ? limits.remaining - 1 : undefined,
        isPremium: limits.isPremium,
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

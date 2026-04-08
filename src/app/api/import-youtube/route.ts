import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

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

interface YouTubeExtraction {
  video_id: string;
  title: string;
  description: string;
  subtitles: string;
  thumbnail_url?: string | null;
  audio_path?: string | null;
  source_url: string;
  uploader?: string | null;
  audio_error?: string | null;
}

interface YouTubePreview {
  video_id?: string | null;
  title: string;
  thumbnail_url?: string | null;
  source_url: string;
  uploader?: string | null;
}

const MODEL = "gpt-4o-mini";
const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

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

function getDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function truncateLog(value: string | null | undefined, max = 1000) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function logProcessResult(label: string, result: { code: number; stdout: string; stderr: string }) {
  console.info(label, {
    code: result.code,
    stdout: truncateLog(result.stdout, 300),
    stderr: truncateLog(result.stderr, 1200),
  });
}

function isInterpreterMissing(result: { code: number; stderr: string }) {
  if (result.code === 127) return true;
  return /enoent|not found/i.test(result.stderr);
}

function parseStructuredFailure(stdout: string, stderr: string) {
  try {
    const parsed = JSON.parse(stdout.trim());
    if (parsed && typeof parsed === "object" && (parsed.error || parsed.message)) {
      return {
        error: String(parsed.error || "YouTube extract failed"),
        details: String(parsed.message || stderr || stdout).trim(),
      };
    }
  } catch {
    // Not structured JSON, fall back to stderr/stdout.
  }

  const details = (stderr || stdout).trim();
  if (!details) return null;

  return {
    error: "YouTube extract failed",
    details,
  };
}

function extractJson(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : content;
}

function extractYouTubeVideoId(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        return parts[1] || null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function buildYouTubeWatchUrl(rawUrl: string) {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) return rawUrl;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function fetchYouTubePreview(rawUrl: string): Promise<YouTubePreview | null> {
  const normalizedUrl = buildYouTubeWatchUrl(rawUrl);
  const videoId = extractYouTubeVideoId(normalizedUrl);
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`;

  try {
    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn("[youtube] oembed failed", { status: response.status, url: normalizedUrl });
      return null;
    }

    const data = await response.json();
    const title = data?.title ? String(data.title).trim() : "";
    const thumbnailUrl = data?.thumbnail_url ? String(data.thumbnail_url).trim() : null;
    const uploader = data?.author_name ? String(data.author_name).trim() : null;

    if (!title && !thumbnailUrl) {
      return null;
    }

    return {
      video_id: videoId,
      title: title || "YouTube video",
      thumbnail_url: thumbnailUrl,
      source_url: normalizedUrl,
      uploader,
    };
  } catch (error) {
    console.warn("[youtube] oembed error", {
      url: normalizedUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function normalizeRecipe(parsed: any, fallback: Partial<ImportedRecipe>): ImportedRecipe {
  const title = String(parsed.title || fallback.title || "Рецепт из YouTube").trim();

  let ingredients = Array.isArray(parsed.ingredients)
    ? parsed.ingredients
        .map((i: any) => ({
          name: String(i.name || "").trim(),
          amount: String(i.amount || "").trim(),
          unit: String(i.unit || "").trim(),
          note: i.note ? String(i.note).trim() : undefined,
        }))
        .filter((i: any) => i.name.length > 0)
    : [];

  let steps = Array.isArray(parsed.steps)
    ? parsed.steps
        .map((s: any) => ({
          text: String(s.text || s || "").trim(),
        }))
        .filter((s: any) => s.text.length > 0)
    : [];

  if (ingredients.length === 0) {
    ingredients = [
      { name: "Основной ингредиент", amount: "по вкусу", unit: "", note: "Уточните по видео" }
    ];
  }

  if (steps.length === 0) {
    steps = [
      { text: "Подготовьте ингредиенты согласно видео" },
      { text: "Следуйте инструкциям из оригинального видео" }
    ];
  }

  return {
    title,
    description: parsed.description ? String(parsed.description).trim() : fallback.description,
    imageUrl: parsed.imageUrl || fallback.imageUrl,
    prepTime: Number.isFinite(parsed.prepTime) ? parsed.prepTime : (fallback.prepTime || 15),
    cookTime: Number.isFinite(parsed.cookTime) ? parsed.cookTime : (fallback.cookTime || 30),
    servings: Number.isFinite(parsed.servings) ? parsed.servings : (fallback.servings || 4),
    cuisine: parsed.cuisine ? String(parsed.cuisine).trim() : (fallback.cuisine || "international"),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    ingredients,
    steps,
    sourceUrl: String(parsed.sourceUrl || fallback.sourceUrl || "").trim(),
    sourceDomain: parsed.sourceDomain || fallback.sourceDomain || "youtube.com",
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
  };
}

async function transcribeAudio(apiKey: string, audioPath: string) {
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

function buildPrompt(inputText: string, sourceUrl: string, sourceDomain?: string, imageUrl?: string) {
  return `Extract recipe from YouTube video (description + subtitles/transcript). Return VALID JSON only.

INPUT TEXT:
${inputText}

REQUIRED OUTPUT FORMAT (copy structure exactly):
{
  "title": "Recipe name from text or generate descriptive title",
  "description": "Brief description",
  "imageUrl": ${imageUrl ? `"${imageUrl}"` : "null"},
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "cuisine": "international",
  "tags": ["quick", "dinner"],
  "ingredients": [
    { "name": "ingredient name", "amount": "100", "unit": "г", "note": "" }
  ],
  "steps": [
    { "text": "Step description" }
  ],
  "sourceUrl": "${sourceUrl}",
  "sourceDomain": "${sourceDomain || "youtube.com"}",
  "confidence": "medium"
}

CRITICAL RULES:
1. ALWAYS return valid JSON - no markdown, no comments, no extra text
2. NEVER return empty arrays for ingredients or steps - ALWAYS extract or infer:
   - If cooking mentioned but amounts unclear: use "по вкусу" or estimate typical amounts (100г, 1 шт)
   - If steps unclear: create logical cooking sequence based on mentioned ingredients/actions
   - If only dish name known: infer typical ingredients and basic cooking steps
3. ALWAYS fill required fields with defaults if unknown
4. For ingredients without specific amounts: use "по вкусу", "1 шт", "100 г" etc.
5. Keep ORIGINAL language - do NOT translate Russian to English or vice versa
6. confidence: "high" if clear recipe, "medium" if inferred some data, "low" if mostly guessed
7. Extract ALL mentioned food items as ingredients, even if amounts are not specified
8. YouTube descriptions often contain full recipe - look for ingredient lists and step-by-step instructions
9. Subtitles/transcript contain spoken recipe instructions - extract cooking steps from speech
10. TAGS — choose only from this list (pick all that apply):
    Time: "quick" (≤20 min total), "special occasion" (>60 min total)
    Calories: "light" (<300 kcal/serving), "hearty" (>650 kcal/serving)
    Meal: "breakfast", "lunch", "dinner", "snack"
    Diet: "vegetarian", "vegan", "gluten-free", "dairy-free"
    Type: "soup", "salad", "pasta", "grill", "baking", "raw"
    If total time unknown but dish looks quick → add "quick". Do NOT add tags not in this list.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, metaOnly = false } = body;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!metaOnly && !apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    const ensuredApiKey = apiKey ?? "";

    const cwd = process.cwd();
    const outputDir = path.join(cwd, "tmp", "youtube");
    await fs.mkdir(outputDir, { recursive: true });

    const scriptPath = path.join(cwd, "scripts", "youtube_import.py");
    try {
      await fs.access(scriptPath);
    } catch {
      return NextResponse.json(
        {
          error: "YouTube extractor script is missing",
          details: scriptPath,
        },
        { status: 500 }
      );
    }

    const pythonCandidates = Array.from(
      new Set(
        [
          process.env.PYTHON_PATH,
          "/usr/bin/python3",
          "/usr/local/bin/python3",
          "python3",
          "python",
        ].filter(Boolean) as string[]
      )
    );

    console.info("[youtube] request", {
      url: url.trim(),
      metaOnly,
      outputDir,
      scriptPath,
      pythonCandidates,
      ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
    });

    // Step 1: Extract metadata + subtitles (no audio)
    let extraction = { code: 127, stdout: "", stderr: "Python not found" };
    const attempts: Array<{ command: string; code: number; stderr: string }> = [];
    let pythonUsed = "";
    for (const candidate of pythonCandidates) {
      const result = await runProcess(
        candidate,
        [scriptPath, "--url", url.trim(), "--output", outputDir],
        cwd
      );
      logProcessResult("[youtube] extractor attempt", result);
      attempts.push({
        command: candidate,
        code: result.code,
        stderr: truncateLog(result.stderr, 300),
      });
      pythonUsed = candidate;
      if (result.code === 0) {
        extraction = result;
        break;
      }

      if (!isInterpreterMissing(result) && parseStructuredFailure(result.stdout, result.stderr)) {
        extraction = result;
        break;
      }

      extraction = result;
    }

    if (extraction.code !== 0) {
      logProcessResult("[youtube] extractor failed", extraction);
      const structuredFailure = parseStructuredFailure(extraction.stdout, extraction.stderr);
      if (metaOnly) {
        const preview = await fetchYouTubePreview(url.trim());
        if (preview) {
          console.info("[youtube] metaOnly fallback preview", {
            videoId: preview.video_id,
            title: preview.title.slice(0, 60),
            thumbnailUrl: preview.thumbnail_url || null,
            uploader: preview.uploader || null,
          });
          return NextResponse.json(preview);
        }
      }
      return NextResponse.json(
        {
          error: structuredFailure?.error || "YouTube extract failed",
          details: structuredFailure?.details || extraction.stderr || extraction.stdout,
          python: pythonUsed || pythonCandidates[0],
          candidates: pythonCandidates,
          attempts,
        },
        { status: 500 }
      );
    }

    let extracted: YouTubeExtraction;
    try {
      extracted = JSON.parse(extraction.stdout.trim());
    } catch {
      logProcessResult("[youtube] extractor invalid json", extraction);
      return NextResponse.json(
        { error: "Invalid extractor response", details: extraction.stdout },
        { status: 500 }
      );
    }

    if ((extracted as any).error) {
      return NextResponse.json({ error: (extracted as any).message || "Extraction failed" }, { status: 500 });
    }

    console.info("[youtube] extracted", {
      videoId: extracted.video_id,
      title: extracted.title?.slice(0, 60),
      hasDescription: Boolean(extracted.description?.trim()),
      hasSubtitles: Boolean(extracted.subtitles?.trim()),
      thumbnailUrl: extracted.thumbnail_url || null,
      uploader: extracted.uploader || null,
    });

    if (metaOnly) {
      return NextResponse.json({
        video_id: extracted.video_id,
        title: extracted.title || "YouTube video",
        thumbnail_url: extracted.thumbnail_url || null,
        source_url: extracted.source_url,
        uploader: extracted.uploader || null,
      });
    }

    // Step 2: Try description + subtitles first
    const descriptionText = (extracted.description || "").trim();
    const subtitlesText = (extracted.subtitles || "").trim();
    const combinedDescSubs = [
      extracted.title ? `Название: ${extracted.title}` : "",
      descriptionText ? `Описание:\n${descriptionText}` : "",
      subtitlesText ? `Субтитры:\n${subtitlesText.slice(0, 5000)}` : "",
    ].filter(Boolean).join("\n\n").trim();

    let recipeFromDescription: ImportedRecipe | null = null;

    if (combinedDescSubs.length > 50) {
      console.info("[youtube] trying description + subtitles parsing");
      const descPrompt = buildPrompt(
        combinedDescSubs,
        extracted.source_url,
        getDomain(extracted.source_url),
        extracted.thumbnail_url || undefined
      );

          const descAiResponse = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ensuredApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, input: descPrompt, temperature: 0.2 }),
      });

      if (descAiResponse.ok) {
        const descAiData = await descAiResponse.json();
        const descAiText = descAiData?.output?.[0]?.content?.[0]?.text;
        if (descAiText) {
          try {
            const parsed = JSON.parse(extractJson(descAiText));
            const normalized = normalizeRecipe(parsed, {
              title: extracted.title || descriptionText.split("\n")[0]?.trim(),
              description: descriptionText.slice(0, 300),
              imageUrl: extracted.thumbnail_url || undefined,
              sourceUrl: extracted.source_url,
              sourceDomain: getDomain(extracted.source_url),
            });
            if (normalized.confidence !== "low" && normalized.ingredients.length > 1) {
              recipeFromDescription = normalized;
            }
          } catch {
            // JSON parse failed
          }
        }
      }
    }

    if (recipeFromDescription) {
      console.info("[youtube] recipe found from description + subtitles");
      return NextResponse.json({
        recipe: recipeFromDescription,
        meta: {
          method: "youtube+description+ai",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Step 3: Fallback — download audio and transcribe
    console.info("[youtube] description insufficient, downloading audio for transcription");

    let audioExtraction = { code: 127, stdout: "", stderr: "Python not found" };
    const audioAttempts: Array<{ command: string; code: number; stderr: string }> = [];
    for (const candidate of pythonCandidates) {
      const result = await runProcess(
        candidate,
        [scriptPath, "--url", url.trim(), "--output", outputDir, "--audio"],
        cwd
      );
      logProcessResult("[youtube] audio extractor attempt", result);
      audioAttempts.push({
        command: candidate,
        code: result.code,
        stderr: truncateLog(result.stderr, 300),
      });
      if (result.code === 0) {
        audioExtraction = result;
        break;
      }

      if (!isInterpreterMissing(result) && parseStructuredFailure(result.stdout, result.stderr)) {
        audioExtraction = result;
        break;
      }

      audioExtraction = result;
    }

    if (audioExtraction.code !== 0) {
      logProcessResult("[youtube] audio extractor failed", audioExtraction);
      console.info("[youtube] audio extractor attempts", audioAttempts);
    }

    let audioExtracted: YouTubeExtraction | null = null;
    if (audioExtraction.code === 0) {
      try {
        audioExtracted = JSON.parse(audioExtraction.stdout.trim());
      } catch {
        // continue
      }
    }

    let transcript = "";
    const audioPath = audioExtracted?.audio_path;

    if (audioPath) {
      // For long YouTube videos, we may need to trim audio to first 10 minutes
      const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
      const trimmedPath = path.join(outputDir, `${extracted.video_id}_trimmed.mp3`);

      const trimResult = await runProcess(
        ffmpegPath,
        ["-y", "-i", audioPath, "-t", "600", "-acodec", "mp3", trimmedPath],
        cwd
      );

      const pathToTranscribe = trimResult.code === 0 ? trimmedPath : audioPath;
      console.info("[youtube] transcribing audio", { path: pathToTranscribe });

      try {
        transcript = await transcribeAudio(ensuredApiKey, pathToTranscribe);
        console.info("[youtube] transcript length", { length: transcript.length });
      } catch (err) {
        console.error("[youtube] transcription error", err);
      }
    }

    // Step 4: Parse with AI using all available text
    const allText = [
      extracted.title ? `Название: ${extracted.title}` : "",
      descriptionText ? `Описание:\n${descriptionText}` : "",
      subtitlesText ? `Субтитры:\n${subtitlesText.slice(0, 3000)}` : "",
      transcript ? `Транскрипция аудио:\n${transcript.slice(0, 5000)}` : "",
    ].filter(Boolean).join("\n\n").trim();

    if (!allText) {
      return NextResponse.json({ error: "No text to parse" }, { status: 500 });
    }

    const prompt = buildPrompt(
      allText,
      extracted.source_url,
      getDomain(extracted.source_url),
      extracted.thumbnail_url || undefined
    );

    const aiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ensuredApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: prompt, temperature: 0.2 }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return NextResponse.json({ error: "AI error", details: errorText }, { status: 500 });
    }

    const aiData = await aiResponse.json();
    const aiText = aiData?.output?.[0]?.content?.[0]?.text;
    if (!aiText) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(aiText));
    } catch {
      return NextResponse.json({ error: "Invalid JSON from AI", raw: aiText }, { status: 500 });
    }

    const fallback: Partial<ImportedRecipe> = {
      title: extracted.title || "YouTube recipe",
      description: descriptionText.slice(0, 300),
      imageUrl: extracted.thumbnail_url || undefined,
      sourceUrl: extracted.source_url,
      sourceDomain: getDomain(extracted.source_url),
    };

    const recipe = normalizeRecipe(parsed, fallback);

    return NextResponse.json({
      recipe,
      meta: {
        method: transcript ? "youtube+whisper+ai" : "youtube+description+ai",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

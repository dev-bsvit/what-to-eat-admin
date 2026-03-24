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

function extractJson(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : content;
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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const cwd = process.cwd();
    const outputDir = path.join(cwd, "tmp", "youtube");
    await fs.mkdir(outputDir, { recursive: true });

    const scriptPath = path.join(cwd, "scripts", "youtube_import.py");
    const pythonCandidates = [
      process.env.PYTHON_PATH,
      "/usr/bin/python3",
      "/usr/local/bin/python3",
      "python3",
      "python",
    ].filter(Boolean) as string[];

    // Step 1: Extract metadata + subtitles (no audio)
    let extraction = { code: 127, stdout: "", stderr: "Python not found" };
    let pythonUsed = "";
    for (const candidate of pythonCandidates) {
      const result = await runProcess(
        candidate,
        [scriptPath, "--url", url.trim(), "--output", outputDir],
        cwd
      );
      pythonUsed = candidate;
      if (result.code === 0) {
        extraction = result;
        break;
      }
      extraction = result;
    }

    if (extraction.code !== 0) {
      return NextResponse.json(
        {
          error: "YouTube extract failed",
          details: extraction.stderr || extraction.stdout,
          python: pythonUsed,
        },
        { status: 500 }
      );
    }

    let extracted: YouTubeExtraction;
    try {
      extracted = JSON.parse(extraction.stdout.trim());
    } catch {
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
          Authorization: `Bearer ${apiKey}`,
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

    let audioExtraction = { code: 127, stdout: "", stderr: "" };
    for (const candidate of pythonCandidates) {
      const result = await runProcess(
        candidate,
        [scriptPath, "--url", url.trim(), "--output", outputDir, "--audio"],
        cwd
      );
      if (result.code === 0) {
        audioExtraction = result;
        break;
      }
      audioExtraction = result;
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
        transcript = await transcribeAudio(apiKey, pathToTranscribe);
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
        Authorization: `Bearer ${apiKey}`,
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

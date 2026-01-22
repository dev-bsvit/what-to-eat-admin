import { NextResponse } from "next/server";

const OPENAI_URL = "https://api.openai.com/v1/responses";

interface RecipeInput {
  title: string;
  description?: string;
  ingredients: Array<{ name: string; amount: string; unit: string }>;
  steps: Array<{ text: string }>;
  rawHtml?: string; // опционально, для дополнительного контекста
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await request.json();
    const recipe: RecipeInput = body.recipe;

    if (!recipe || !recipe.title) {
      return NextResponse.json({ error: "Recipe with title is required" }, { status: 400 });
    }

    // Определяем, что нужно сделать
    const hasIngredients = recipe.ingredients && recipe.ingredients.length > 0;
    const hasSteps = recipe.steps && recipe.steps.length > 0;

    // Если всё есть - только чистим данные
    // Если чего-то нет - просим извлечь из имеющихся данных
    let task = "";
    if (!hasIngredients && !hasSteps) {
      task = "Extract ingredients and cooking steps from the description or title.";
    } else if (!hasIngredients) {
      task = "Extract ingredients from the cooking steps. Do not invent - only extract what is mentioned.";
    } else if (!hasSteps) {
      task = "Create simple cooking steps based on the ingredients and recipe title. Keep it minimal and logical.";
    } else {
      task = "Clean and structure the data. Remove duplicates, fix formatting, separate quantities from names.";
    }

    // Компактный промпт для экономии токенов
    const prompt = `Recipe cleanup task. ${task}

Title: ${recipe.title}
${recipe.description ? `Description: ${recipe.description}` : ""}
Ingredients: ${hasIngredients ? JSON.stringify(recipe.ingredients.slice(0, 20)) : "NONE"}
Steps: ${hasSteps ? JSON.stringify(recipe.steps.slice(0, 15).map(s => s.text)) : "NONE"}

RULES:
- Do NOT invent information
- Only organize and clean existing data
- Return ONLY valid JSON, no markdown

OUTPUT FORMAT:
{
  "ingredients": [{"name": "...", "amount": "...", "unit": "..."}],
  "steps": [{"text": "..."}],
  "confidence": "high|medium|low"
}`;

    console.log("🤖 AI Recipe Cleanup - Sending request...");

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        temperature: 0.1, // Низкая температура для предсказуемости
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ AI error:", errorText);
      return NextResponse.json({ error: errorText }, { status: 500 });
    }

    const data = await response.json();
    const content = data?.output?.[0]?.content?.[0]?.text;

    if (!content) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 500 });
    }

    // Парсим JSON из ответа
    let parsed;
    try {
      // Пробуем извлечь JSON из ответа (может быть обернут в markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(content);
      }
    } catch {
      console.error("❌ Invalid JSON from AI:", content);
      return NextResponse.json({ error: "Invalid JSON from AI", raw: content }, { status: 500 });
    }

    // Валидация и нормализация
    const result = {
      ingredients: Array.isArray(parsed.ingredients)
        ? parsed.ingredients.map((i: any) => ({
            name: String(i.name || "").trim(),
            amount: String(i.amount || "").trim(),
            unit: String(i.unit || "").trim(),
          })).filter((i: any) => i.name.length > 0)
        : recipe.ingredients,
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.map((s: any) => ({
            text: String(s.text || s || "").trim(),
          })).filter((s: any) => s.text.length > 0)
        : recipe.steps,
      confidence: parsed.confidence || "medium",
      aiProcessed: true,
    };

    console.log(`✅ AI Recipe Cleanup - Done: ${result.ingredients.length} ingredients, ${result.steps.length} steps`);

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("❌ AI Recipe Cleanup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

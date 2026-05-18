import { NextResponse } from "next/server";
import { translateBatch, APP_LANGUAGES } from "@/lib/translate";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const texts: string[] = body.texts;
    const sourceLang: string = String(body.sourceLang || "ru");

    if (!Array.isArray(texts) || !texts.length) {
      return NextResponse.json({ error: "texts array is required" }, { status: 400 });
    }

    const targets = APP_LANGUAGES.filter((l) => l !== sourceLang);
    const entries = await Promise.all(
      targets.map(async (lang) => {
        const translated = await translateBatch(texts, lang, sourceLang);
        return [lang, translated] as const;
      })
    );

    return NextResponse.json(Object.fromEntries(entries));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

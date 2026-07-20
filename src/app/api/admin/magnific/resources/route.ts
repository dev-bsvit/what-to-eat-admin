import { NextResponse } from "next/server";
import { MagnificApiError, searchMagnificResources } from "@/lib/magnific";

export const runtime = "nodejs";

const LANGUAGE_MAP: Record<string, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  it: "it-IT",
  es: "es-ES",
  "pt-BR": "pt-BR",
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const term = (searchParams.get("q") || "").trim();
    const requestedPage = Number(searchParams.get("page") || "1");
    const page = Number.isInteger(requestedPage) ? Math.min(100, Math.max(1, requestedPage)) : 1;
    const language = LANGUAGE_MAP[searchParams.get("lang") || ""] || "en-US";

    if (term.length < 2) {
      return NextResponse.json({ error: "Введите запрос минимум из двух символов." }, { status: 400 });
    }
    if (term.length > 120) {
      return NextResponse.json({ error: "Запрос слишком длинный." }, { status: 400 });
    }

    return NextResponse.json(await searchMagnificResources({ term, page, language }));
  } catch (error) {
    console.error("[magnific-search]", error);
    const status = error instanceof MagnificApiError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось выполнить поиск в Magnific." },
      { status }
    );
  }
}

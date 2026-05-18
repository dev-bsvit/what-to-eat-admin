import { NextResponse } from "next/server";
import { translateLandingToAllLanguages } from "@/lib/translate";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const landingData = body.landingData as Record<string, unknown>;
    const sourceLang: string = String(body.sourceLang || "ru");

    if (!landingData) {
      return NextResponse.json({ error: "landingData is required" }, { status: 400 });
    }

    const translations = await translateLandingToAllLanguages(landingData, sourceLang);
    return NextResponse.json({ translations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

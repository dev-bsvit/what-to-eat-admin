import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "html" ? "html" : "md";
  const filename = format === "html" ? "database-documentation.html" : "DATABASE_SCHEMA.md";
  const baseDir = path.join(process.cwd(), "..");
  const filePath = path.join(baseDir, filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Schema file not found" }, { status: 404 });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return NextResponse.json({ content, format });
}

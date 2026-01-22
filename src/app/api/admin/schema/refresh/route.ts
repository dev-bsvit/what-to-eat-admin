import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST() {
  const baseDir = path.join(process.cwd(), "..");
  const pythonPath = path.join(baseDir, ".venv", "bin", "python");
  const scriptPath = path.join(baseDir, "scripts", "generate_db_docs.py");

  return new Promise<NextResponse>((resolve) => {
    const child = spawn(pythonPath, [scriptPath], {
      cwd: baseDir,
      env: process.env,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: stderr || "Refresh failed" }, { status: 500 }));
      } else {
        resolve(NextResponse.json({ ok: true }));
      }
    });
  });
}

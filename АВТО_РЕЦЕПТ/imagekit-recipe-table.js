#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.manifest || !args.out) {
  printUsage();
  process.exit(args.help ? 0 : 1);
}

const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
if (!privateKey && !args.dryRun) {
  fail("Missing IMAGEKIT_PRIVATE_KEY environment variable.");
}

const urlEndpoint = normalizeEndpoint(process.env.IMAGEKIT_URL_ENDPOINT || "");
const quality = Number(args.quality || 80);
const folder = args.folder || process.env.IMAGEKIT_FOLDER || "/recipes";
const localWebpRequired = Boolean(args.localWebp);

main().catch((error) => {
  fail(error && error.stack ? error.stack : String(error));
});

async function main() {
  const items = readManifest(args.manifest);
  if (!items.length) fail(`Manifest has no recipes: ${args.manifest}`);

  ensureDir(path.dirname(path.resolve(args.out)));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "imagekit-recipes-"));
  const rows = [];
  if (!args.append) fs.writeFileSync(args.out, "", "utf8");

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const recipe = loadRecipeJson(item, index);
    const imagePath = path.resolve(item.imagePath || item.image || "");
    if (!fs.existsSync(imagePath)) fail(`Image not found for row ${index + 1}: ${imagePath}`);

    const baseName = item.fileName || makeFileName(recipe.title || `recipe-${index + 1}`);
    const webpPath = path.join(tempDir, ensureWebpName(baseName));
    const conversion = convertToWebp(imagePath, webpPath, quality);

    const uploadPath = conversion.path;
    const uploadedAsWebp = conversion.webp;
    if (!uploadedAsWebp && localWebpRequired) {
      fail(
        "Could not convert image to WebP locally. Install cwebp with `brew install webp` " +
          "or ImageMagick with `brew install imagemagick`, then rerun."
      );
    }

    if (args.dryRun) {
      const row = [stringifyRecipe(recipe), `dry-run://${path.basename(uploadPath)}`];
      rows.push(row);
      appendCsvRow(args.out, row);
      continue;
    }

    const uploaded = await uploadToImageKit({
      privateKey,
      filePath: uploadPath,
      fileName: path.basename(uploadPath),
      folder,
    });

    const imageUrl = uploadedAsWebp ? uploaded.url : transformedWebpUrl(uploaded.url, quality, urlEndpoint);
    const row = [stringifyRecipe(recipe), imageUrl];
    rows.push(row);
    appendCsvRow(args.out, row);
    console.log(`${index + 1}/${items.length}: ${recipe.title || "Untitled"} -> ${imageUrl}`);
  }

  console.log(`Wrote ${rows.length} rows to ${args.out}`);
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (["append", "dry-run", "help", "local-webp"].includes(key)) {
      result[toCamel(key)] = true;
    } else {
      result[toCamel(key)] = argv[i + 1];
      i += 1;
    }
  }
  return result;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printUsage() {
  console.log(`
Usage:
  IMAGEKIT_PRIVATE_KEY=... node АВТО_РЕЦЕПТ/imagekit-recipe-table.js \\
    --manifest ./АВТО_РЕЦЕПТ/recipes-manifest.jsonl \\
    --out ./АВТО_РЕЦЕПТ/output/recipes-output.csv \\
    --folder /recipes/ukrainian \\
    --quality 80

Manifest JSONL, one recipe per line:
  {"jsonPath":"./АВТО_РЕЦЕПТ/work/recipe-1.json","imagePath":"./АВТО_РЕЦЕПТ/work/recipe-1.png","fileName":"syrnyky.webp"}
  {"json":{"id":null,"title":"..."},"imagePath":"./АВТО_РЕЦЕПТ/work/recipe-2.webp"}

Output CSV has no header:
  column A = full recipe JSON in one cell
  column B = ImageKit URL

Notes:
  - This script does not call OpenAI API.
  - If cwebp or ImageMagick is installed, images are uploaded as local WebP.
  - Otherwise original images are uploaded and column B receives an ImageKit WebP transformation URL.
  - Pass --local-webp to fail unless local WebP conversion succeeds.
`);
}

function readManifest(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];

  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) fail("JSON manifest must be an array.");
    return parsed;
  }

  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(`Invalid JSONL at line ${index + 1}: ${error.message}`);
      }
    });
}

function loadRecipeJson(item, index) {
  if (item.json) return item.json;
  if (item.jsonPath) return JSON.parse(fs.readFileSync(path.resolve(item.jsonPath), "utf8"));
  fail(`Manifest row ${index + 1} must contain "json" or "jsonPath".`);
}

function stringifyRecipe(recipe) {
  return args.compact ? JSON.stringify(recipe) : JSON.stringify(recipe, null, 2);
}

function convertToWebp(inputPath, outputPath, qualityValue) {
  if (path.extname(inputPath).toLowerCase() === ".webp") {
    return { path: inputPath, webp: true };
  }

  if (commandExists("cwebp")) {
    const result = spawnSync("cwebp", ["-quiet", "-q", String(qualityValue), inputPath, "-o", outputPath], {
      encoding: "utf8",
    });
    if (result.status === 0 && fs.existsSync(outputPath)) return { path: outputPath, webp: true };
  }

  if (commandExists("magick")) {
    const result = spawnSync("magick", [inputPath, "-quality", String(qualityValue), outputPath], {
      encoding: "utf8",
    });
    if (result.status === 0 && fs.existsSync(outputPath)) return { path: outputPath, webp: true };
  }

  return { path: inputPath, webp: false };
}

function commandExists(command) {
  return spawnSync("which", [command], { encoding: "utf8" }).status === 0;
}

async function uploadToImageKit({ privateKey: key, filePath, fileName, folder: targetFolder }) {
  const boundary = `----codex-imagekit-${crypto.randomBytes(12).toString("hex")}`;
  const fields = [
    ["fileName", fileName],
    ["folder", targetFolder],
    ["useUniqueFileName", "false"],
  ];

  const chunks = [];
  for (const [name, value] of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }

  chunks.push(Buffer.from(`--${boundary}\r\n`));
  chunks.push(
    Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="${escapeHeader(fileName)}"\r\n` +
        `Content-Type: ${contentType(filePath)}\r\n\r\n`
    )
  );
  chunks.push(fs.readFileSync(filePath));
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(chunks);

  const response = await requestJson({
    hostname: "upload.imagekit.io",
    path: "/api/v1/files/upload",
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
    body,
  });

  if (!response.url) fail(`ImageKit upload response did not include url: ${JSON.stringify(response)}`);
  return response;
}

function requestJson(options) {
  const { body, ...requestOptions } = options;
  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch (error) {
          reject(new Error(`Non-JSON response from ImageKit (${res.statusCode}): ${text}`));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`ImageKit upload failed (${res.statusCode}): ${JSON.stringify(parsed)}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function transformedWebpUrl(uploadedUrl, qualityValue, endpoint) {
  const url = new URL(uploadedUrl);
  url.searchParams.set("tr", `f-webp,q-${qualityValue}`);
  if (endpoint && uploadedUrl.startsWith("/")) return `${endpoint}${url}`;
  return url.toString();
}

function writeCsv(filePath, rows) {
  ensureDir(path.dirname(path.resolve(filePath)));
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf8");
}

function appendCsvRow(filePath, row) {
  ensureDir(path.dirname(path.resolve(filePath)));
  fs.appendFileSync(filePath, `${row.map(csvCell).join(",")}\n`, "utf8");
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureWebpName(fileName) {
  return path.basename(fileName, path.extname(fileName)) + ".webp";
}

function makeFileName(title) {
  const slug = String(title)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "recipe"}.webp`;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

function escapeHeader(value) {
  return String(value).replace(/"/g, '\\"');
}

function normalizeEndpoint(endpoint) {
  return endpoint.replace(/\/+$/, "");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

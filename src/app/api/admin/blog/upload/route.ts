import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const WEBP_QUALITY = 80;

const slugify = (value: string, fallback: string) => {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
};

async function uploadToImageKit({ buffer, fileName, folder }: { buffer: Buffer; fileName: string; folder: string }) {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("IMAGEKIT_PRIVATE_KEY is not configured");
  }

  const body = new FormData();
  body.set("file", new Blob([Uint8Array.from(buffer)], { type: "image/webp" }), fileName);
  body.set("fileName", fileName);
  body.set("folder", folder);
  body.set("useUniqueFileName", "true");

  const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`,
    },
    body,
  });

  const result = await response.json();
  if (!response.ok || !result?.url) {
    throw new Error(result?.message || `ImageKit upload failed (${response.status})`);
  }

  return result as { url: string; fileId?: string };
}

// POST /api/admin/blog/upload — form-data: file, slug_hint?, kind? ("cover" | "content")
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const slugHint = String(formData.get("slug_hint") || "").trim();
    const kind = formData.get("kind") === "content" ? "content" : "cover";

    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Нужно выбрать изображение" }, { status: 400 });
    }
    if (file.size > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Изображение больше 20 MB" }, { status: 413 });
    }

    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    const sharp = (await import("sharp")).default;
    const maxWidth = kind === "cover" ? 2000 : 1600;
    const image = sharp(sourceBuffer, { failOn: "warning" })
      .rotate()
      .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 5 });

    const [outputBuffer, metadata] = await Promise.all([image.toBuffer(), sharp(sourceBuffer).metadata()]);

    const postSlug = slugify(slugHint, "post");
    const fileName = `${postSlug}-${kind}-${Date.now()}.webp`;

    const uploaded = await uploadToImageKit({ buffer: outputBuffer, fileName, folder: "/blog" });

    return NextResponse.json({
      url: uploaded.url,
      width: metadata.width || null,
      height: metadata.height || null,
    });
  } catch (error) {
    console.error("[blog-upload]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка загрузки изображения" },
      { status: 500 }
    );
  }
}

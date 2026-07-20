import { NextResponse } from "next/server";
import { getMagnificDownload, MagnificApiError } from "@/lib/magnific";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const WEBP_QUALITY = 80;

function slugify(value: string, fallback: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function isTrustedMagnificAssetUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "freepik.com" ||
        url.hostname.endsWith(".freepik.com") ||
        url.hostname === "magnific.com" ||
        url.hostname.endsWith(".magnific.com"))
    );
  } catch {
    return false;
  }
}

async function downloadTrustedImage(initialUrl: string) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (!isTrustedMagnificAssetUrl(currentUrl)) {
      throw new MagnificApiError("Magnific вернул недоверенный адрес файла.", 502);
    }

    const response = await fetch(currentUrl, { redirect: "manual", cache: "no-store" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new MagnificApiError("Пустое перенаправление при скачивании изображения.", 502);
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok) {
      throw new MagnificApiError(`Не удалось скачать изображение (${response.status}).`, 502);
    }

    const declaredSize = Number(response.headers.get("content-length") || "0");
    if (declaredSize > MAX_SOURCE_BYTES) {
      throw new MagnificApiError("Изображение больше 20 MB.", 413);
    }

    const contentType = response.headers.get("content-type") || "";
    const looksLikeImage = contentType.startsWith("image/") || /\.(jpe?g|png|webp)(?:$|\?)/i.test(currentUrl);
    if (!looksLikeImage) {
      throw new MagnificApiError("Выбранный ресурс не является фотографией.", 422);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_SOURCE_BYTES) {
      throw new MagnificApiError("Изображение больше 20 MB.", 413);
    }
    return buffer;
  }

  throw new MagnificApiError("Слишком много перенаправлений при скачивании.", 502);
}

async function uploadToImageKit(buffer: Buffer, fileName: string) {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new MagnificApiError("IMAGEKIT_PRIVATE_KEY не настроен.", 503);
  }

  const body = new FormData();
  body.set("file", new Blob([Uint8Array.from(buffer)], { type: "image/webp" }), fileName);
  body.set("fileName", fileName);
  body.set("folder", "/blog");
  body.set("useUniqueFileName", "true");

  const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`,
    },
    body,
  });
  const payload = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
  if (!response.ok || !payload?.url) {
    throw new MagnificApiError(payload?.message || `ImageKit вернул ошибку ${response.status}.`, 502);
  }
  return payload.url;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resourceId = Number(id);
    if (!Number.isSafeInteger(resourceId) || resourceId <= 0) {
      return NextResponse.json({ error: "Некорректный ID изображения." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      slugHint?: string;
      language?: string;
      title?: string;
      sourceUrl?: string;
      authorName?: string | null;
      licenseUrl?: string | null;
    };
    const language = typeof body.language === "string" ? body.language : "en-US";
    const download = await getMagnificDownload(resourceId, language);
    const sourceBuffer = await downloadTrustedImage(download.url);
    const sharp = (await import("sharp")).default;
    const outputBuffer = await sharp(sourceBuffer, { failOn: "warning" })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 5 })
      .toBuffer();

    const slug = slugify(body.slugHint || body.title || "", `magnific-${resourceId}`);
    const imageUrl = await uploadToImageKit(outputBuffer, `${slug}-cover-${Date.now()}.webp`);

    return NextResponse.json({
      url: imageUrl,
      alt: typeof body.title === "string" ? body.title.trim() : "",
      provider: "Magnific",
      resource_id: resourceId,
      source_url: typeof body.sourceUrl === "string" ? body.sourceUrl : null,
      author: typeof body.authorName === "string" ? body.authorName : null,
      license_url: typeof body.licenseUrl === "string" ? body.licenseUrl : null,
    });
  } catch (error) {
    console.error("[magnific-import]", error);
    const status = error instanceof MagnificApiError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось импортировать изображение." },
      { status }
    );
  }
}

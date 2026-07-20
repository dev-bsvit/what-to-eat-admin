const MAGNIFIC_API_BASE = "https://api.magnific.com";

export interface MagnificLicense {
  type: string;
  url: string;
}

export interface MagnificResource {
  id: number;
  title: string;
  sourceUrl: string;
  previewUrl: string;
  imageType: string;
  orientation: string;
  imageSize: string | null;
  authorName: string | null;
  licenses: MagnificLicense[];
}

interface MagnificApiResource {
  id?: number;
  title?: string;
  url?: string;
  licenses?: Array<{ type?: string; url?: string }>;
  image?: {
    type?: string;
    orientation?: string;
    source?: { url?: string; size?: string };
  };
  author?: { name?: string };
}

interface MagnificSearchResponse {
  data?: MagnificApiResource[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
  };
}

interface MagnificDownloadResponse {
  data?:
    | {
        filename?: string;
        url?: string;
        signed_url?: string;
      }
    | Array<{
        filename?: string;
        url?: string;
        signed_url?: string;
      }>;
}

export class MagnificApiError extends Error {
  constructor(
    message: string,
    public status = 502
  ) {
    super(message);
  }
}

function getMagnificApiKey() {
  const apiKey = process.env.MAGNIFIC_API_KEY?.trim();
  if (!apiKey) {
    throw new MagnificApiError(
      "MAGNIFIC_API_KEY не настроен. Добавьте ключ Magnific в переменные окружения админ-панели.",
      503
    );
  }
  return apiKey;
}

async function magnificRequest<T>(path: string, acceptLanguage = "en-US"): Promise<T> {
  const response = await fetch(`${MAGNIFIC_API_BASE}${path}`, {
    headers: {
      "x-magnific-api-key": getMagnificApiKey(),
      "Accept-Language": acceptLanguage,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { message?: string; error?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && ("message" in payload || "error" in payload)
        ? String(payload.message || payload.error)
        : `Magnific API вернул ошибку ${response.status}`;
    throw new MagnificApiError(message, response.status >= 400 && response.status < 500 ? response.status : 502);
  }

  return payload as T;
}

function isPhotoResource(resource: MagnificApiResource) {
  return resource.image?.type === "photo" || resource.url?.includes("/free-photo/") || resource.url?.includes("/premium-photo/");
}

export async function searchMagnificResources({
  term,
  page,
  language,
}: {
  term: string;
  page: number;
  language: string;
}) {
  const params = new URLSearchParams({
    term,
    page: String(page),
    limit: "50",
    order: "relevance",
  });
  const payload = await magnificRequest<MagnificSearchResponse>(`/v1/resources?${params}`, language);

  const resources = (payload.data ?? [])
    .filter((resource) => resource.id && resource.image?.source?.url && isPhotoResource(resource))
    .slice(0, 24)
    .map(
      (resource): MagnificResource => ({
        id: resource.id!,
        title: resource.title?.trim() || "Stock photo",
        sourceUrl: resource.url || "",
        previewUrl: resource.image!.source!.url!,
        imageType: resource.image?.type || "photo",
        orientation: resource.image?.orientation || "unknown",
        imageSize: resource.image?.source?.size || null,
        authorName: resource.author?.name?.trim() || null,
        licenses: (resource.licenses ?? [])
          .filter((license) => license.type && license.url)
          .map((license) => ({ type: license.type!, url: license.url! })),
      })
    );

  return {
    resources,
    meta: {
      page: payload.meta?.current_page || page,
      lastPage: payload.meta?.last_page || page,
      total: payload.meta?.total || resources.length,
    },
  };
}

export async function getMagnificDownload(resourceId: number, language: string) {
  const payload = await magnificRequest<MagnificDownloadResponse>(
    `/v1/resources/${resourceId}/download?image_size=large`,
    language
  );
  const download = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  const url = download?.signed_url || download?.url;

  if (!url) {
    throw new MagnificApiError("Magnific не вернул ссылку для скачивания изображения.", 502);
  }

  return {
    url,
    filename: download?.filename || `magnific-${resourceId}.jpg`,
  };
}

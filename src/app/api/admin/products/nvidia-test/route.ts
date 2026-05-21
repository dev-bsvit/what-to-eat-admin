import { NextResponse } from "next/server";

export const maxDuration = 120;

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-3n-e2b-it";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type NvidiaRequestBody = {
  apiKey?: string;
  model?: string;
  prompt?: string;
  messages?: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
};

function getApiKey(body: NvidiaRequestBody): string | null {
  return body.apiKey?.trim() || process.env.NVIDIA_API_KEY?.trim() || null;
}

function buildMessages(body: NvidiaRequestBody): ChatMessage[] {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages
      .filter((message) => message?.role && typeof message.content === "string")
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }

  const prompt = body.prompt?.trim() || "Ответь одним коротким предложением: работает ли модель?";
  return [{ role: "user", content: prompt }];
}

function contentFromDelta(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return "";

  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return "";

  try {
    const parsed = JSON.parse(data);
    return parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as NvidiaRequestBody;
    const apiKey = getApiKey(body);

    if (!apiKey) {
      return NextResponse.json(
        { error: "NVIDIA_API_KEY is not set. Add it to .env.local or pass apiKey for a one-off test." },
        { status: 400 }
      );
    }

    const stream = body.stream !== false;
    const payload = {
      model: body.model?.trim() || DEFAULT_MODEL,
      messages: buildMessages(body),
      max_tokens: Math.min(Math.max(body.maxTokens ?? 512, 1), 4096),
      temperature: body.temperature ?? 0.2,
      top_p: body.topP ?? 0.7,
      frequency_penalty: 0,
      presence_penalty: 0,
      stream,
    };

    const response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: stream ? "text/event-stream" : "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `NVIDIA ${response.status}: ${text}` },
        { status: response.status }
      );
    }

    if (!stream) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        model: payload.model,
        content: data?.choices?.[0]?.message?.content ?? "",
        usage: data?.usage ?? null,
        raw: data,
      });
    }

    if (!response.body) {
      return NextResponse.json({ error: "NVIDIA returned an empty stream" }, { status: 502 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";

    const transformed = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const content = contentFromDelta(line);
              if (content) controller.enqueue(encoder.encode(content));
            }
          }

          const tail = contentFromDelta(buffer);
          if (tail) controller.enqueue(encoder.encode(tail));
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(transformed, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

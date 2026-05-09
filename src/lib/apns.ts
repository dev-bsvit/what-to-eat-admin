/**
 * apns.ts
 *
 * Node.js APNs push sender using @parse/node-apn.
 * Reuses a single Provider instance per process (HTTP/2 connection pooling).
 *
 * Required env vars:
 *   APNS_KEY_ID        — 10-char Key ID from Apple Developer portal
 *   APNS_TEAM_ID       — 10-char Team ID
 *   APNS_PRIVATE_KEY   — Contents of the .p8 file (with or without PEM headers)
 *   APNS_BUNDLE_ID     — e.g. "com.yourcompany.whattoeat"
 *   APNS_PRODUCTION    — "true" for App Store / TestFlight, "false" for sandbox
 */

import apn from "@parse/node-apn";

// Singleton provider — reused across requests in the same Node process
let _provider: apn.Provider | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getProvider(): apn.Provider {
  if (_provider) return _provider;

  // Replace literal \n sequences with real newlines (Render stores multiline env vars this way)
  const keyPem = requiredEnv("APNS_PRIVATE_KEY").replace(/\\n/g, "\n");
  const production = process.env.APNS_PRODUCTION !== "false";

  _provider = new apn.Provider({
    token: {
      key: keyPem,
      keyId: requiredEnv("APNS_KEY_ID"),
      teamId: requiredEnv("APNS_TEAM_ID"),
    },
    production,
  });

  return _provider;
}

export interface PushResult {
  sent: number;
  failed: number;
  invalidTokens: string[]; // Stale or environment-mismatched tokens to delete from DB
  failures: Array<{
    tokenSuffix: string;
    reason: string;
    status?: number;
    error?: string;
  }>;
}

/**
 * Send an alert push to a list of APNs device tokens.
 *
 * @param tokens    Array of hex APNs device tokens
 * @param title     Notification title
 * @param body      Notification body
 * @param extraData Custom payload fields (e.g. { type: "catalog" })
 */
export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  extraData: Record<string, unknown> = {}
): Promise<PushResult> {
  if (tokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [], failures: [] };

  const provider = getProvider();

  const note = new apn.Notification();
  note.alert = { title, body };
  note.sound = "default";
  note.topic = requiredEnv("APNS_BUNDLE_ID");
  note.pushType = "alert";
  note.priority = 10;
  note.expiry = 0;     // deliver once, don't retry
  note.payload = extraData;

  const result = await provider.send(note, tokens);

  console.log(`[APNs] sent=${result.sent.length} failed=${result.failed.length}`);
  if (result.failed.length > 0) {
    result.failed.forEach((f) => {
      console.log(`[APNs] failed token=${f.device} reason=${f.response?.reason} error=${f.error}`);
    });
  }

  const invalidTokenReasons = new Set([
    "Unregistered",
    "BadEnvironmentKeyInToken",
  ]);

  const invalidTokens = result.failed
    .filter((f) => invalidTokenReasons.has(f.response?.reason ?? ""))
    .map((f) => f.device);

  const failures = result.failed.map((f) => ({
    tokenSuffix: f.device.slice(-8),
    reason: f.response?.reason ?? "Unknown",
    status: f.status,
    error: f.error ? String(f.error) : undefined,
  }));

  return {
    sent: result.sent.length,
    failed: result.failed.length,
    invalidTokens,
    failures,
  };
}

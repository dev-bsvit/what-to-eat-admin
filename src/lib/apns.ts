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

function getProvider(): apn.Provider {
  if (_provider) return _provider;

  // Replace literal \n sequences with real newlines (Render stores multiline env vars this way)
  const keyPem = (process.env.APNS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

  _provider = new apn.Provider({
    token: {
      key: keyPem,
      keyId: process.env.APNS_KEY_ID!,
      teamId: process.env.APNS_TEAM_ID!,
    },
    production: process.env.APNS_PRODUCTION === "true",
  });

  return _provider;
}

export interface PushResult {
  sent: number;
  failed: number;
  invalidTokens: string[]; // Unregistered / 410 Gone — should be deleted from DB
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
  if (tokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [] };

  const provider = getProvider();

  const note = new apn.Notification();
  note.alert = { title, body };
  note.sound = "default";
  note.contentAvailable = true;
  note.topic = process.env.APNS_BUNDLE_ID!;
  note.priority = 5;   // battery-friendly
  note.expiry = 0;     // deliver once, don't retry
  note.payload = extraData;

  const result = await provider.send(note, tokens);

  const invalidTokens = result.failed
    .filter((f) => {
      const reason = f.response?.reason;
      return reason === "Unregistered" || reason === "BadDeviceToken";
    })
    .map((f) => f.device);

  return {
    sent: result.sent.length,
    failed: result.failed.length,
    invalidTokens,
  };
}

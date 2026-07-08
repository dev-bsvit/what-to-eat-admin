// Fires an on-demand ISR revalidation request to the public blog frontend
// after a post is saved/published, so readers see the change immediately
// instead of waiting up to an hour for the ISR fallback window.
// Best-effort: never throws — a revalidation failure shouldn't fail the
// admin's save action.
export async function revalidateBlogPaths(paths: string[]) {
  const url = process.env.BLOG_REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret || paths.length === 0) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, paths }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-critical — the 1h ISR fallback will pick it up regardless.
  }
}

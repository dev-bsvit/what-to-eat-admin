#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys


def find_ytdlp():
    """Find yt-dlp executable."""
    candidates = ["yt-dlp", "/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp"]
    for c in candidates:
        try:
            subprocess.run([c, "--version"], capture_output=True, check=True)
            return c
        except Exception:
            continue
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--video", action="store_true", help="Download video file")
    args = parser.parse_args()

    ytdlp = find_ytdlp()
    if not ytdlp:
        print(json.dumps({"error": "not_found", "message": "yt-dlp not installed"}))
        return 2

    os.makedirs(args.output, exist_ok=True)

    # Step 1: Extract metadata (always)
    try:
        result = subprocess.run(
            [
                ytdlp,
                "--dump-json",
                "--no-download",
                "--no-warnings",
                args.url,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            print(json.dumps({
                "error": "fetch_failed",
                "message": result.stderr.strip() or "Failed to fetch TikTok metadata",
            }))
            return 3

        meta = json.loads(result.stdout.strip())
    except subprocess.TimeoutExpired:
        print(json.dumps({"error": "timeout", "message": "TikTok metadata fetch timed out"}))
        return 3
    except json.JSONDecodeError:
        print(json.dumps({"error": "parse_failed", "message": "Failed to parse TikTok metadata"}))
        return 3

    video_id = meta.get("id", "unknown")
    caption = meta.get("description", "") or meta.get("title", "")
    thumbnail_url = meta.get("thumbnail", None)
    uploader = meta.get("uploader", None) or meta.get("creator", None)

    # Step 2: Download video if requested
    video_path = None
    video_error = None
    if args.video:
        video_path = os.path.join(args.output, f"{video_id}.mp4")
        try:
            dl_result = subprocess.run(
                [
                    ytdlp,
                    "-f", "mp4/best",
                    "-o", video_path,
                    "--no-warnings",
                    "--no-playlist",
                    args.url,
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if dl_result.returncode != 0:
                video_error = dl_result.stderr.strip() or "Download failed"
                video_path = None
        except subprocess.TimeoutExpired:
            video_error = "Video download timed out"
            video_path = None

    payload = {
        "video_id": video_id,
        "caption": caption,
        "thumbnail_url": thumbnail_url,
        "video_path": video_path,
        "source_url": args.url,
        "uploader": uploader,
        "video_error": video_error,
    }

    print(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
from typing import Any


def debug_log(event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    print(f"[tiktok_import] {json.dumps(payload, ensure_ascii=True)}", file=sys.stderr)


def format_command(command: list[str]) -> str:
    return " ".join(command)


def find_ytdlp():
    """Find yt-dlp executable."""
    candidates = [
        ["yt-dlp"],
        [os.path.expanduser("~/.local/bin/yt-dlp")],
        ["/usr/local/bin/yt-dlp"],
        ["/usr/bin/yt-dlp"],
        [sys.executable, "-m", "yt_dlp"],
    ]
    for candidate in candidates:
        try:
            version = subprocess.run(candidate + ["--version"], capture_output=True, text=True, check=True)
            debug_log(
                "ytdlp_found",
                command=format_command(candidate),
                version=(version.stdout.strip() or version.stderr.strip() or "")[:80],
            )
            return candidate
        except Exception:
            continue
    debug_log("ytdlp_missing", python=sys.executable)
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
    debug_log(
        "start",
        url=args.url,
        output=args.output,
        video=args.video,
        ytdlp=format_command(ytdlp),
    )

    # Step 1: Extract metadata (always)
    metadata_cmd = ytdlp + ["--dump-json", "--no-download", "--no-warnings", args.url]
    try:
        result = subprocess.run(
            metadata_cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            debug_log(
                "metadata_failed",
                code=result.returncode,
                stderr=(result.stderr or "")[:800],
                command=format_command(metadata_cmd),
            )
            print(json.dumps({
                "error": "fetch_failed",
                "message": result.stderr.strip() or "Failed to fetch TikTok metadata",
            }))
            return 3
        if not result.stdout.strip():
            debug_log(
                "metadata_empty",
                stderr=(result.stderr or "")[:800],
                command=format_command(metadata_cmd),
            )
            print(json.dumps({
                "error": "empty_result",
                "message": "yt-dlp returned no TikTok metadata",
            }))
            return 3

        meta = json.loads(result.stdout.strip())
    except subprocess.TimeoutExpired:
        debug_log("metadata_timeout", command=format_command(metadata_cmd))
        print(json.dumps({"error": "timeout", "message": "TikTok metadata fetch timed out"}))
        return 3
    except json.JSONDecodeError:
        debug_log(
            "metadata_parse_failed",
            stdout=(result.stdout or "")[:800],
            stderr=(result.stderr or "")[:800],
        )
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
            download_cmd = ytdlp + [
                "-f", "mp4/best",
                "-o", video_path,
                "--no-warnings",
                "--no-playlist",
                args.url,
            ]
            dl_result = subprocess.run(
                download_cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if dl_result.returncode != 0:
                video_error = dl_result.stderr.strip() or "Download failed"
                debug_log(
                    "download_failed",
                    code=dl_result.returncode,
                    stderr=(dl_result.stderr or "")[:800],
                    command=format_command(download_cmd),
                )
                video_path = None
        except subprocess.TimeoutExpired:
            video_error = "Video download timed out"
            debug_log("download_timeout", video_id=video_id)
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

    debug_log(
        "success",
        video_id=video_id,
        has_caption=bool(caption),
        has_thumbnail=bool(thumbnail_url),
        has_video=bool(video_path),
        has_video_error=bool(video_error),
    )
    print(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())

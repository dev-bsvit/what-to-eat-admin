#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
from typing import Any, List, Optional


def extract_shortcode(url: str) -> str:
    match = re.search(r"/(reel|p|tv)/([^/?#]+)/?", url)
    if not match:
        return ""
    return match.group(2)


def debug_log(event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    print(f"[instagram_import] {json.dumps(payload, ensure_ascii=True)}", file=sys.stderr)


def format_command(command: List[str]) -> str:
    return " ".join(command)


def find_ytdlp():
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


def build_cookie_file(output_dir: str) -> Optional[str]:
    """Write cookies to Netscape format file, return path or None."""
    cookies_json = os.environ.get("INSTAGRAM_COOKIES_JSON", "").strip()
    session_id = os.environ.get("INSTAGRAM_SESSION_ID", "").strip()

    cookie_path = os.path.join(output_dir, "ig_cookies.txt")

    if cookies_json:
        try:
            cookies = json.loads(cookies_json)
            with open(cookie_path, "w") as f:
                f.write("# Netscape HTTP Cookie File\n")
                for c in cookies:
                    domain = c.get("domain", ".instagram.com")
                    if not domain.startswith("."):
                        domain = "." + domain
                    secure = "TRUE" if c.get("secure") else "FALSE"
                    expires = int(c.get("expirationDate", 0))
                    name = c.get("name", "")
                    value = c.get("value", "")
                    f.write(f"{domain}\tTRUE\t/\t{secure}\t{expires}\t{name}\t{value}\n")
            return cookie_path
        except Exception:
            pass

    if session_id:
        with open(cookie_path, "w") as f:
            f.write("# Netscape HTTP Cookie File\n")
            f.write(f".instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\t{session_id}\n")
        return cookie_path

    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--meta-only", action="store_true")
    args = parser.parse_args()

    shortcode = extract_shortcode(args.url)
    if not shortcode:
        debug_log("invalid_url", url=args.url)
        print(json.dumps({"error": "invalid_url", "message": "Unsupported Instagram URL"}))
        return 2

    ytdlp = find_ytdlp()
    if not ytdlp:
        print(json.dumps({"error": "not_found", "message": "yt-dlp not installed"}))
        return 2

    os.makedirs(args.output, exist_ok=True)

    cookie_file = build_cookie_file(args.output)
    cookie_args = ["--cookies", cookie_file] if cookie_file else []
    cookie_mode = "cookies_json" if os.environ.get("INSTAGRAM_COOKIES_JSON", "").strip() else (
        "session_id" if os.environ.get("INSTAGRAM_SESSION_ID", "").strip() else "none"
    )

    proxy = os.environ.get("INSTAGRAM_PROXY", "").strip()
    proxy_args = ["--proxy", proxy] if proxy else []
    debug_log(
        "start",
        url=args.url,
        shortcode=shortcode,
        output=args.output,
        meta_only=args.meta_only,
        ytdlp=format_command(ytdlp),
        cookie_mode=cookie_mode,
        has_proxy=bool(proxy),
    )

    # Fetch metadata only (no download)
    cmd = ytdlp + ["--dump-json", "--no-download", "--no-warnings"] + cookie_args + proxy_args + [args.url]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
        if result.returncode != 0:
            debug_log(
                "metadata_failed",
                code=result.returncode,
                stderr=(result.stderr or "")[:800],
                command=format_command(cmd),
            )
            print(json.dumps({
                "error": "instagram_fetch_blocked",
                "message": result.stderr.strip() or "Failed to fetch Instagram post",
            }))
            return 3
        if not result.stdout.strip():
            debug_log(
                "metadata_empty",
                stderr=(result.stderr or "")[:800],
                command=format_command(cmd),
            )
            print(json.dumps({
                "error": "empty_result",
                "message": "yt-dlp returned no Instagram metadata; post may be blocked, private, or rate-limited",
            }))
            return 3
        meta = json.loads(result.stdout.strip())
    except subprocess.TimeoutExpired:
        debug_log("metadata_timeout", command=format_command(cmd))
        print(json.dumps({"error": "timeout", "message": "Instagram fetch timed out"}))
        return 3
    except json.JSONDecodeError:
        debug_log(
            "metadata_parse_failed",
            stdout=(result.stdout or "")[:800],
            stderr=(result.stderr or "")[:800],
        )
        print(json.dumps({"error": "parse_failed", "message": "Failed to parse yt-dlp response"}))
        return 3

    caption = meta.get("description", "") or meta.get("title", "") or ""
    thumbnail_url = meta.get("thumbnail", None)
    owner_username = meta.get("uploader", None) or meta.get("channel", None)

    video_path = None
    video_error = None

    if not args.meta_only:
        has_video = meta.get("duration") is not None or meta.get("ext") in ("mp4", "m4v", "mov")
        if has_video:
            video_path = os.path.join(args.output, f"{shortcode}.mp4")
            try:
                download_cmd = (
                    ytdlp
                    + ["-f", "mp4/best", "-o", video_path, "--no-warnings", "--no-playlist"]
                    + cookie_args
                    + proxy_args
                    + [args.url]
                )
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
                debug_log("download_timeout", shortcode=shortcode)
                video_path = None

    payload = {
        "shortcode": shortcode,
        "caption": caption,
        "thumbnail_url": thumbnail_url,
        "video_path": video_path,
        "source_url": args.url,
        "owner_username": owner_username,
        "video_error": video_error,
    }
    debug_log(
        "success",
        has_caption=bool(caption),
        has_thumbnail=bool(thumbnail_url),
        has_video=bool(video_path),
        has_video_error=bool(video_error),
    )
    print(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())

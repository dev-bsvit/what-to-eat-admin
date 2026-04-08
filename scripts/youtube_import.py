#!/usr/bin/env python3
import argparse
import base64
import json
import os
import subprocess
import sys
import glob as globmod
import tempfile
from typing import Any


def debug_log(event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    print(f"[youtube_import] {json.dumps(payload, ensure_ascii=True)}", file=sys.stderr)


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


def build_ytdlp_base_args() -> tuple[list[str], str | None]:
    """Build shared yt-dlp args from environment and return cleanup path if needed."""
    args: list[str] = []
    cookies_path: str | None = None

    cookies_file = os.getenv("YOUTUBE_COOKIES_FILE", "").strip()
    cookies_raw = os.getenv("YOUTUBE_COOKIES", "")
    cookies_b64 = os.getenv("YOUTUBE_COOKIES_BASE64", "").strip()
    proxy = os.getenv("YOUTUBE_PROXY", "").strip()

    if cookies_file:
        args.extend(["--cookies", cookies_file])
        debug_log("cookies_configured", source="file", path=cookies_file)
    elif cookies_raw.strip():
        temp_file = tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".txt",
            prefix="youtube-cookies-",
            delete=False,
        )
        try:
            temp_file.write(cookies_raw)
        finally:
            temp_file.close()
        cookies_path = temp_file.name
        args.extend(["--cookies", cookies_path])
        debug_log("cookies_configured", source="env_text")
    elif cookies_b64:
        try:
            decoded = base64.b64decode(cookies_b64).decode("utf-8")
        except Exception as exc:
            debug_log("cookies_invalid_base64", error=str(exc)[:300])
            raise ValueError("Invalid YOUTUBE_COOKIES_BASE64 value") from exc

        temp_file = tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".txt",
            prefix="youtube-cookies-",
            delete=False,
        )
        try:
            temp_file.write(decoded)
        finally:
            temp_file.close()
        cookies_path = temp_file.name
        args.extend(["--cookies", cookies_path])
        debug_log("cookies_configured", source="env_base64")

    if proxy:
        args.extend(["--proxy", proxy])
        debug_log("proxy_configured", proxy=proxy[:120])

    return args, cookies_path


def extract_subtitles(output_dir: str, video_id: str) -> str:
    """Read downloaded subtitle file and return text."""
    # yt-dlp saves subtitles as .vtt or .srt files
    patterns = [
        os.path.join(output_dir, f"{video_id}*.vtt"),
        os.path.join(output_dir, f"{video_id}*.srt"),
    ]
    for pattern in patterns:
        files = globmod.glob(pattern)
        if files:
            with open(files[0], "r", encoding="utf-8") as f:
                raw = f.read()
            # Strip VTT/SRT formatting, keep text only
            lines = []
            for line in raw.split("\n"):
                line = line.strip()
                # Skip timestamps, WEBVTT header, sequence numbers
                if not line:
                    continue
                if line.startswith("WEBVTT"):
                    continue
                if "-->" in line:
                    continue
                if line.isdigit():
                    continue
                # Skip style/position tags
                if line.startswith("<") or line.startswith("{"):
                    continue
                # Remove inline tags like <00:00:01.000>
                import re
                clean = re.sub(r"<[^>]+>", "", line).strip()
                if clean and clean not in lines:
                    lines.append(clean)
            return " ".join(lines)
    return ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--audio", action="store_true", help="Download audio file")
    args = parser.parse_args()

    ytdlp = find_ytdlp()
    if not ytdlp:
        print(json.dumps({"error": "not_found", "message": "yt-dlp not installed"}))
        return 2

    try:
        ytdlp_base_args, temp_cookies_path = build_ytdlp_base_args()
    except ValueError as exc:
        print(json.dumps({"error": "config_error", "message": str(exc)}))
        return 2

    os.makedirs(args.output, exist_ok=True)
    debug_log(
        "start",
        url=args.url,
        output=args.output,
        audio=args.audio,
        ytdlp=format_command(ytdlp),
        has_cookies=bool(ytdlp_base_args and "--cookies" in ytdlp_base_args),
        has_proxy=bool(ytdlp_base_args and "--proxy" in ytdlp_base_args),
    )
    try:
        # Step 1: Extract metadata + subtitles
        metadata_cmd = ytdlp + ytdlp_base_args + ["--dump-json", "--no-download", "--no-warnings", args.url]
        try:
            result = subprocess.run(
                metadata_cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode != 0:
                stderr = result.stderr.strip() or "Failed to fetch YouTube metadata"
                error_code = "fetch_failed"
                if "Sign in to confirm you" in stderr:
                    error_code = "authentication_required"
                    stderr = (
                        f"{stderr}\n"
                        "Set YOUTUBE_COOKIES, YOUTUBE_COOKIES_BASE64, or YOUTUBE_COOKIES_FILE for yt-dlp."
                    )
                debug_log(
                    "metadata_failed",
                    code=result.returncode,
                    stderr=(result.stderr or "")[:800],
                    command=format_command(metadata_cmd),
                )
                print(json.dumps({
                    "error": error_code,
                    "message": stderr,
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
                    "message": "yt-dlp returned no YouTube metadata",
                }))
                return 3

            meta = json.loads(result.stdout.strip())
        except subprocess.TimeoutExpired:
            debug_log("metadata_timeout", command=format_command(metadata_cmd))
            print(json.dumps({"error": "timeout", "message": "YouTube metadata fetch timed out"}))
            return 3
        except json.JSONDecodeError:
            debug_log(
                "metadata_parse_failed",
                stdout=(result.stdout or "")[:800],
                stderr=(result.stderr or "")[:800],
            )
            print(json.dumps({"error": "parse_failed", "message": "Failed to parse YouTube metadata"}))
            return 3

        video_id = meta.get("id", "unknown")
        title = meta.get("title", "")
        description = meta.get("description", "")
        thumbnail_url = meta.get("thumbnail", None)
        uploader = meta.get("uploader", None) or meta.get("channel", None)

        # Step 2: Download subtitles
        subtitles_text = ""
        try:
            subtitle_cmd = ytdlp + ytdlp_base_args + [
                "--write-auto-sub",
                "--sub-lang", "ru,en",
                "--skip-download",
                "--no-warnings",
                "-o", os.path.join(args.output, f"{video_id}"),
                args.url,
            ]
            sub_result = subprocess.run(
                subtitle_cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if sub_result.returncode == 0:
                subtitles_text = extract_subtitles(args.output, video_id)
            else:
                debug_log(
                    "subtitle_fetch_failed",
                    code=sub_result.returncode,
                    stderr=(sub_result.stderr or "")[:800],
                    command=format_command(subtitle_cmd),
                )
        except subprocess.TimeoutExpired:
            debug_log("subtitle_fetch_timeout", video_id=video_id)
            pass

        # Step 3: Download audio if requested
        audio_path = None
        audio_error = None
        if args.audio:
            audio_path = os.path.join(args.output, f"{video_id}.mp3")
            try:
                download_cmd = ytdlp + ytdlp_base_args + [
                    "-x",
                    "--audio-format", "mp3",
                    "--audio-quality", "5",
                    "-o", os.path.join(args.output, f"{video_id}.%(ext)s"),
                    "--no-warnings",
                    "--no-playlist",
                    args.url,
                ]
                dl_result = subprocess.run(
                    download_cmd,
                    capture_output=True,
                    text=True,
                    timeout=180,
                )
                if dl_result.returncode != 0:
                    audio_error = dl_result.stderr.strip() or "Audio download failed"
                    debug_log(
                        "audio_download_failed",
                        code=dl_result.returncode,
                        stderr=(dl_result.stderr or "")[:800],
                        command=format_command(download_cmd),
                    )
                    audio_path = None
                elif not os.path.exists(audio_path):
                    # yt-dlp may have saved with different extension
                    for ext in ["mp3", "m4a", "webm", "opus"]:
                        candidate = os.path.join(args.output, f"{video_id}.{ext}")
                        if os.path.exists(candidate):
                            audio_path = candidate
                            break
                    else:
                        audio_error = "Audio file not found after download"
                        debug_log("audio_file_missing", video_id=video_id)
                        audio_path = None
            except subprocess.TimeoutExpired:
                audio_error = "Audio download timed out"
                debug_log("audio_download_timeout", video_id=video_id)
                audio_path = None

        payload = {
            "video_id": video_id,
            "title": title,
            "description": description,
            "subtitles": subtitles_text,
            "thumbnail_url": thumbnail_url,
            "audio_path": audio_path,
            "source_url": args.url,
            "uploader": uploader,
            "audio_error": audio_error,
        }

        debug_log(
            "success",
            video_id=video_id,
            has_description=bool(description),
            has_subtitles=bool(subtitles_text),
            has_thumbnail=bool(thumbnail_url),
            has_audio=bool(audio_path),
            has_audio_error=bool(audio_error),
        )
        print(json.dumps(payload, ensure_ascii=True))
        return 0
    finally:
        if temp_cookies_path:
            try:
                os.unlink(temp_cookies_path)
            except OSError:
                pass


if __name__ == "__main__":
    sys.exit(main())

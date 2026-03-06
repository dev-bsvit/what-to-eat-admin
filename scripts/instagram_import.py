#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import urllib.request

import instaloader


def extract_shortcode(url: str) -> str:
    match = re.search(r"/(reel|p|tv)/([^/?#]+)/?", url)
    if not match:
        return ""
    return match.group(2)


def download_video(video_url: str, output_path: str) -> None:
    urllib.request.urlretrieve(video_url, output_path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--meta-only", action="store_true", help="Return only metadata without downloading video")
    args = parser.parse_args()

    shortcode = extract_shortcode(args.url)
    if not shortcode:
        print(json.dumps({"error": "invalid_url", "message": "Unsupported Instagram URL"}))
        return 2

    os.makedirs(args.output, exist_ok=True)

    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
    )

    # Authenticate via session cookie if provided
    session_id = os.environ.get("INSTAGRAM_SESSION_ID", "").strip()
    if session_id:
        loader.context._session.cookies.set(
            "sessionid", session_id, domain=".instagram.com"
        )
        username = os.environ.get("INSTAGRAM_USERNAME", "")
        if username:
            loader.context.username = username

    try:
        post = instaloader.Post.from_shortcode(loader.context, shortcode)
    except Exception as exc:
        print(json.dumps({"error": "fetch_failed", "message": str(exc)}))
        return 3

    caption = post.caption or ""
    thumbnail_url = getattr(post, "url", None)
    owner_username = getattr(post, "owner_username", None)

    video_path = None
    video_error = None
    if not args.meta_only and post.is_video and post.video_url:
        video_path = os.path.join(args.output, f"{shortcode}.mp4")
        try:
            download_video(post.video_url, video_path)
        except Exception as exc:
            video_error = str(exc)
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

    print(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())

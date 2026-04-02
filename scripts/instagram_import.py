#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import urllib.request
from typing import Optional

import instaloader


def extract_shortcode(url: str) -> str:
    match = re.search(r"/(reel|p|tv)/([^/?#]+)/?", url)
    if not match:
        return ""
    return match.group(2)


def download_video(video_url: str, output_path: str) -> None:
    urllib.request.urlretrieve(video_url, output_path)


def set_cookie(session, name: str, value: str) -> bool:
    normalized = value.strip()
    if not normalized:
        return False
    session.cookies.set(name, normalized, domain=".instagram.com")
    session.cookies.set(name, normalized, domain="www.instagram.com")
    return True


def load_instagram_cookies(loader: instaloader.Instaloader):
    session = loader.context._session
    applied = []

    cookies_json = os.environ.get("INSTAGRAM_COOKIES_JSON", "").strip()
    if cookies_json:
        try:
            parsed = json.loads(cookies_json)
        except json.JSONDecodeError as exc:
            return applied, f"Invalid INSTAGRAM_COOKIES_JSON: {exc}"

        if not isinstance(parsed, dict):
            return applied, "INSTAGRAM_COOKIES_JSON must be a JSON object"

        for name, value in parsed.items():
            if isinstance(name, str) and isinstance(value, str) and set_cookie(session, name, value):
                applied.append(name)

    cookie_env = {
        "sessionid": os.environ.get("INSTAGRAM_SESSION_ID", ""),
        "csrftoken": os.environ.get("INSTAGRAM_CSRF_TOKEN", ""),
        "ds_user_id": os.environ.get("INSTAGRAM_DS_USER_ID", ""),
        "mid": os.environ.get("INSTAGRAM_MID", ""),
        "ig_did": os.environ.get("INSTAGRAM_IG_DID", ""),
    }
    for name, value in cookie_env.items():
        if set_cookie(session, name, value) and name not in applied:
            applied.append(name)

    username = os.environ.get("INSTAGRAM_USERNAME", "").strip()
    if username:
        loader.context.username = username

    return applied, None


def test_login(loader: instaloader.Instaloader):
    try:
        return loader.test_login(), None
    except Exception as exc:
        primary_error = str(exc)

    try:
        return loader.context.test_login(), primary_error
    except Exception:
        return None, primary_error


def classify_fetch_error(message: str, has_auth_cookies: bool, logged_in_username: Optional[str]):
    lower = message.lower()

    if (
        "challenge_required" in lower
        or "checkpoint_required" in lower
        or "feedback_required" in lower
        or "/challenge/" in lower
        or '302 found' in lower and 'instagram.com/challenge/' in lower
    ):
        return (
            "instagram_challenge_required",
            "Instagram requested an account challenge/checkpoint. Refresh the Instagram session cookies on the server.",
        )

    if "please wait a few minutes" in lower or "401 unauthorized" in lower:
        return (
            "instagram_rate_limited",
            "Instagram temporarily blocked requests for this session or server IP. Wait and refresh the session cookies.",
        )

    if "graphql/query" in lower and "expecting value" in lower:
        if has_auth_cookies and not logged_in_username:
            return (
                "instagram_auth_invalid",
                "Instagram returned HTML instead of JSON. The configured Instagram session cookies are invalid or expired.",
            )
        if not has_auth_cookies:
            return (
                "instagram_auth_required",
                "Instagram returned HTML instead of JSON. Public unauthenticated extraction is blocked; configure Instagram session cookies.",
            )
        return (
            "instagram_fetch_blocked",
            "Instagram returned HTML instead of JSON. The session may be rate-limited, challenged, or blocked from this server.",
        )

    return ("fetch_failed", message)


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
        max_connection_attempts=1,
        request_timeout=8.0,
        fatal_status_codes=[302, 400, 401, 403, 429],
        quiet=True,
    )

    cookie_names, cookie_error = load_instagram_cookies(loader)
    if cookie_error:
        print(json.dumps({"error": "invalid_config", "message": cookie_error}))
        return 4

    logged_in_username = None
    login_error = None
    if cookie_names:
        logged_in_username, login_error = test_login(loader)
        if not logged_in_username and login_error:
            error, message = classify_fetch_error(login_error, True, None)
            print(
                json.dumps(
                    {
                        "error": error,
                        "message": message,
                        "raw_message": login_error,
                        "auth_cookie_names": cookie_names,
                        "logged_in_username": None,
                    }
                )
            )
            return 3

    try:
        post = instaloader.Post.from_shortcode(loader.context, shortcode)
    except Exception as exc:
        error, message = classify_fetch_error(str(exc), bool(cookie_names), logged_in_username)
        print(
            json.dumps(
                {
                    "error": error,
                    "message": message,
                    "raw_message": str(exc),
                    "auth_cookie_names": cookie_names,
                    "logged_in_username": logged_in_username,
                }
            )
        )
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
        "logged_in_username": logged_in_username,
    }

    print(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())

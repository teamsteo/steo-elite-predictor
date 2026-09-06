#!/usr/bin/env python3
"""Send the pre-built combo message to Telegram via the deployed Vercel endpoint."""
import json
import sys
import urllib.request

URL = "https://my-project-zeta-five-85.vercel.app/api/combo-send"
MSG_FILE = "/home/z/my-project/scripts/combo_message.txt"

def main():
    with open(MSG_FILE, "r") as f:
        msg = f.read()

    print(f"Message length: {len(msg)} chars")
    print(f"First 80 chars: {msg[:80]!r}")
    print()

    payload = json.dumps({"message": msg}).encode("utf-8")
    req = urllib.request.Request(
        URL,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            print(f"HTTP {resp.status}")
            print(f"Response: {body}")
            return 0 if resp.status == 200 else 1
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}")
        print(f"Error: {body}")
        return 1
    except Exception as e:
        print(f"Exception: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())

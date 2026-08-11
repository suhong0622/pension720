"""
연금복권720+ 최신 당첨번호를 로또성지(lottosungji.com)에서 가져와
data/win720.js 에 없는 새 회차만 추가하는 스크립트.
"""

import json
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SOURCE_URL = "https://www.lottosungji.com/pension"
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "win720.js"

ROUND_PATTERN = re.compile(
    r"(\d{1,4})회\D{0,20}?(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일"
    r"\D{0,10}?([1-5])조\s*(\d{6})\D{0,10}?(\d{6})"
)


def fetch_rounds() -> dict:
    resp = requests.get(
        SOURCE_URL,
        timeout=20,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        },
    )
    print(f"HTTP 상태 코드: {resp.status_code}")
    print(f"응답 본문 길이: {len(resp.text)}자")
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text(separator=" ")
    text = re.sub(r"\s+", " ", text)

    print("--- 페이지 텍스트 앞부분 (디버그용) ---")
    print(text[:600])
    print("--- 여기까지

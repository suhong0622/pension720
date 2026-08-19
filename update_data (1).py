"""
연금복권720+ 최신 당첨번호를 자동으로 가져와 data/win720.js 를 갱신하는 스크립트.

[이전 버전과의 차이]
기존 버전은 파이썬 requests 라이브러리로 단순 HTTP 요청만 보냈다. 이 경우
대상 사이트가 표를 자바스크립트로 나중에 그리는 방식이면 빈 껍데기 HTML만
받아오게 되어, 실제로 GitHub Actions에서 "회차를 하나도 못 찾음" 오류가
발생했다 (사람이 브라우저로 볼 때와 프로그램이 요청만 보낼 때 받는 내용이
다를 수 있음).

이번 버전은 Playwright로 실제 Chromium 브라우저를 띄워 페이지를 열고,
자바스크립트 실행이 끝난 뒤의 최종 화면 텍스트를 읽어온다. 사람이 눈으로
보는 것과 동일한 내용을 받기 때문에, JS 렌더링 때문에 실패하던 문제는
해결된다.

GitHub Actions에서 매주 목요일 밤 자동 실행됨 (.github/workflows/update-data.yml).

로컬 테스트:
    pip install playwright
    playwright install --with-deps chromium
    python scripts/update_data.py
"""

import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

SOURCE_URL = "https://www.lottosungji.com/pension"
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "win720.js"

# "326회 2026년 7월 30일 2조 502733 399616" 같은 패턴을 찾는다.
# (실제 페이지 텍스트로 여러 차례 검증된 패턴)
ROUND_PATTERN = re.compile(
    r"(\d{1,4})회\D{0,20}?(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일"
    r"\D{0,10}?([1-5])조\s*(\d{6})\D{0,10}?(\d{6})"
)


def fetch_page_text(url: str) -> str:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        )
        try:
            page.goto(url, timeout=30000, wait_until="networkidle")
            page.wait_for_timeout(1500)  # 늦게 그려지는 표까지 대기
            text = page.inner_text("body")
        finally:
            browser.close()
    return re.sub(r"\s+", " ", text)


def parse_rounds(text: str) -> dict:
    rounds = {}
    for m in ROUND_PATTERN.finditer(text):
        rnd_s, y, mo, d, group, number, bonus = m.groups()
        rnd = int(rnd_s)
        if not (1 <= rnd <= 5000):
            continue
        date = f"{y}-{int(mo):02d}-{int(d):02d}"
        rounds[rnd] = {
            "round": rnd,
            "date": date,
            "group": int(group),
            "number": number,
            "bonus": bonus,
        }
    return rounds


def load_existing() -> list:
    content = DATA_PATH.read_text(encoding="utf-8")
    m = re.search(r"const WIN720_DATA\s*=\s*(\[.*\]);", content, re.S)
    if not m:
        raise RuntimeError("data/win720.js 에서 WIN720_DATA 배열을 찾지 못했습니다.")
    return json.loads(m.group(1))


def save(records: list) -> None:
    records = sorted(records, key=lambda r: r["round"])
    body = (
        f"// 연금복권720+ 1회~{len(records)}회 당첨번호 데이터\n"
        "// 자동 갱신: GitHub Actions (scripts/update_data.py, 매주 목요일 추첨 후 실행)\n"
        "// 참고용 데이터이며, 정확한 당첨번호는 dhlottery.co.kr 에서 확인하세요.\n"
        "const WIN720_DATA = " + json.dumps(records, ensure_ascii=False) + ";\n"
    )
    DATA_PATH.write_text(body, encoding="utf-8")


def main() -> int:
    existing = load_existing()
    by_round = {r["round"]: r for r in existing}
    before = max(by_round) if by_round else 0

    text = fetch_page_text(SOURCE_URL)
    print(f"페이지 텍스트 길이: {len(text)}자")
    print("--- 텍스트 앞부분 (디버그용) ---")
    print(text[:800])
    print("--- 여기까지 ---")

    scraped = parse_rounds(text)
    print(f"인식된 회차 수: {len(scraped)}")

    if not scraped:
        print("경고: 회차 데이터를 하나도 찾지 못했습니다. "
              "위 텍스트 미리보기를 보고 사이트 구조/차단 여부를 확인하세요.")
        return 0

    added = []
    for rnd, rec in scraped.items():
        if rnd not in by_round:
            by_round[rnd] = rec
            added.append(rnd)

    if not added:
        print(f"새 회차 없음 (현재 최신 회차: {before}회)")
        return 0

    save(list(by_round.values()))
    print(f"추가된 회차: {sorted(added)} (총 {len(by_round)}회차)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

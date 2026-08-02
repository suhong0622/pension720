"""
연금복권720+ 최신 당첨번호를 로또성지(lottosungji.com)에서 가져와
data/win720.js 에 없는 새 회차만 추가하는 스크립트.

GitHub Actions에서 매주 자동으로 실행됩니다 (.github/workflows/update-data.yml).
로컬에서 수동으로 테스트하려면:
    pip install requests beautifulsoup4
    python scripts/update_data.py
"""

import json
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SOURCE_URL = "https://www.lottosungji.com/pension"
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "win720.js"

# "326회 ... 2026년 7월 30일 ... 2조 502733 ... 399616" 같은 패턴을
# 페이지의 순수 텍스트에서 찾아낸다 (마크업에 의존하지 않아 구조가 조금
# 바뀌어도 잘 버틴다).
ROUND_PATTERN = re.compile(
    r"(\d{1,4})회\D{0,20}?(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일"
    r"\D{0,10}?([1-5])조\s*(\d{6})\D{0,10}?(\d{6})"
)


def fetch_rounds() -> dict:
    resp = requests.get(
        SOURCE_URL,
        timeout=20,
        headers={"User-Agent": "Mozilla/5.0 (compatible; pension720-archive-bot/1.0)"},
    )
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text(separator=" ")
    text = re.sub(r"\s+", " ", text)

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

    scraped = fetch_rounds()
    if not scraped:
        print("경고: 새 회차 데이터를 하나도 찾지 못했습니다. 사이트 구조가 바뀌었을 수 있어요.")
        return 1

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

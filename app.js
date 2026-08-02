(function () {
  "use strict";

  let DATA = [];              // full dataset, sorted by round asc
  let sortMode = "desc";      // table sort
  let currentPage = 1;
  const PAGE_SIZE = 15;
  let currentRange = 20;      // stats range: 20 | 50 | 100 | 'all'

  // holds the most recently rendered position/digit counts + average,
  // so the heatmap "추천받기" button can reuse them without recomputing
  let lastPositions = null;
  let lastAvg = 0;

  // 조건별 번호 추출기 상태
  const genState = {
    jo: "all",          // "all" | "1".."5"
    count: 5,           // 1 | 5 | 10
    includeDigits: new Set(),
    excludeDigits: new Set(),
  };

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  function fmtDate(iso) {
    const [y, m, d] = iso.split("-");
    return `${y.slice(2)}.${m}.${d}`;
  }

  function digitCells(str, small) {
    return str
      .split("")
      .map((d) => `<span class="digit-cell${small ? " " : ""}">${d}</span>`)
      .join("");
  }

  /* ---------------------------------------------------------------------
     LOAD DATA (from data/win720.js, global WIN720_DATA)
     --------------------------------------------------------------------- */
  if (typeof WIN720_DATA !== "undefined" && WIN720_DATA.length) {
    DATA = WIN720_DATA.slice().sort((a, b) => a.round - b.round);
    init();
  } else {
    console.error("WIN720_DATA를 찾을 수 없습니다. data/win720.js가 로드되었는지 확인해주세요.");
    document.addEventListener("DOMContentLoaded", () => {
      $("#roundTableBody").innerHTML =
        '<tr><td colspan="4" style="padding:24px;color:#B9CABE;">데이터를 불러오지 못했습니다.</td></tr>';
    });
  }

  function init() {
    $("#totalRoundsText").textContent = DATA.length;
    renderHero();
    renderTable();
    renderStats();
    bindNav();
    bindLookup();
    bindRangeTabs();
    initGenerator();
  }

  /* ---------------------------------------------------------------------
     NAV
     --------------------------------------------------------------------- */
  function bindNav() {
    $$("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-nav");
        const el = document.getElementById(target);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    const sections = ["hero", "lookup", "stats", "generator"].map((id) => document.getElementById(id));
    const navLinks = $$(".nav-link");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            navLinks.forEach((l) => l.classList.remove("is-active"));
            const active = navLinks.find((l) => l.dataset.nav === entry.target.id);
            if (active) active.classList.add("is-active");
          }
        });
      },
      { rootMargin: "-40% 0px -50% 0px" }
    );
    sections.forEach((s) => s && obs.observe(s));
  }

  /* ---------------------------------------------------------------------
     HERO — latest ticket
     --------------------------------------------------------------------- */
  function renderHero() {
    const latest = DATA[DATA.length - 1];
    $("#latestRound").textContent = latest.round;
    $("#latestDate").textContent = fmtDate(latest.date) + " 추첨";
    $("#latestJo").textContent = latest.group + "조";
    $("#latestNumber").innerHTML = digitCells(latest.number);
    $("#latestBonus").innerHTML = digitCells(latest.bonus);
  }

  /* ---------------------------------------------------------------------
     LOOKUP TABLE
     --------------------------------------------------------------------- */
  function getSortedData() {
    const arr = DATA.slice();
    arr.sort((a, b) => (sortMode === "asc" ? a.round - b.round : b.round - a.round));
    return arr;
  }

  function renderTable(highlightRound) {
    const sorted = getSortedData();
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(start, start + PAGE_SIZE);

    const rows = pageItems
      .map((r) => {
        const isHi = highlightRound && r.round === highlightRound;
        return `
        <tr class="${isHi ? "is-highlight" : ""}">
          <td class="cell-round">${r.round}</td>
          <td>${fmtDate(r.date)}</td>
          <td class="cell-nums"><span class="jo-badge">${r.group}조</span>${r.number}</td>
          <td class="cell-bonus">${r.bonus}</td>
        </tr>`;
      })
      .join("");

    $("#roundTableBody").innerHTML = rows;
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    const maxButtons = 7;
    let start = Math.max(1, currentPage - 3);
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);

    let html = "";
    html += `<button class="page-btn" data-page="prev" ${currentPage === 1 ? "disabled" : ""}>‹</button>`;
    for (let p = start; p <= end; p++) {
      html += `<button class="page-btn ${p === currentPage ? "is-active" : ""}" data-page="${p}">${p}</button>`;
    }
    html += `<button class="page-btn" data-page="next" ${currentPage === totalPages ? "disabled" : ""}>›</button>`;

    $("#pagination").innerHTML = html;
    $$(".page-btn", $("#pagination")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.page;
        if (val === "prev") currentPage = Math.max(1, currentPage - 1);
        else if (val === "next") currentPage = currentPage + 1;
        else currentPage = parseInt(val, 10);
        renderTable();
        $("#lookup").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function bindLookup() {
    $("#sortSelect").addEventListener("change", (e) => {
      sortMode = e.target.value;
      currentPage = 1;
      renderTable();
    });

    $("#roundForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const val = parseInt($("#roundInput").value, 10);
      const found = DATA.find((r) => r.round === val);
      if (!found) return;

      const sorted = getSortedData();
      const idx = sorted.findIndex((r) => r.round === val);
      currentPage = Math.floor(idx / PAGE_SIZE) + 1;
      renderTable(val);
      $("#lookup").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* ---------------------------------------------------------------------
     STATS
     --------------------------------------------------------------------- */
  function bindRangeTabs() {
    $$(".range-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".range-tab").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        const r = tab.dataset.range;
        currentRange = r === "all" ? "all" : parseInt(r, 10);
        renderStats();
      });
    });
  }

  function getRangeData() {
    if (currentRange === "all") return DATA;
    return DATA.slice(-currentRange);
  }

  function renderStats() {
    const rangeData = getRangeData();
    const label =
      currentRange === "all"
        ? `전체 ${DATA.length}회 기준`
        : `최근 ${currentRange}회 기준 (${rangeData[0].round}회 ~ ${rangeData[rangeData.length - 1].round}회)`;
    $("#joRangeLabel").textContent = label;

    renderJoBars(rangeData);
    renderHeatmap(rangeData);
    renderHotCold(rangeData);
  }

  function renderJoBars(rangeData) {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    rangeData.forEach((r) => counts[r.group]++);
    const max = Math.max(...Object.values(counts));

    const html = [1, 2, 3, 4, 5]
      .map((jo) => {
        const c = counts[jo];
        const pct = max ? Math.round((c / max) * 100) : 0;
        const share = rangeData.length ? ((c / rangeData.length) * 100).toFixed(1) : "0.0";
        return `
        <div class="bar-row">
          <span class="bar-label">${jo}조</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="bar-count">${c}회 · ${share}%</span>
        </div>`;
      })
      .join("");
    $("#joBars").innerHTML = html;
  }

  // returns array[6] of {counts: {0..9: n}}
  function computeDigitCounts(rangeData) {
    const positions = Array.from({ length: 6 }, () => {
      const o = {};
      for (let d = 0; d <= 9; d++) o[d] = 0;
      return o;
    });
    rangeData.forEach((r) => {
      r.number.split("").forEach((d, i) => {
        positions[i][d]++;
      });
    });
    return positions;
  }

  // holds the most recently rendered position/digit counts + average,
  // so the "추천받기" button can reuse them without recomputing
  function renderHeatmap(rangeData) {
    const positions = computeDigitCounts(rangeData);
    const avg = rangeData.length / 10;
    lastPositions = positions;
    lastAvg = avg;

    let html = `<div class="hm-head"></div>`;
    for (let d = 0; d <= 9; d++) html += `<div class="hm-head">${d}</div>`;

    const posLabels = ["1번째(십만)", "2번째(만)", "3번째(천)", "4번째(백)", "5번째(십)", "6번째(일)"];

    positions.forEach((pos, i) => {
      html += `<div class="hm-row-label">${posLabels[i]}</div>`;
      for (let d = 0; d <= 9; d++) {
        const v = pos[d];
        const above = v > avg;
        const cls = above ? "hm-cell hm-cell--above" : "hm-cell";
        html += `<div class="${cls}" title="${posLabels[i]} · 숫자 ${d} · ${v}회 (평균 ${avg.toFixed(1)}회)">${v}</div>`;
      }
    });

    $("#heatmap").innerHTML = html;
  }

  function renderHotCold(rangeData) {
    const positions = computeDigitCounts(rangeData);
    const posLabels = ["1번째", "2번째", "3번째", "4번째", "5번째", "6번째"];

    let hotHtml = "";
    let coldHtml = "";

    positions.forEach((pos, i) => {
      const entries = Object.entries(pos).map(([d, c]) => [parseInt(d, 10), c]);
      entries.sort((a, b) => b[1] - a[1]);
      const [hotDigit, hotCount] = entries[0];
      entries.sort((a, b) => a[1] - b[1]);
      const [coldDigit, coldCount] = entries[0];

      hotHtml += `
        <div class="hc-item">
          <div class="hc-pos">${posLabels[i]} 자리</div>
          <div class="hc-digit">${hotDigit}</div>
          <div class="hc-count">${hotCount}회</div>
        </div>`;
      coldHtml += `
        <div class="hc-item">
          <div class="hc-pos">${posLabels[i]} 자리</div>
          <div class="hc-digit">${coldDigit}</div>
          <div class="hc-count">${coldCount}회</div>
        </div>`;
    });

    $("#hotNumbers").innerHTML = hotHtml;
    $("#coldNumbers").innerHTML = coldHtml;
  }

  /* ---------------------------------------------------------------------
     GENERATOR — 조건별 번호 추출
     --------------------------------------------------------------------- */
  function initGenerator() {
    // 조 선택 chips
    $$("#joChoice .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        $$("#joChoice .chip").forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        genState.jo = chip.dataset.jo;
      });
    });

    // 추출 개수 chips
    $$("#countChoice .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        $$("#countChoice .chip").forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        genState.count = parseInt(chip.dataset.count, 10);
      });
    });

    // 포함/제외 숫자 chips (0~9), 서로 겹치면 자동 해제
    buildDigitChipRow("#includeDigits", genState.includeDigits, genState.excludeDigits);
    buildDigitChipRow("#excludeDigits", genState.excludeDigits, genState.includeDigits);

    // 자리 고정 입력 — 숫자 1개만 허용
    $$("#fixedDigits input").forEach((input) => {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^0-9]/g, "").slice(0, 1);
      });
    });

    $("#genForm").addEventListener("submit", (e) => {
      e.preventDefault();
      runGenerate();
    });

    $("#hmRecommendBtn").addEventListener("click", runHeatmapRecommend);
  }

  function runHeatmapRecommend() {
    if (!lastPositions) return;

    // 자리별 "평균보다 많이 나온 숫자" 풀 구성 (풀이 비면 전체 0~9로 대체)
    const pools = lastPositions.map((pos) => {
      const above = [];
      for (let d = 0; d <= 9; d++) {
        if (pos[d] > lastAvg) above.push(d);
      }
      return above.length ? above : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    });

    const games = [];
    for (let i = 0; i < 5; i++) {
      const digits = pools.map((pool) => pool[Math.floor(Math.random() * pool.length)]);
      games.push(digits.join(""));
    }

    const html = games
      .map(
        (num, i) => `
        <div class="mini-ticket">
          <div class="mini-ticket-head">
            <span class="mini-idx">GAME ${i + 1}</span>
          </div>
          <div class="mini-digits">${digitCells(num)}</div>
        </div>`
      )
      .join("");
    $("#hmRecommendTickets").innerHTML = html;
  }

  function buildDigitChipRow(sel, ownSet, otherSet) {
    const container = $(sel);
    let html = "";
    for (let d = 0; d <= 9; d++) {
      html += `<button type="button" class="chip" data-digit="${d}">${d}</button>`;
    }
    container.innerHTML = html;
    $$(".chip", container).forEach((chip) => {
      chip.addEventListener("click", () => {
        const d = chip.dataset.digit;
        if (ownSet.has(d)) {
          ownSet.delete(d);
          chip.classList.remove("is-active");
        } else {
          ownSet.add(d);
          chip.classList.add("is-active");
          if (otherSet.has(d)) {
            otherSet.delete(d);
            const otherContainer = sel === "#includeDigits" ? $("#excludeDigits") : $("#includeDigits");
            const otherChip = $(`.chip[data-digit="${d}"]`, otherContainer);
            if (otherChip) otherChip.classList.remove("is-active");
          }
        }
      });
    });
  }

  function readConditions() {
    const fixed = $$("#fixedDigits input").map((inp) => (inp.value === "" ? null : inp.value));
    const oddCountVal = $("#oddCount").value;
    const sumMinVal = $("#sumMin").value;
    const sumMaxVal = $("#sumMax").value;

    return {
      jo: genState.jo,
      count: genState.count,
      fixed,
      include: Array.from(genState.includeDigits),
      exclude: Array.from(genState.excludeDigits),
      oddCount: oddCountVal === "any" ? null : parseInt(oddCountVal, 10),
      sumMin: sumMinVal === "" ? null : parseInt(sumMinVal, 10),
      sumMax: sumMaxVal === "" ? null : parseInt(sumMaxVal, 10),
      avoidPast: $("#avoidPast").checked,
    };
  }

  function validateConditions(cond) {
    // 고정 자리 숫자가 제외 목록과 겹치면 모순
    for (const f of cond.fixed) {
      if (f !== null && cond.exclude.includes(f)) {
        return `고정한 숫자 "${f}"가 제외 숫자 목록에도 있어요. 조건을 다시 확인해주세요.`;
      }
    }
    // 포함/제외 동시 지정 (이미 UI에서 방지하지만 방어적으로)
    for (const d of cond.include) {
      if (cond.exclude.includes(d)) {
        return `숫자 "${d}"가 포함/제외 목록에 동시에 있어요.`;
      }
    }
    if (cond.sumMin !== null && cond.sumMax !== null && cond.sumMin > cond.sumMax) {
      return "합계 최소값이 최대값보다 커요.";
    }
    if ((cond.sumMin !== null && cond.sumMin > 54) || (cond.sumMax !== null && cond.sumMax < 0)) {
      return "합계 범위는 0~54 사이여야 해요.";
    }
    if (cond.exclude.length >= 10) {
      return "0~9 숫자를 전부 제외할 수는 없어요. 최소 1개는 남겨주세요.";
    }
    if (cond.include.length > 6) {
      return "포함할 숫자는 최대 6개까지만 지정할 수 있어요 (자리가 6개뿐이라서요).";
    }
    return null;
  }

  function pastNumberSet() {
    // 회차 무관, 실제 나왔던 6자리 조합(1등 기준) 전체
    return new Set(DATA.map((r) => r.number));
  }

  function generateOne(cond, pastSet) {
    const jo = cond.jo === "all" ? String(1 + Math.floor(Math.random() * 5)) : cond.jo;

    const digits = cond.fixed.map((f) => {
      if (f !== null) return parseInt(f, 10);
      let d;
      do {
        d = Math.floor(Math.random() * 10);
      } while (cond.exclude.includes(String(d)));
      return d;
    });

    const numberStr = digits.join("");

    if (cond.include.length) {
      const present = cond.include.every((d) => numberStr.includes(d));
      if (!present) return null;
    }

    if (cond.oddCount !== null) {
      const odds = digits.filter((d) => d % 2 === 1).length;
      if (odds !== cond.oddCount) return null;
    }

    const sum = digits.reduce((a, b) => a + b, 0);
    if (cond.sumMin !== null && sum < cond.sumMin) return null;
    if (cond.sumMax !== null && sum > cond.sumMax) return null;

    if (cond.avoidPast && pastSet.has(numberStr)) return null;

    return { group: jo, number: numberStr };
  }

  function runGenerate() {
    const cond = readConditions();
    const errEl = $("#genError");
    const err = validateConditions(cond);
    if (err) {
      errEl.textContent = err;
      return;
    }
    errEl.textContent = "";

    const pastSet = cond.avoidPast ? pastNumberSet() : null;
    const results = [];
    const seen = new Set(); // 이번 추출 내 중복 방지
    const MAX_ATTEMPTS = 60000;
    let attempts = 0;

    while (results.length < cond.count && attempts < MAX_ATTEMPTS) {
      attempts++;
      const one = generateOne(cond, pastSet);
      if (!one) continue;
      const key = one.group + "-" + one.number;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(one);
    }

    if (results.length === 0) {
      $("#genTickets").innerHTML =
        '<div class="gen-empty">이 조건에 맞는 번호를 찾지 못했어요. 조건을 조금 완화해보세요.</div>';
      return;
    }

    if (results.length < cond.count) {
      errEl.textContent = `조건이 너무 까다로워서 ${results.length}게임만 뽑혔어요 (요청: ${cond.count}게임).`;
    }

    renderGenResults(results);
  }

  function renderGenResults(results) {
    const html = results
      .map((r, i) => {
        return `
        <div class="mini-ticket">
          <div class="mini-ticket-head">
            <span class="mini-jo">${r.group}조</span>
            <span class="mini-idx">GAME ${i + 1}</span>
          </div>
          <div class="mini-digits">${digitCells(r.number)}</div>
        </div>`;
      })
      .join("");
    $("#genTickets").innerHTML = html;
  }
})();

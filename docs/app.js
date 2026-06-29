/* 코스피·코스닥 50일 이격도 트래커 — 프론트엔드
 * 데이터는 MDD 페이지가 만든 단일 공용 데이터(canonical)에서 읽어 수치를 일치시킨다. */
(function () {
  "use strict";

  // 지수별 구간 임계값(코스피=이그전, 코스닥=백분위 매칭). 공용 데이터(latest.json)에서 덮어씀.
  const DEFAULT_THRESH = {
    kospi:  { disp: { overheat: 130, caution: 120, cooldown: 105 }, mdd: { watch: -5, correction: -10, breach: -15 } },
    kosdaq: { disp: { overheat: 124, caution: 118, cooldown: 106 }, mdd: { watch: -9, correction: -14, breach: -20 } },
  };
  let THRESH = DEFAULT_THRESH;

  const CFG = window.SITE_CONFIG || {};
  const track = (name, params) => {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n, d = 2) =>
    n == null || isNaN(n) ? "—" : Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const signed = (n, d = 2) => (n == null || isNaN(n) ? "—" : (n > 0 ? "+" : "") + fmt(n, d));

  function dispZone(v, key) {
    if (v == null) return ["", ""];
    const t = THRESH[key].disp;
    if (v >= t.overheat) return ["overheat", "과열권"];
    if (v >= t.caution) return ["caution", "과열 경계"];
    if (v <= t.cooldown) return ["cooldown", "과열 해소"];
    return ["normal", "정상"];
  }
  function mddZone(dd, key) {
    if (dd == null) return ["", ""];
    const t = THRESH[key].mdd;
    if (dd <= t.breach) return ["breach", "경계"];
    if (dd <= t.correction) return ["correction", "조정"];
    if (dd <= t.watch) return ["watch", "관심"];
    return ["normal", "정상"];
  }

  let dispChart, HISTORY = [];
  const VIS = { kospi: true, kosdaq: true };
  const SERIES_IDX = { kospi: 0, kosdaq: 1 };

  async function load() {
    wireTabs();
    wireTelegram();
    wireSeriesToggles();
    const [hist, latest] = await Promise.all([
      fetchJSON("./data/history.json"),
      fetchJSON("./data/latest.json"),
    ]);

    HISTORY = (hist || []).filter((d) => d && d.kospi_disp != null);
    if (!latest || !latest.indices) { emptyState(); return; }
    if (latest.thresholds && latest.thresholds.kospi) THRESH = latest.thresholds;

    $("updatedAt").textContent = `${latest.date} ${latest.type === "close" ? "15:40" : "12:00"} 기준`;
    checkStale(latest.date);
    renderDualCards(latest);
    renderGauge(latest);

    if (HISTORY.length) {
      registerZoom();
      buildDispChart(250);
      renderTable();
      wireRangeButtons("rangeBtns", (n) => buildDispChart(n));
    }
  }

  // 데이터 갱신 지연 감지: 마지막 데이터일이 4일(주말 여유 포함) 넘게 지났으면 경고 표시.
  function checkStale(dateStr) {
    if (!dateStr) return;
    const last = new Date(dateStr + "T00:00:00+09:00");
    const now = new Date();
    const days = Math.floor((now - last) / 86400000);
    if (days >= 4) {
      const row = document.querySelector(".updated-row");
      if (row && !document.getElementById("staleWarn")) {
        const s = document.createElement("span");
        s.id = "staleWarn";
        s.className = "stale-warn";
        s.textContent = `⚠ 갱신 지연 — ${days}일 전 데이터`;
        row.appendChild(s);
      }
    }
  }

  function wireTabs() {
    const url = CFG.mddUrl || "";
    if (!url) return;
    const join = (u) => u + (u.includes("?") ? "&" : "?") + "utm_source=disparity&utm_medium=tab";
    ["mddTab", "mddLink2"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.href = join(url);
      el.addEventListener("click", () => track("mdd_click", { from: id }));
    });
  }

  function wireTelegram() {
    const url = CFG.telegramUrl || "";
    if (!url) return;
    const l = $("tgLink");
    if (!l) return;
    l.href = url;
    l.hidden = false;
    l.addEventListener("click", () => track("telegram_click", { url }));
  }

  function wireSeriesToggles() {
    const box = $("seriesToggles");
    if (!box) return;
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".series-toggle");
      if (!b) return;
      const key = b.dataset.key;
      VIS[key] = !VIS[key];
      b.classList.toggle("on", VIS[key]);
      if (dispChart) {
        dispChart.setDatasetVisibility(SERIES_IDX[key], VIS[key]);
        dispChart.update();
      }
      track("series_toggle", { key, on: VIS[key] });
    });
  }

  function renderDualCards(latest) {
    const order = ["kospi", "kosdaq"];
    $("dualCards").innerHTML = order.map((key) => {
      const idx = latest.indices[key];
      if (!idx) return "";
      const [zk, zl] = dispZone(idx.disparity, key);
      const up = idx.change > 0, dn = idx.change < 0;
      const chg = idx.change == null ? "" :
        `${up ? "▲" : dn ? "▼" : "—"} ${fmt(Math.abs(idx.change))} (${signed(idx.change_pct)}%)`;
      const delta = idx.prev_disparity != null
        ? `직전 대비 ${signed(+(idx.disparity - idx.prev_disparity).toFixed(2), 2)}p` : "";
      return `<div class="idx-card">
        <div class="idx-head">
          <div class="idx-name"><span class="dot ${key}"></span>${idx.name}</div>
          <div class="idx-price">${fmt(idx.price)}<span class="chg ${up ? "up" : dn ? "down" : ""}">${chg}</span></div>
        </div>
        <div class="dd-big dz-${zk}">${fmt(idx.disparity, 1)}<span class="pct">%</span></div>
        <div class="idx-zone dz-${zk}">${zl}<span class="zsub">${delta}</span></div>
        <div class="idx-stats">
          <div class="row"><span class="k">50일 이동평균</span><span class="v">${fmt(idx.ma50)}</span></div>
        </div>
      </div>`;
    }).join("");
  }

  // 게이지 위치: 각 지수의 '자기 구간(zone)' 안 위치(0~100%). 좌(해소)→우(과열), 동일폭 25% 세그먼트.
  function dispPos(v, key) {
    const t = THRESH[key].disp;
    let p;
    if (v <= t.cooldown) { const floor = t.cooldown - 18; p = clamp((v - floor) / (t.cooldown - floor), 0, 1) * 25; } // 해소
    else if (v < t.caution) p = 25 + (v - t.cooldown) / (t.caution - t.cooldown) * 25;   // 정상
    else if (v < t.overheat) p = 50 + (v - t.caution) / (t.overheat - t.caution) * 25;   // 경계
    else { const cap = t.overheat + 15; p = 75 + clamp((v - t.overheat) / (cap - t.overheat), 0, 1) * 25; } // 과열
    return clamp(p, 4, 96);
  }

  function renderGauge(latest) {
    const place = (idx, mkId, vId) => {
      const data = latest.indices[idx];
      if (!data || data.disparity == null) return;
      const m = $(mkId);
      m.style.left = dispPos(data.disparity, idx) + "%";
      m.hidden = false;
      $(vId).textContent = `${fmt(data.disparity, 1)}%`;
    };
    place("kospi", "mkKospi", "mkKospiV");
    place("kosdaq", "mkKosdaq", "mkKosdaqV");
  }

  function emptyState() {
    $("dualCards").innerHTML = `<div class="idx-card"><div class="idx-zone">데이터 불러오는 중…</div><p class="muted">MDD 페이지의 공용 데이터를 읽지 못했습니다. 잠시 후 새로고침 해주세요.</p></div>`;
  }

  // ---- 차트 ----
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function slice(n) { return n && n > 0 ? HISTORY.slice(-n) : HISTORY; }

  function buildDispChart(n) {
    const data = slice(n);
    const labels = data.map((d) => d.date);
    const ctx = $("dispChart");
    if (dispChart) dispChart.destroy();
    const line = (key, color) => ({
      label: key === "kospi" ? "코스피" : "코스닥",
      data: data.map((d) => d[key + "_disp"]),
      borderColor: color, borderWidth: 1.7, pointRadius: 0, tension: 0.15, fill: false,
      hidden: !VIS[key],
    });
    const ref = (y, color) => ({
      label: "", data: labels.map(() => y), borderColor: color,
      borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false,
    });
    const allVals = data.flatMap((d) => [d.kospi_disp, d.kosdaq_disp]).filter((v) => v != null);
    dispChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [
        line("kospi", css("--kospi")), line("kosdaq", css("--kosdaq")),
        ref(THRESH.kospi.disp.overheat, css("--overheat")), ref(THRESH.kospi.disp.cooldown, css("--cooldown")),
      ] },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#0b0f17", borderColor: "#222c3d", borderWidth: 1,
            titleColor: "#e7edf6", bodyColor: "#e7edf6", padding: 10,
            filter: (item) => item.dataset.label !== "",
            callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y, 2)}` },
          },
          zoom: {
            pan: { enabled: true, mode: "x" },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
          },
        },
        scales: {
          x: { ticks: { color: css("--muted"), maxTicksLimit: 6, font: { size: 10 } }, grid: { color: "#1c2535" } },
          y: { position: "right",
            suggestedMin: Math.min(100, Math.min(...allVals) - 3),
            suggestedMax: Math.max(132, Math.max(...allVals) + 3),
            ticks: { color: css("--muted"), font: { size: 10 } }, grid: { color: "#1c2535" } },
        },
      },
    });
    ctx.ondblclick = () => dispChart.resetZoom();
  }

  function registerZoom() {
    if (!window.Chart) return;
    const z = window.ChartZoom || window.chartjsPluginZoom || window["chartjs-plugin-zoom"];
    if (z && (z.id === "zoom" || z.default)) {
      try { window.Chart.register(z.default || z); } catch (e) { /* 이미 등록됨 */ }
    }
  }

  function wireRangeButtons(boxId, onPick) {
    const box = $(boxId);
    if (!box) return;
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      [...box.children].forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      onPick(+b.dataset.r);
      track("range_change", { range: b.dataset.r });
    });
  }

  function renderTable() {
    const tb = $("histTable").querySelector("tbody");
    const rows = HISTORY.slice(-30).reverse();
    tb.innerHTML = rows.map((d) => {
      const [kz, kl] = dispZone(d.kospi_disp, "kospi");
      const hasKq = d.kosdaq_disp != null;
      const [qz, ql] = hasKq ? dispZone(d.kosdaq_disp, "kosdaq") : ["", "—"];
      return `<tr>
        <td class="c-date">${d.date}</td>
        <td class="c-kospi"><b>${fmt(d.kospi_disp, 1)}%</b></td>
        <td class="c-kzone"><span class="pill ${kz}">${kl}</span></td>
        <td class="c-kosdaq"><b>${hasKq ? fmt(d.kosdaq_disp, 1) + "%" : "—"}</b></td>
        <td class="c-dzone">${hasKq ? `<span class="pill ${qz}">${ql}</span>` : ""}</td>
      </tr>`;
    }).join("");
  }

  async function fetchJSON(url) {
    try {
      const sep = url.includes("?") ? "&" : "?";
      const r = await fetch(url + sep + "v=" + Date.now());
      if (!r.ok) return null;
      const t = (await r.text()).trim();
      return t ? JSON.parse(t) : null;
    } catch (e) { return null; }
  }

  load();
})();

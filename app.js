"use strict";

const A = window.CDTVAnalysis;
const $ = id => document.getElementById(id);

let allNormalizedRows = [];
let allLoadedRows = [];
let rows = [];
let allWeeks = [];
let songStats = [];
let artistStats = [];
let currentChart = null;
let currentTable = { headers: [], rows: [], filename: "analysis.csv" };

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function fmt(v, d = 2) {
  return v == null || Number.isNaN(v) ? "" : Number(Number(v).toFixed(d));
}
function pct(v, d = 1) {
  return v == null || Number.isNaN(v) ? "" : `${(Number(v) * 100).toFixed(d)}%`;
}
function pctValue(v, d = 1) {
  return v == null || Number.isNaN(v) ? "" : `${Number(v).toFixed(d)}%`;
}
function pointMode() { return $("pointMode").value; }
function topN() { return Number($("topN").value) || 20; }

function rebuild() {
  allWeeks = A.getWeeks(rows);
  songStats = A.buildSongStats(rows, pointMode(), allLoadedRows);
  artistStats = A.buildArtistStats(rows, pointMode());
  populateArtistPicker();
  updateArtistScopeNote();
}

function applyDateFilter() {
  const start = $("startDate").value, end = $("endDate").value;
  const next = allLoadedRows.filter(r => (!start || r.week >= start) && (!end || r.week <= end));
  if (!next.length) {
    alert("指定期間に分析対象データがありません。");
    return false;
  }
  rows = next;
  rebuild();
  showSummary();
  return true;
}

function showSummary() {
  if (!rows.length) return;
  $("summaryCard").hidden = false;

  const edge = songStats.filter(s => s.leftCensored || s.rightCensored).length;
  const excluded = allNormalizedRows.filter(r => !r.analysisTarget).length;
  const invalidTarget = allNormalizedRows.filter(r => r.analysisTarget && !A.isValidAnalysisRow(r)).length;
  const qaRows = allNormalizedRows.filter(r => A.isQaFlagged(r.qaFlag)).length;
  const corrected = allNormalizedRows.filter(r => r.correctionNote).length;

  const metrics = [
    ["CSV行数", allNormalizedRows.length],
    ["全期間有効分析行", allLoadedRows.length],
    ["現在期間の行数", rows.length],
    ["分析対象外", excluded],
    ["ランキング週数", allWeeks.length],
    ["曲数", songStats.length],
    ["主要アーティスト数", artistStats.length],
    ["QAフラグ行", qaRows],
    ["補正メモ行", corrected],
    ["期間", `${allWeeks[0]}<br>～<br>${allWeeks.at(-1)}`],
    ["ポイント方式", esc(A.pointLabel(pointMode()))]
  ];

  $("summary").innerHTML = metrics.map(([n, v]) =>
    `<div class="metric"><div class="metric-name">${n}</div><div class="metric-value ${String(v).includes("<br>") ? "metric-value-small" : ""}">${v}</div></div>`
  ).join("");

  const notices = [];
  if (edge) notices.push(`期間端に接する曲は <b>${edge}曲</b>。期間外の実績が切れている可能性があります。`);
  if (invalidTarget) notices.push(`分析対象=1 だが必須値・順位などが不正で除外された行が <b>${invalidTarget}件</b> あります。データ品質チェックを確認してください。`);
  if (excluded) notices.push(`CSVの「分析対象」で除外された行は <b>${excluded}件</b>。通常分析には投入していません。`);

  $("edgeWarning").innerHTML = notices.map(x => `<div class="notice">${x}</div>`).join("");
}

function populateArtistPicker() {
  const selected = new Set([...$("artistPicker").selectedOptions].map(o => o.value));
  const sorted = [...artistStats].sort((a, b) => b.points - a.points);
  $("artistPicker").innerHTML = sorted.map(a =>
    `<option value="${esc(a.artist)}" ${selected.has(a.artist) ? "selected" : ""}>${esc(a.artist)} (${a.points.toFixed(1)} pt)</option>`
  ).join("");
  $("artistCount").max = Math.max(1, artistStats.length);
}

function selectedArtists() {
  return [...$("artistPicker").selectedOptions].map(o => o.value);
}
function scopedArtists() {
  return A.resolveArtistScope(
    artistStats,
    $("artistScopeMode").value,
    $("artistCount").value,
    selectedArtists()
  );
}
function updateArtistScopeNote() {
  if (!artistStats.length) return;
  const artists = scopedArtists();
  let txt = `現在 ${artists.length} / ${artistStats.length} アーティストを対象にします。`;
  if (artists.length > 30) txt += " 全系列を描画するため、グラフはかなり混雑します。";
  $("artistScopeNote").textContent = txt;
  $("artistCount").disabled = $("artistScopeMode").value !== "top";
  $("artistPicker").disabled = $("artistScopeMode").value !== "selected";
}

function clearResultExtras() {
  $("resultSummary").innerHTML = "";
  $("resultExtra").innerHTML = "";
}

function setCurrentTable(headers, data, filename) {
  currentTable = { headers, rows: data, filename };
}

function showTable(headers, data, filename = "analysis.csv") {
  $("resultCard").hidden = false;
  setCurrentTable(headers, data, filename);

  let html = '<div class="table-wrap"><table><thead><tr>' +
    headers.map(h => `<th>${esc(h)}</th>`).join("") +
    '</tr></thead><tbody>';

  for (const row of data) {
    html += '<tr>' + row.map((c, i) =>
      `<td class="${i === 0 ? "left" : ""}">${esc(c)}</td>`
    ).join("") + '</tr>';
  }
  $("resultTable").innerHTML = html + '</tbody></table></div>';
}

function renderSummary(items) {
  $("resultSummary").innerHTML = items.map(([name, value, note = ""]) =>
    `<div class="metric result-metric">
      <div class="metric-name">${esc(name)}</div>
      <div class="metric-value">${esc(value)}</div>
      ${note ? `<div class="metric-note">${esc(note)}</div>` : ""}
    </div>`
  ).join("");
}

function renderExtraTable(title, headers, data) {
  let html = `<section class="extra-section"><h3>${esc(title)}</h3><div class="table-wrap extra-table"><table><thead><tr>`;
  html += headers.map(h => `<th>${esc(h)}</th>`).join("");
  html += '</tr></thead><tbody>';
  for (const row of data) {
    html += '<tr>' + row.map((c, i) => `<td class="${i === 0 ? "left" : ""}">${esc(c)}</td>`).join("") + '</tr>';
  }
  html += '</tbody></table></div></section>';
  $("resultExtra").insertAdjacentHTML("beforeend", html);
}

function destroyChart() {
  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }
}
function hideChart() {
  destroyChart();
  $("chartCard").hidden = true;
}
function showBarChart(title, labels, values, label) {
  $("chartCard").hidden = false;
  $("chartTitle").textContent = title;
  $("chartWarning").textContent = "";
  destroyChart();

  currentChart = new Chart($("chart"), {
    type: "bar",
    data: { labels, datasets: [{ label, data: values }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}
function showMultiLineChart(title, labels, series, yTitle, { reverse = false, min = null, max = null } = {}) {
  $("chartCard").hidden = false;
  $("chartTitle").textContent = title;
  $("chartWarning").textContent = series.length > 30
    ? `全${series.length}系列を描画しています。必要なら対象アーティストを絞ってください。`
    : "";
  destroyChart();

  const y = { beginAtZero: !reverse, reverse, title: { display: true, text: yTitle } };
  if (min != null) y.min = min;
  if (max != null) y.max = max;

  currentChart = new Chart($("chart"), {
    type: "line",
    data: {
      labels,
      datasets: series.map(s => ({
        label: s.label,
        data: s.data,
        pointRadius: series.length > 20 ? 0 : 2,
        borderWidth: series.length > 30 ? 1 : 2,
        tension: .12,
        spanGaps: false
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: series.length > 40 ? false : undefined,
      interaction: { mode: "nearest", intersect: false },
      scales: { y },
      plugins: { legend: { display: series.length <= 35, position: "bottom" } }
    }
  });
}

function scrollToResult() {
  requestAnimationFrame(() => $("resultCard").scrollIntoView({ behavior: "smooth", block: "start" }));
}

function showSongRanking(key, title, { ascending = false, filter = null, value = x => x[key] } = {}) {
  clearResultExtras();
  let data = filter ? songStats.filter(filter) : [...songStats];
  data.sort((a, b) => ascending ? value(a) - value(b) : value(b) - value(a));
  data = data.slice(0, topN());

  $("resultTitle").textContent = `${title} TOP${data.length}`;
  $("resultInfo").textContent = `ポイント方式: ${A.pointLabel(pointMode())}`;

  const table = data.map((s, i) => [
    i + 1, s.song, s.artist, fmt(value(s), 3), s.weeks, s.bestRank,
    (s.leftCensored || s.rightCensored) ? "⚠" : ""
  ]);
  showTable(["順位", "曲名", "アーティスト", title, "登場週", "最高順位", "期間端"], table, `${title}.csv`);
  showBarChart(title, data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(value).reverse(), title);
}

function showSongUpperResidence() {
  clearResultExtras();
  const data = [...songStats]
    .sort((a, b) => b.top10Weeks - a.top10Weeks || b.top3Weeks - a.top3Weeks || b.points - a.points)
    .slice(0, topN());

  $("resultTitle").textContent = `上位滞在 TOP${data.length}`;
  $("resultInfo").textContent = "1位・TOP3・TOP10・TOP20の滞在週を同時に比較します。";
  showTable(
    ["順位", "曲名", "アーティスト", "1位週", "TOP3週", "TOP10週", "TOP20週", "登場週", "最高順位"],
    data.map((s, i) => [i + 1, s.song, s.artist, s.no1Weeks, s.top3Weeks, s.top10Weeks, s.top20Weeks, s.weeks, s.bestRank]),
    "song_upper_residence.csv"
  );
  showBarChart("TOP10滞在週", data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(s => s.top10Weeks).reverse(), "TOP10週");
}

function showLateBloomers() {
  clearResultExtras();
  const data = songStats
    .filter(s => s.weeks >= 3 && s.debutToBest > 0 && s.weeksToPeak > 0)
    .sort((a, b) => b.lateBloomScore - a.lateBloomScore)
    .slice(0, topN());

  $("resultTitle").textContent = `遅咲き・上昇型 TOP${data.length}`;
  $("resultInfo").textContent = "上昇幅 × log2(1 + 実際のピーク所要週)。圏外期間も時間として数えます。";
  showTable(
    ["順位", "曲名", "アーティスト", "初登場順位", "最高順位", "上昇幅", "ピーク所要週", "遅咲きスコア"],
    data.map((s, i) => [i + 1, s.song, s.artist, s.debutRank, s.bestRank, s.debutToBest, s.weeksToPeak, fmt(s.lateBloomScore, 3)]),
    "late_bloomers.csv"
  );
  showBarChart("遅咲き・上昇型", data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(s => s.lateBloomScore).reverse(), "スコア");
}

function showSongVolatility() {
  clearResultExtras();
  const data = songStats
    .filter(s => s.changeSamples >= 3)
    .sort((a, b) => b.avgAbsChange - a.avgAbsChange)
    .slice(0, topN());

  $("resultTitle").textContent = `順位変動度 TOP${data.length}`;
  $("resultInfo").textContent = "連続した実週間どうしの順位差の絶対値平均。単なる順位標準偏差より「毎週の暴れ方」を見ます。";
  showTable(
    ["順位", "曲名", "アーティスト", "平均週間変動", "標準偏差", "最大上昇", "最大下落", "連続比較数", "登場週"],
    data.map((s, i) => [i + 1, s.song, s.artist, fmt(s.avgAbsChange, 2), fmt(s.rankStd, 2), s.biggestRise, s.biggestFall, s.changeSamples, s.weeks]),
    "song_volatility.csv"
  );
  showBarChart("順位変動度", data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(s => s.avgAbsChange).reverse(), "平均週間変動");
}

function showHitCenter() {
  clearResultExtras();
  const data = songStats
    .filter(s => s.spanWeeks >= 4)
    .sort((a, b) => b.hitCenter - a.hitCenter)
    .slice(0, topN());

  $("resultTitle").textContent = `後半型・ヒット重心 TOP${data.length}`;
  $("resultInfo").textContent = "初登場=0、最終登場=1としてポイントの時間的重心を計算。0.5より大きいほど後半寄りです。";
  showTable(
    ["順位", "曲名", "アーティスト", "ヒット重心", "滞在率", "期間週", "登場週", "初登場順位", "最高順位"],
    data.map((s, i) => [i + 1, s.song, s.artist, fmt(s.hitCenter, 3), pct(s.occupancyRate), s.spanWeeks, s.weeks, s.debutRank, s.bestRank]),
    "hit_center.csv"
  );
  showBarChart("ヒット重心", data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(s => s.hitCenter).reverse(), "ヒット重心");
}

function showArtistRanking(key, title, { ascending = false, value = x => x[key], filter = null, display = v => fmt(v, 3) } = {}) {
  clearResultExtras();
  let data = filter ? artistStats.filter(filter) : [...artistStats];
  data.sort((a, b) => ascending ? value(a) - value(b) : value(b) - value(a));
  data = data.slice(0, topN());

  $("resultTitle").textContent = `${title} TOP${data.length}`;
  $("resultInfo").textContent = `主要アーティスト単位。ポイント方式: ${A.pointLabel(pointMode())}`;

  showTable(
    ["順位", "主要アーティスト", title, "総合Pt", "曲数", "活動週", "最高順位", "TOP10到達曲", "1位到達曲", "TOP10延べ曲週", "同時最大", "代表曲"],
    data.map((a, i) => [
      i + 1, a.artist, display(value(a)), fmt(a.points, 1), a.songs, a.chartWeeks,
      a.bestRank, a.top10Songs, a.no1Songs, a.top10SongWeeks, a.maxSimultaneous, a.bestSong
    ]),
    `${title}.csv`
  );
  showBarChart(title, data.map(a => a.artist).reverse(), data.map(value).reverse(), title);
}

const weeklyMetricInfo = {
  points: ["週間アーティストポイント", "ポイント", false],
  moving4: ["4週移動平均ポイント", "ポイント", false],
  cumulative: ["累積アーティストポイント", "累積ポイント", false],
  artistRank: ["週間アーティスト順位", "順位", true],
  songs: ["週間ランクイン曲数", "曲数", false],
  top10Songs: ["週間TOP10曲数", "曲数", false],
  no1Songs: ["週間1位曲数", "曲数", false],
  bestRank: ["週間最高順位", "順位", true]
};

function showWeeklyArtistMetric(metric) {
  clearResultExtras();
  const artists = scopedArtists();
  if (!artists.length) {
    alert("対象アーティストが選択されていません。");
    return;
  }

  const [title, unit, reverse] = weeklyMetricInfo[metric];
  const matrix = A.buildWeeklyArtistMatrix(rows, artists, metric, pointMode());

  $("resultTitle").textContent = `${title}【数値表】`;
  $("resultInfo").textContent = `${artists.length}アーティスト。表とグラフは同じデータを使用します。`;

  showTable(
    ["週", ...artists],
    matrix.data.map(d => [d.week, ...d.vals.map(v => v == null ? "" : fmt(v, 2))]),
    `${metric}_weekly_artist.csv`
  );

  showMultiLineChart(
    title,
    matrix.weeks,
    artists.map((a, i) => ({ label: a, data: matrix.data.map(d => d.vals[i]) })),
    unit,
    reverse ? { reverse: true, min: 1 } : {}
  );
}

function showWeeklyMarket() {
  clearResultExtras();
  const data = A.buildWeeklyMarket(rows, pointMode());
  $("resultTitle").textContent = "週別チャート構造";
  $("resultInfo").textContent = "毎週固定になる平均順位・中央値順位・TOP100総ポイントは撤去し、実際に変動する構造だけを表示します。";

  showTable(
    ["週", "登場アーティスト数", "1アーティスト平均掲載曲数", "首位アーティスト", "首位Pt", "首位シェア%", "TOP5シェア%", "実効アーティスト数"],
    data.map(x => [x.week, x.artists, fmt(x.songsPerArtist, 3), x.topArtist, fmt(x.topArtistPoints, 2), fmt(x.topArtistShare, 2), fmt(x.top5Share, 2), fmt(x.effectiveArtists, 2)]),
    "weekly_market_structure.csv"
  );
  showMultiLineChart("週別 登場アーティスト数", data.map(x => x.week), [{ label: "登場アーティスト数", data: data.map(x => x.artists) }], "アーティスト数");
}

function showArtistConcentration() {
  clearResultExtras();
  const data = A.buildArtistConcentration(rows, pointMode());
  $("resultTitle").textContent = "アーティスト集中度";
  $("resultInfo").textContent = "主表示は首位・TOP5シェア。HHI・実効アーティスト数・エントロピーは詳細列として保持します。";

  showTable(
    ["週", "アーティスト数", "TOP1シェア%", "TOP3シェア%", "TOP5シェア%", "TOP10シェア%", "HHI", "実効アーティスト数", "エントロピー"],
    data.map(x => [x.week, x.artists, fmt(x.top1, 3), fmt(x.top3, 3), fmt(x.top5, 3), fmt(x.top10, 3), fmt(x.hhi, 2), fmt(x.effectiveArtists, 2), fmt(x.entropy, 4)]),
    "artist_concentration.csv"
  );
  showMultiLineChart(
    "アーティスト集中度",
    data.map(x => x.week),
    [{ label: "TOP1", data: data.map(x => x.top1) }, { label: "TOP5", data: data.map(x => x.top5) }],
    "シェア (%)",
    { min: 0, max: 100 }
  );
}

function showWeeklyTurnover() {
  clearResultExtras();
  const data = A.buildWeeklyTurnover(rows, allLoadedRows);
  $("resultTitle").textContent = "チャート流動性";
  $("resultInfo").textContent = "期間開始前の履歴も参照して新規/再登場を判定。Jaccard類似度で前週との顔ぶれの近さも測ります。";

  showTable(
    ["週", "新規", "再登場", "継続", "脱落", "新規率%", "再登場率%", "継続率%", "前週維持率%", "Jaccard%"],
    data.map(x => [x.week, x.newEntries, x.reentries, x.continuing, x.dropouts, fmt(x.newRate, 2), fmt(x.reentryRate, 2), fmt(x.continuingRate, 2), fmt(x.retentionRate, 2), fmt(x.jaccard, 2)]),
    "weekly_turnover.csv"
  );
  showMultiLineChart(
    "チャート流動性",
    data.map(x => x.week),
    [
      { label: "新規率", data: data.map(x => x.newRate) },
      { label: "再登場率", data: data.map(x => x.reentryRate) },
      { label: "継続率", data: data.map(x => x.continuingRate) }
    ],
    "割合 (%)",
    { min: 0, max: 100 }
  );
}

function showPointComparison() {
  clearResultExtras();
  const data = A.comparePointSystems(rows).slice(0, topN());
  $("resultTitle").textContent = "ポイント方式感度分析";
  $("resultInfo").textContent = "曲分析ではなく、ポイント設計を変えたとき総合順位がどれだけ動くかを検証します。";

  showTable(
    ["曲名", "アーティスト", "101-順位方式", "対数方式", "100/順位方式", "3方式平均順位", "最大順位差"],
    data.map(s => [s.song, s.artist, s.linearRank, s.logRank, s.reciprocalRank, fmt(s.avgSystemRank, 2), s.systemSpread]),
    "point_system_comparison.csv"
  );
  hideChart();
}

function showQuality() {
  clearResultExtras();
  const issues = A.qualityCheck(allNormalizedRows, allLoadedRows);
  const errors = issues.filter(x => x.severity === "error").length;
  const warnings = issues.filter(x => x.severity === "warning").length;
  const infos = issues.filter(x => x.severity === "info").length;

  $("resultTitle").textContent = "データ品質チェック";
  $("resultInfo").textContent = `error ${errors}件 / warning ${warnings}件 / info ${infos}件。分析前に捨てられる不正行も検査対象です。`;
  renderSummary([
    ["Error", errors],
    ["Warning", warnings],
    ["Info", infos],
    ["検査CSV行", allNormalizedRows.length]
  ]);

  showTable(
    ["重要度", "種類", "週", "順位", "曲名", "アーティスト", "内容"],
    issues.map(x => [x.severity, x.type, x.week, x.rank, x.song, x.artist, x.detail]),
    "data_quality.csv"
  );
  hideChart();
}

function showDataAudit() {
  clearResultExtras();
  const a = A.buildDataAudit(allNormalizedRows);

  $("resultTitle").textContent = "データ由来・正規化・補正状況";
  $("resultInfo").textContent = "CSVが持っている分析対象、データ由来、正規化状態、QA、補正メモを監査用に集約します。";

  renderSummary([
    ["CSV行", a.totals.rows],
    ["分析対象", a.totals.target],
    ["分析対象外", a.totals.excluded],
    ["QAフラグ", a.totals.qa],
    ["補正メモ", a.totals.corrected],
    ["矢印不整合", a.totals.arrowProblems]
  ]);

  showTable(
    ["区分", "値", "行数"],
    [
      ...a.sources.map(x => ["データ由来", x.name, x.count]),
      ...a.normalization.map(x => ["正規化状態", x.name, x.count]),
      ...a.types.map(x => ["種別", x.name, x.count]),
      ...a.qaFlags.map(x => ["QAフラグ", x.name, x.count])
    ],
    "data_audit_summary.csv"
  );

  if (a.corrections.length) {
    renderExtraTable(
      "補正メモ一覧",
      ["週", "順位", "曲名", "アーティスト", "補正メモ", "データ由来"],
      a.corrections.map(x => [x.week, x.rank, x.song, x.artist, x.note, x.source])
    );
  }
  hideChart();
}

function showWeeklyNo1() {
  clearResultExtras();
  const d = A.weeklyTopN(rows, 1);
  $("resultTitle").textContent = "週間1位の変遷";
  $("resultInfo").textContent = "";
  showTable(["週", "順位", "曲名", "アーティスト", "主要アーティスト"], d.map(x => [x.week, x.rank, x.song, x.artist, x.mainArtist]), "weekly_no1.csv");
  hideChart();
}

function showWeeklyTop10() {
  clearResultExtras();
  const d = A.weeklyTopN(rows, 10);
  $("resultTitle").textContent = "週間TOP10一覧";
  $("resultInfo").textContent = "全週のTOP10を縦持ちデータで出力します。";
  showTable(["週", "順位", "曲名", "アーティスト", "主要アーティスト"], d.map(x => [x.week, x.rank, x.song, x.artist, x.mainArtist]), "weekly_top10.csv");
  hideChart();
}

function showSongDetail(s) {
  clearResultExtras();

  $("resultTitle").textContent = `${s.song} / ${s.artist} 個別分析`;
  $("resultInfo").textContent = `曲ID: ${s.songId}`;

  renderSummary([
    ["総合ポイント", fmt(s.points, 1)],
    ["登場週", `${s.weeks}週`],
    ["初登場～最終", `${s.spanWeeks}週`],
    ["滞在率", pct(s.occupancyRate)],
    ["最高順位", `${s.bestRank}位`],
    ["TOP10", `${s.top10Weeks}週`],
    ["1位", `${s.no1Weeks}週`],
    ["再登場", `${s.reentries}回`],
    ["平均週間変動", fmt(s.avgAbsChange, 2)],
    ["ヒット重心", fmt(s.hitCenter, 3)],
    ["QA行", s.qaCount],
    ["補正行", s.correctionCount]
  ]);

  const history = s.entries.map(r => [
    r.week,
    r.rank,
    r.previousRank ?? "",
    r.actualChange,
    r.sourceChange,
    r.source,
    r.normalizationStatus,
    r.qaFlag,
    r.arrowConsistency,
    r.correctionNote
  ]);

  showTable(
    ["週", "順位", "前週順位", "実変動", "変動_ソース", "データ由来", "正規化状態", "QAフラグ", "矢印整合", "補正メモ"],
    history,
    `${safeFilename(s.song)}_history.csv`
  );

  renderExtraTable("データ情報", ["項目", "内容"], [
    ["正規化曲名", s.song],
    ["正規化アーティスト", s.artist],
    ["主要アーティスト", s.mainArtist],
    ["参加アーティスト", s.participants],
    ["原文曲名の種類", s.originalSongNames.join(" / ")],
    ["原文アーティストの種類", s.originalArtistNames.join(" / ")],
    ["曲ID", s.songId],
    ["主要アーティスト曲ID", s.mainArtistSongId],
    ["データ由来", s.sources.join(" / ")],
    ["正規化状態", s.normalizationStates.join(" / ")],
    ["初登場", `${s.firstDate} ${s.debutRank}位`],
    ["最終登場", `${s.lastDate} ${s.lastRank}位`],
    ["ピーク所要週", `${s.weeksToPeak}週`],
    ["最大上昇", s.biggestRise],
    ["最大下落", s.biggestFall],
    ["順位標準偏差", fmt(s.rankStd, 2)]
  ]);

  const firstIndex = allWeeks.indexOf(s.firstDate);
  const lastIndex = allWeeks.indexOf(s.lastDate);
  const labels = firstIndex >= 0 && lastIndex >= firstIndex ? allWeeks.slice(firstIndex, lastIndex + 1) : s.entries.map(r => r.week);
  const rankMap = new Map(s.entries.map(r => [r.week, r.rank]));
  const values = labels.map(w => rankMap.has(w) ? rankMap.get(w) : null);

  showMultiLineChart(`${s.song} / ${s.artist} 順位推移`, labels, [{ label: "順位", data: values }], "順位", { reverse: true, min: 1, max: 100 });
  scrollToResult();
}

function showArtistDetail(artist) {
  clearResultExtras();

  const stat = artistStats.find(a => a.artist === artist);
  if (!stat) {
    alert("現在の期間にこのアーティストの分析対象データがありません。");
    return;
  }
  const d = A.buildArtistDetail(rows, artist, pointMode());

  $("resultTitle").textContent = `${artist} 個別分析`;
  $("resultInfo").textContent = `主要アーティスト単位 / ポイント方式: ${A.pointLabel(pointMode())}`;

  renderSummary([
    ["総合ポイント", fmt(stat.points, 1)],
    ["ランクイン曲", `${stat.songs}曲`],
    ["活動週", `${stat.chartWeeks}週`],
    ["最長連続活動", `${stat.longestActiveStreak}週`],
    ["最高順位", `${stat.bestRank}位`],
    ["TOP10到達", `${stat.top10Songs}曲`],
    ["1位到達", `${stat.no1Songs}曲`],
    ["TOP10ヒット率", pct(stat.top10HitRate)],
    ["TOP10延べ曲週", stat.top10SongWeeks],
    ["同時最大", `${stat.maxSimultaneous}曲`],
    ["代表曲", stat.bestSong],
    ["代表曲依存度", pct(stat.bestSongShare)]
  ]);

  showTable(
    ["曲名", "表示アーティスト", "ポイント", "最高順位", "登場週", "TOP10週", "1位週", "初登場", "最終登場"],
    stat.songRows.map(x => [x.song, x.displayArtist, fmt(x.points, 2), x.bestRank, x.weeks, x.top10Weeks, x.no1Weeks, x.firstDate, x.lastDate]),
    `${safeFilename(artist)}_songs.csv`
  );

  renderExtraTable(
    "週別詳細",
    ["週", "週間Pt", "4週平均", "累積Pt", "週間アーティスト順位", "ランクイン曲", "TOP10", "TOP20", "1位", "最高順位", "平均順位", "中央値順位"],
    d.map(x => [
      x.week, fmt(x.points, 2), fmt(x.moving4, 2), fmt(x.cumulative, 2), x.artistRank ?? "",
      x.songs, x.top10, x.top20, x.no1, x.bestRank ?? "", fmt(x.avgRank, 2), fmt(x.medianRank, 2)
    ])
  );

  renderExtraTable("データ情報", ["項目", "内容"], [
    ["データ由来", stat.sources.join(" / ")],
    ["QAフラグ行", stat.qaCount],
    ["補正メモ行", stat.correctionCount],
    ["活動期間", stat.spanWeeks ? `${stat.spanWeeks}週` : ""],
    ["活動率", pct(stat.activityRate)],
    ["平均曲ポイント", fmt(stat.pointsPerSong, 2)],
    ["活動週あたりポイント", fmt(stat.pointsPerChartWeek, 2)],
    ["上位3曲依存度", pct(stat.top3CatalogShare)]
  ]);

  showMultiLineChart(
    `${artist} 週間ポイント`,
    d.map(x => x.week),
    [
      { label: "週間ポイント", data: d.map(x => x.points) },
      { label: "4週移動平均", data: d.map(x => x.moving4) }
    ],
    "ポイント"
  );
  scrollToResult();
}

function safeFilename(s) {
  return String(s || "analysis").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function updateSongSearch() {
  const q = $("songSearch").value.trim().toLowerCase();
  const box = $("songSearchResults");
  if (!q) {
    box.innerHTML = "";
    return;
  }

  const hits = songStats.filter(s => {
    const hay = [
      s.song, s.artist, s.mainArtist, s.participants,
      ...s.originalSongNames, ...s.originalArtistNames
    ].join(" ").toLowerCase();
    return hay.includes(q);
  }).slice(0, 40);

  box.innerHTML = hits.length
    ? hits.map(s => `<button type="button" data-key="${encodeURIComponent(s.songId)}"><strong>${esc(s.song)}</strong><span>${esc(s.artist)} / ${s.points.toFixed(1)} pt</span></button>`).join("")
    : '<div class="muted search-empty">該当なし</div>';
}

function updateArtistSearch() {
  const q = $("artistSearch").value.trim().toLowerCase();
  const box = $("artistSearchResults");
  if (!q) {
    box.innerHTML = "";
    return;
  }

  const hits = artistStats
    .filter(a => a.artist.toLowerCase().includes(q))
    .sort((a, b) => b.points - a.points)
    .slice(0, 40);

  box.innerHTML = hits.length
    ? hits.map(a => `<button type="button" data-artist="${encodeURIComponent(a.artist)}"><strong>${esc(a.artist)}</strong><span>${a.points.toFixed(1)} pt / ${a.songs}曲</span></button>`).join("")
    : '<div class="muted search-empty">該当なし</div>';
}

function exportCurrentTable() {
  if (!currentTable.headers.length) return;
  const csv = Papa.unparse([currentTable.headers, ...currentTable.rows]);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentTable.filename || "analysis.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

$("csvFile").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  $("status").textContent = "CSV読み込み中…";
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: result => {
      const missing = A.validateRequiredColumns(result.meta.fields || []);
      if (missing.length) {
        $("status").textContent = `必要な列がありません: ${missing.join(", ")}`;
        return;
      }

      allNormalizedRows = result.data.map(A.normalizeRow);
      allLoadedRows = allNormalizedRows
        .filter(A.isValidAnalysisRow)
        .sort((a, b) => a.week.localeCompare(b.week) || a.rank - b.rank);

      if (!allLoadedRows.length) {
        $("status").textContent = "分析対象=1 の有効なデータがありません。";
        return;
      }

      const weeks = A.getWeeks(allLoadedRows);
      $("startDate").value = weeks[0];
      $("endDate").value = weeks.at(-1);
      $("startDate").min = weeks[0];
      $("startDate").max = weeks.at(-1);
      $("endDate").min = weeks[0];
      $("endDate").max = weeks.at(-1);

      applyDateFilter();
      $("menuCard").hidden = false;
      $("searchCard").hidden = false;
      $("artistScopeCard").hidden = false;

      const excluded = allNormalizedRows.filter(r => !r.analysisTarget).length;
      const invalid = allNormalizedRows.filter(r => r.analysisTarget && !A.isValidAnalysisRow(r)).length;
      $("status").innerHTML = `読み込み完了: <b>${esc(file.name)}</b> / CSV ${allNormalizedRows.length}行 / 分析 ${allLoadedRows.length}行 / 分析対象外 ${excluded}行 / 不正除外 ${invalid}行`;
      showSongRanking("points", "曲別ポイント");
    },
    error: err => {
      $("status").textContent = `CSV読み込みエラー: ${err.message}`;
    }
  });
});

$("applyFilter").addEventListener("click", () => {
  if (!allLoadedRows.length) return;
  if ($("startDate").value && $("endDate").value && $("startDate").value > $("endDate").value) {
    alert("開始週が終了週より後です。");
    return;
  }
  if (applyDateFilter()) showSongRanking("points", "曲別ポイント");
});

$("resetFilter").addEventListener("click", () => {
  if (!allLoadedRows.length) return;
  const w = A.getWeeks(allLoadedRows);
  $("startDate").value = w[0];
  $("endDate").value = w.at(-1);
  applyDateFilter();
  showSongRanking("points", "曲別ポイント");
});

$("pointMode").addEventListener("change", () => {
  if (!rows.length) return;
  rebuild();
  showSummary();
  showSongRanking("points", "曲別ポイント");
});

$("artistScopeMode").addEventListener("change", updateArtistScopeNote);
$("artistCount").addEventListener("input", updateArtistScopeNote);
$("artistPicker").addEventListener("change", updateArtistScopeNote);
$("songSearch").addEventListener("input", updateSongSearch);
$("artistSearch").addEventListener("input", updateArtistSearch);
$("exportTable").addEventListener("click", exportCurrentTable);

$("songSearchResults").addEventListener("click", e => {
  const b = e.target.closest("button[data-key]");
  if (!b) return;
  const key = decodeURIComponent(b.dataset.key);
  const s = songStats.find(x => x.songId === key);
  if (s) showSongDetail(s);
});

$("artistSearchResults").addEventListener("click", e => {
  const b = e.target.closest("button[data-artist]");
  if (!b) return;
  showArtistDetail(decodeURIComponent(b.dataset.artist));
});

document.querySelectorAll("[data-action]").forEach(btn => btn.addEventListener("click", () => {
  const a = btn.dataset.action;

  if (a === "songPoints") showSongRanking("points", "曲別ポイント");
  else if (a === "songWeeks") showSongRanking("weeks", "登場週数");
  else if (a === "songStreak") showSongRanking("streak", "最長連続登場週数");
  else if (a === "songUpperResidence") showSongUpperResidence();
  else if (a === "songNo1") showSongRanking("no1Weeks", "1位獲得週数");
  else if (a === "lateBloomers") showLateBloomers();
  else if (a === "songVolatility") showSongVolatility();
  else if (a === "reentries") showSongRanking("reentries", "再登場回数");
  else if (a === "hitCenter") showHitCenter();

  else if (a === "artistPoints") showArtistRanking("points", "総合ポイント");
  else if (a === "artistSongs") showArtistRanking("songs", "曲数");
  else if (a === "artistChartWeeks") showArtistRanking("chartWeeks", "活動週数");
  else if (a === "artistTop10Songs") showArtistRanking("top10Songs", "TOP10到達曲数");
  else if (a === "artistNo1Songs") showArtistRanking("no1Songs", "1位到達曲数");
  else if (a === "artistTop10Rate") showArtistRanking("top10HitRate", "TOP10ヒット率", { value: x => x.top10HitRate * 100, display: v => `${fmt(v, 2)}%` });
  else if (a === "artistTop10SongWeeks") showArtistRanking("top10SongWeeks", "TOP10延べ曲週");
  else if (a === "artistAvgSongPoints") showArtistRanking("pointsPerSong", "平均曲ポイント", { filter: x => x.songs >= 2 });
  else if (a === "artistWeeklyEfficiency") showArtistRanking("pointsPerChartWeek", "活動週あたりポイント");
  else if (a === "artistSimultaneous") showArtistRanking("maxSimultaneous", "同時ランクイン最大");
  else if (a === "artistDependency") showArtistRanking("bestSongShare", "代表曲依存度", { value: x => x.bestSongShare * 100, filter: x => x.songs >= 2, display: v => `${fmt(v, 2)}%` });

  else if (a === "weeklyArtistPoints") showWeeklyArtistMetric("points");
  else if (a === "weeklyArtistMoving4") showWeeklyArtistMetric("moving4");
  else if (a === "weeklyArtistCumulative") showWeeklyArtistMetric("cumulative");
  else if (a === "weeklyArtistRank") showWeeklyArtistMetric("artistRank");
  else if (a === "weeklyArtistSongs") showWeeklyArtistMetric("songs");
  else if (a === "weeklyArtistTop10Songs") showWeeklyArtistMetric("top10Songs");
  else if (a === "weeklyArtistNo1Songs") showWeeklyArtistMetric("no1Songs");
  else if (a === "weeklyArtistBestRank") showWeeklyArtistMetric("bestRank");

  else if (a === "weeklyMarket") showWeeklyMarket();
  else if (a === "artistConcentration") showArtistConcentration();
  else if (a === "weeklyTurnover") showWeeklyTurnover();

  else if (a === "weeklyNo1") showWeeklyNo1();
  else if (a === "weeklyTop10") showWeeklyTop10();

  else if (a === "quality") showQuality();
  else if (a === "dataAudit") showDataAudit();
  else if (a === "pointCompare") showPointComparison();
}));

"use strict";

const A = window.CDTVAnalysis;
const $ = id => document.getElementById(id);
let allNormalizedRows = [], allLoadedRows = [], rows = [], allWeeks = [], songStats = [], artistStats = [], currentChart = null;
let currentTable = { headers: [], rows: [], filename: "analysis.csv" };

function esc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function fmt(v, d = 2) { return v == null || Number.isNaN(v) ? "" : Number(Number(v).toFixed(d)); }
function pct(v, d = 1) { return v == null || Number.isNaN(v) ? "" : `${(Number(v) * 100).toFixed(d)}%`; }
function pointMode() { return $("pointMode").value; }
function topN() { return Number($("topN").value) || 20; }

function rebuild() {
  allWeeks = A.getWeeks(rows);
  songStats = A.buildSongStats(rows, pointMode());
  artistStats = A.buildArtistStats(rows, pointMode());
  populateArtistPicker();
  updateArtistScopeNote();
}

function applyDateFilter() {
  const start = $("startDate").value, end = $("endDate").value;
  const filtered = allLoadedRows.filter(r => (!start || r.week >= start) && (!end || r.week <= end));
  if (!filtered.length) { alert("指定期間にデータがありません。"); return false; }
  rows = filtered;
  rebuild();
  showSummary();
  return true;
}

function showSummary() {
  if (!rows.length) return;
  $("summaryCard").hidden = false;
  const edge = songStats.filter(s => s.leftCensored || s.rightCensored).length;
  const qualityErrors = A.qualityCheck(allNormalizedRows).length;
  const metrics = [
    ["行数", rows.length], ["ランキング週数", allWeeks.length], ["曲数", songStats.length], ["アーティスト数", artistStats.length],
    ["期間", `${allWeeks[0]}<br>～<br>${allWeeks.at(-1)}`], ["ポイント方式", esc(A.pointLabel(pointMode()))],
    ["品質警告", qualityErrors]
  ];
  $("summary").innerHTML = metrics.map(([n, v]) => `<div class="metric"><div class="metric-name">${n}</div><div class="metric-value" style="${String(v).includes("<br>") ? "font-size:14px" : ""}">${v}</div></div>`).join("");
  $("edgeWarning").innerHTML = `<div class="notice">期間の最初または最後の週に接している曲は <b>${edge}曲</b>。期間外の実績が切れている可能性があります。品質警告は「データ品質チェック」で確認できます。</div>`;
}

function populateArtistPicker() {
  const selected = new Set([...$("artistPicker").selectedOptions].map(o => o.value));
  const sorted = [...artistStats].sort((a, b) => b.points - a.points);
  $("artistPicker").innerHTML = sorted.map(a => `<option value="${esc(a.artist)}" ${selected.has(a.artist) ? "selected" : ""}>${esc(a.artist)} (${a.points.toFixed(1)} pt)</option>`).join("");
  $("artistCount").max = Math.max(1, artistStats.length);
}

function selectedArtists() { return [...$("artistPicker").selectedOptions].map(o => o.value); }
function scopedArtists() { return A.resolveArtistScope(artistStats, $("artistScopeMode").value, $("artistCount").value, selectedArtists()); }
function updateArtistScopeNote() {
  if (!artistStats.length) return;
  const artists = scopedArtists();
  let txt = `現在 ${artists.length} / ${artistStats.length} アーティストを対象にします。`;
  if (artists.length > 30) txt += " 線が非常に多くなります。必要なら対象を絞ってください。";
  $("artistScopeNote").textContent = txt;
  $("artistCount").disabled = $("artistScopeMode").value !== "top";
  $("artistPicker").disabled = $("artistScopeMode").value !== "selected";
}

function setCurrentTable(headers, data, filename) { currentTable = { headers, rows: data, filename }; }
function tableHtml(headers, data) {
  let html = '<div class="table-wrap"><table><thead><tr>' + headers.map(h => `<th>${esc(h)}</th>`).join("") + '</tr></thead><tbody>';
  for (const row of data) html += '<tr>' + row.map((c, i) => `<td class="${i === 0 ? "left" : ""}">${esc(c)}</td>`).join("") + '</tr>';
  return html + '</tbody></table></div>';
}
function clearResultDecorations() { $("resultSummary").innerHTML = ""; $("resultExtra").innerHTML = ""; }
function showTable(headers, data, filename = "analysis.csv") {
  $("resultCard").hidden = false;
  clearResultDecorations();
  setCurrentTable(headers, data, filename);
  $("resultTable").innerHTML = tableHtml(headers, data);
}
function renderSummaryMetrics(metrics) {
  $("resultSummary").innerHTML = metrics.map(([name, value]) => `<div class="metric"><div class="metric-name">${esc(name)}</div><div class="metric-value">${esc(value)}</div></div>`).join("");
}
function renderExtraTable(title, headers, data) {
  $("resultExtra").innerHTML = `<h3>${esc(title)}</h3>${tableHtml(headers, data)}`;
}
function scrollToResult() { $("resultCard").scrollIntoView({ behavior: "smooth", block: "start" }); }

function destroyChart() { if (currentChart) { currentChart.destroy(); currentChart = null; } }
function showBarChart(title, labels, values, label) {
  $("chartCard").hidden = false; $("chartTitle").textContent = title; $("chartWarning").textContent = ""; destroyChart();
  currentChart = new Chart($("chart"), {
    type: "bar", data: { labels, datasets: [{ label, data: values }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
  });
}
function showMultiLineChart(title, labels, series, yTitle, { reverse = false, min = null, max = null } = {}) {
  $("chartCard").hidden = false; $("chartTitle").textContent = title;
  $("chartWarning").textContent = series.length > 30 ? `全${series.length}系列を描画しています。見づらい場合は対象アーティストを絞ってください。` : "";
  destroyChart();
  const y = { beginAtZero: !reverse, reverse, title: { display: true, text: yTitle } };
  if (min != null) y.min = min; if (max != null) y.max = max;
  currentChart = new Chart($("chart"), {
    type: "line",
    data: { labels, datasets: series.map(s => ({ label: s.label, data: s.data, pointRadius: series.length > 20 ? 0 : 2, borderWidth: series.length > 30 ? 1 : 2, tension: .12, spanGaps: false })) },
    options: { responsive: true, maintainAspectRatio: false, animation: series.length > 40 ? false : undefined, interaction: { mode: "nearest", intersect: false }, scales: { y }, plugins: { legend: { display: series.length <= 35, position: "bottom" } } }
  });
}
function hideChart() { destroyChart(); $("chartCard").hidden = true; }

function showSongRanking(key, title, { ascending = false, filter = null, value = x => x[key], valueFormatter = v => fmt(v, 3) } = {}) {
  let data = filter ? songStats.filter(filter) : [...songStats];
  data.sort((a, b) => ascending ? value(a) - value(b) : value(b) - value(a));
  data = data.slice(0, topN());
  $("resultTitle").textContent = `${title} TOP${data.length}`;
  $("resultInfo").textContent = `ポイント方式: ${A.pointLabel(pointMode())}`;
  const table = data.map((s, i) => [i + 1, s.song, s.artist, valueFormatter(value(s)), s.weeks, s.bestRank, (s.leftCensored || s.rightCensored) ? "⚠" : ""]);
  showTable(["順位", "曲名", "アーティスト", title, "登場週", "最高順位", "期間端"], table, `${title}.csv`);
  showBarChart(title, data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(value).reverse(), title);
}

function showSongUpperResidence() {
  const data = [...songStats].sort((a, b) => b.top10Weeks - a.top10Weeks || b.top3Weeks - a.top3Weeks).slice(0, topN());
  $("resultTitle").textContent = `上位滞在 TOP${data.length}`;
  $("resultInfo").textContent = "1位・TOP3・TOP10・TOP20の滞在週数をまとめて比較します。";
  showTable(["順位", "曲名", "アーティスト", "1位週", "TOP3週", "TOP10週", "TOP20週", "登場週", "最高順位"],
    data.map((s, i) => [i + 1, s.song, s.artist, s.no1Weeks, s.top3Weeks, s.top10Weeks, s.top20Weeks, s.weeks, s.bestRank]), "song_upper_residence.csv");
  showBarChart("TOP10滞在週数", data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(s => s.top10Weeks).reverse(), "TOP10週");
}

function showLateBloomers() {
  const data = songStats.filter(s => s.weeks >= 3 && s.debutToBest > 0 && s.weeksToPeak > 0)
    .sort((a, b) => b.lateBloomScore - a.lateBloomScore).slice(0, topN());
  $("resultTitle").textContent = `遅咲き・上昇型 TOP${data.length}`;
  $("resultInfo").textContent = "上昇幅 × log2(1 + 実際のピーク所要週) で評価。圏外期間も時間として数えます。";
  showTable(["順位", "曲名", "アーティスト", "初登場順位", "最高順位", "上昇幅", "ピーク所要週", "遅咲きスコア"],
    data.map((s, i) => [i + 1, s.song, s.artist, s.debutRank, s.bestRank, s.debutToBest, s.weeksToPeak, fmt(s.lateBloomScore, 2)]), "late_bloomers.csv");
  showBarChart("遅咲き・上昇型", data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(s => s.lateBloomScore).reverse(), "スコア");
}

function showSongVolatility() {
  const data = songStats.filter(s => s.weeks >= 5).sort((a, b) => b.avgAbsChange - a.avgAbsChange).slice(0, topN());
  $("resultTitle").textContent = `順位変動度 TOP${data.length}`;
  $("resultInfo").textContent = "連続する実週どうしの順位変動の絶対値平均。単なる順位標準偏差より『毎週どれだけ動くか』を直接測ります。";
  showTable(["順位", "曲名", "アーティスト", "週次平均変動", "順位標準偏差", "最大上昇", "最大下落", "登場週"],
    data.map((s, i) => [i + 1, s.song, s.artist, fmt(s.avgAbsChange, 2), fmt(s.rankStd, 2), s.biggestRise, s.biggestFall, s.weeks]), "song_volatility.csv");
  showBarChart("順位変動度", data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(s => s.avgAbsChange).reverse(), "平均順位変動");
}

function showHitCenter() {
  const data = songStats.filter(s => s.spanWeeks >= 6).sort((a, b) => b.hitCenter - a.hitCenter).slice(0, topN());
  $("resultTitle").textContent = `ヒット重心（後半型） TOP${data.length}`;
  $("resultInfo").textContent = "初登場=0、最終登場=1として各週ポイントの時間的な重心を計算。0.5より大きいほど後半に比重があります。";
  showTable(["順位", "曲名", "アーティスト", "ヒット重心", "期間週", "実登場週", "滞在率", "ピーク所要週"],
    data.map((s, i) => [i + 1, s.song, s.artist, fmt(s.hitCenter, 3), s.spanWeeks, s.weeks, pct(s.occupancyRate), s.weeksToPeak]), "hit_center.csv");
  showBarChart("ヒット重心（後半型）", data.map(s => `${s.song} / ${s.artist}`).reverse(), data.map(s => s.hitCenter).reverse(), "重心");
}

function showArtistRanking(key, title, { ascending = false, filter = null, value = x => x[key], formatter = v => fmt(v, 3) } = {}) {
  let data = filter ? artistStats.filter(filter) : [...artistStats];
  data.sort((a, b) => ascending ? value(a) - value(b) : value(b) - value(a));
  data = data.slice(0, topN());
  $("resultTitle").textContent = `${title} TOP${data.length}`;
  $("resultInfo").textContent = `ポイント方式: ${A.pointLabel(pointMode())}`;
  showTable(["順位", "アーティスト", title, "総合ポイント", "曲数", "登場週", "最高順位", "TOP10到達曲", "1位到達曲", "TOP10延べ曲週", "同時ランクイン最大", "代表曲"],
    data.map((a, i) => [i + 1, a.artist, formatter(value(a)), a.points.toFixed(1), a.songs, a.chartWeeks, a.bestRank, a.top10Songs, a.no1Songs, a.top10SongWeeks, a.maxSimultaneous, a.bestSong]), `${title}.csv`);
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
  const artists = scopedArtists();
  if (!artists.length) { alert("対象アーティストが選択されていません。"); return; }
  const [title, unit, reverse] = weeklyMetricInfo[metric], matrix = A.buildWeeklyArtistMatrix(rows, artists, metric, pointMode());
  $("resultTitle").textContent = `${title}【数値表】`;
  $("resultInfo").textContent = `${artists.length}アーティスト。全系列を省略せず表示します。`;
  showTable(["週", ...artists], matrix.data.map(d => [d.week, ...d.vals.map(v => v == null ? "" : fmt(v, 2))]), `${metric}_weekly_artist.csv`);
  showMultiLineChart(title, matrix.weeks, artists.map((a, i) => ({ label: a, data: matrix.data.map(d => d.vals[i]) })), unit, reverse ? { reverse: true, min: 1, max: 100 } : {});
}

function showArtistConcentration() {
  const data = A.buildArtistConcentration(rows, pointMode());
  $("resultTitle").textContent = "週別アーティスト集中度";
  $("resultInfo").textContent = "主指標は首位シェア・TOP5シェア・実効アーティスト数。HHIとエントロピーは詳細確認用です。";
  showTable(["週", "登場アーティスト数", "首位シェア%", "TOP5シェア%", "実効アーティスト数", "HHI", "エントロピー"],
    data.map(x => [x.week, x.artists, fmt(x.top1, 3), fmt(x.top5, 3), fmt(x.effectiveArtists, 2), fmt(x.hhi, 2), fmt(x.entropy, 4)]), "artist_concentration.csv");
  showMultiLineChart("週別アーティスト集中度", data.map(x => x.week), [
    { label: "首位シェア", data: data.map(x => x.top1) },
    { label: "TOP5シェア", data: data.map(x => x.top5) }
  ], "シェア (%)");
}

function showWeeklyMarket() {
  const data = A.buildWeeklyMarket(rows, pointMode());
  $("resultTitle").textContent = "週別チャート構造";
  $("resultInfo").textContent = "毎週固定になる平均順位・中央値順位・総ポイントは廃止し、実際に変化する市場構造だけを表示します。";
  showTable(["週", "掲載曲数", "登場アーティスト数", "1人あたり掲載曲数", "首位アーティスト", "首位Pt", "首位シェア%", "TOP5シェア%", "実効アーティスト数"],
    data.map(x => [x.week, x.entries, x.artists, fmt(x.avgSongsPerArtist, 3), x.topArtist, fmt(x.topArtistPoints, 2), fmt(x.topArtistShare, 3), fmt(x.top5ArtistShare, 3), fmt(x.effectiveArtists, 2)]), "weekly_market_structure.csv");
  showMultiLineChart("週別 アーティスト数と実効アーティスト数", data.map(x => x.week), [
    { label: "登場アーティスト数", data: data.map(x => x.artists) },
    { label: "実効アーティスト数", data: data.map(x => x.effectiveArtists) }
  ], "アーティスト数");
}

function showWeeklyTurnover() {
  const data = A.buildWeeklyTurnover(rows, allLoadedRows);
  $("resultTitle").textContent = "チャート流動性";
  $("resultInfo").textContent = "新規・再登場・継続を比率化し、前週とのJaccard類似度も表示。期間開始前の履歴も再登場判定に利用します。";
  showTable(["週", "新規", "再登場", "継続", "脱落", "新規率%", "再登場率%", "継続率%", "前週維持率%", "前週類似度(Jaccard)%"],
    data.map(x => [x.week, x.newEntries, x.reentries, x.continuing, x.dropouts, fmt(x.newRate, 2), fmt(x.reentryRate, 2), fmt(x.continuingRate, 2), fmt(x.retentionRate, 2), fmt(x.jaccard, 2)]), "weekly_turnover.csv");
  showMultiLineChart("週別チャート構成率", data.map(x => x.week), [
    { label: "新規率", data: data.map(x => x.newRate) },
    { label: "再登場率", data: data.map(x => x.reentryRate) },
    { label: "継続率", data: data.map(x => x.continuingRate) }
  ], "割合 (%)", { min: 0, max: 100 });
}

function showPointComparison() {
  const data = A.comparePointSystems(rows).slice(0, topN());
  $("resultTitle").textContent = "ポイント方式感度分析";
  $("resultInfo").textContent = "曲分析ではなく、ポイント設計を変えたとき順位がどれだけ動くかを見る検証機能です。";
  showTable(["曲名", "アーティスト", "101-順位方式", "対数方式", "100/順位方式", "3方式平均順位", "最大順位差"],
    data.map(s => [s.song, s.artist, s.linearRank, s.logRank, s.reciprocalRank, fmt(s.avgSystemRank, 2), s.systemSpread]), "point_system_comparison.csv");
  hideChart();
}

function showQuality() {
  const e = A.qualityCheck(allNormalizedRows);
  $("resultTitle").textContent = "データ品質チェック";
  $("resultInfo").textContent = `検出 ${e.length}件。無効行を分析対象から捨てる前の正規化データで検査しています。`;
  showTable(["種類", "週", "内容"], e, "data_quality.csv");
  hideChart();
}
function showWeeklyNo1() {
  const d = A.weeklyTopN(rows, 1);
  $("resultTitle").textContent = "週間1位の変遷"; $("resultInfo").textContent = "チャート履歴です。";
  showTable(["週", "順位", "曲名", "アーティスト"], d.map(x => [x.week, x.rank, x.song, x.artist]), "weekly_no1.csv"); hideChart();
}
function showWeeklyTop10() {
  const d = A.weeklyTopN(rows, 10);
  $("resultTitle").textContent = "週間TOP10一覧"; $("resultInfo").textContent = "分析指標ではなく、各週TOP10の履歴閲覧用です。";
  showTable(["週", "順位", "曲名", "アーティスト"], d.map(x => [x.week, x.rank, x.song, x.artist]), "weekly_top10.csv"); hideChart();
}

function showSongDetail(s) {
  $("resultTitle").textContent = `${s.song} / ${s.artist} 個別分析`;
  $("resultInfo").textContent = "曲の概要・全ランクイン履歴・順位推移を表示します。最大上昇/下落などは個別詳細へ移しました。";
  showTable(["週", "順位", "変動"], s.entries.map(r => [r.week, r.rank, r.raw["変動"] || ""]), `${s.song}_history.csv`);
  renderSummaryMetrics([
    ["総合ポイント", s.points.toFixed(1)], ["登場週", s.weeks], ["期間週", s.spanWeeks], ["滞在率", pct(s.occupancyRate)],
    ["最高順位", `${s.bestRank}位`], ["TOP10週", s.top10Weeks], ["1位週", s.no1Weeks], ["再登場", `${s.reentries}回`],
    ["週次平均変動", fmt(s.avgAbsChange, 2)], ["最大上昇", s.biggestRise], ["最大下落", s.biggestFall], ["ヒット重心", fmt(s.hitCenter, 3)]
  ]);
  const map = new Map(s.entries.map(r => [r.week, r.rank]));
  const first = allWeeks.indexOf(s.firstDate), last = allWeeks.indexOf(s.lastDate), labels = allWeeks.slice(first, last + 1);
  const values = labels.map(w => map.has(w) ? map.get(w) : null);
  showMultiLineChart(`${s.song} / ${s.artist} 順位推移`, labels, [{ label: "順位", data: values }], "順位", { reverse: true, min: 1, max: 100 });
  scrollToResult();
}

function showArtistDetail(artist) {
  const stat = artistStats.find(a => a.artist === artist);
  if (!stat) { alert("現在の期間内に対象アーティストのデータがありません。"); return; }
  const d = A.buildArtistDetail(rows, artist, pointMode());
  const songs = songStats.filter(s => s.mainArtist === artist).sort((a, b) => b.points - a.points);

  $("resultTitle").textContent = `${artist} 個別分析`;
  $("resultInfo").textContent = "総合プロフィール、楽曲別実績、週別推移をまとめて表示します。";
  showTable(["順位", "曲名", "表示アーティスト", "ポイント", "最高順位", "登場週", "TOP10週", "1位週", "滞在率"],
    songs.map((s, i) => [i + 1, s.song, s.artist, fmt(s.points, 2), s.bestRank, s.weeks, s.top10Weeks, s.no1Weeks, pct(s.occupancyRate)]), `${artist}_songs.csv`);

  renderSummaryMetrics([
    ["総合ポイント", stat.points.toFixed(1)], ["ランクイン曲", `${stat.songs}曲`], ["登場週", `${stat.chartWeeks}週`], ["最長活動連続", `${stat.longestActiveStreak}週`],
    ["最高順位", `${stat.bestRank}位`], ["TOP10到達曲", `${stat.top10Songs}曲`], ["1位到達曲", `${stat.no1Songs}曲`], ["TOP10ヒット率", pct(stat.top10HitRate)],
    ["TOP10延べ曲週", stat.top10SongWeeks], ["同時ランクイン最大", `${stat.maxSimultaneous}曲`], ["代表曲", stat.bestSong], ["代表曲依存度", pct(stat.bestSongShare)]
  ]);

  renderExtraTable("週別詳細", ["週", "週間Pt", "4週平均", "累積Pt", "週間アーティスト順位", "ランクイン曲", "TOP10", "1位", "最高順位"],
    d.map(x => [x.week, fmt(x.points, 2), fmt(x.moving4, 2), fmt(x.cumulative, 2), x.artistRank ?? "", x.songs, x.top10, x.no1, x.bestRank ?? ""]));

  showMultiLineChart(`${artist} 週間ポイント`, d.map(x => x.week), [
    { label: "週間ポイント", data: d.map(x => x.points) },
    { label: "4週移動平均", data: d.map(x => x.moving4) }
  ], "ポイント");
  scrollToResult();
}

function updateSongSearch() {
  const q = $("songSearch").value.trim().toLowerCase(), box = $("songSearchResults");
  if (!q) { box.innerHTML = ""; return; }
  const hits = songStats.filter(s => s.song.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)).slice(0, 40);
  box.innerHTML = hits.length ? hits.map(s => `<button type="button" data-key="${encodeURIComponent(s.key)}">${esc(s.song)} / ${esc(s.artist)}</button>`).join("") : '<div class="muted search-empty">該当なし</div>';
}
function updateArtistSearch() {
  const q = $("artistSearch").value.trim().toLowerCase(), box = $("artistSearchResults");
  if (!q) { box.innerHTML = ""; return; }
  const hits = artistStats.filter(a => a.artist.toLowerCase().includes(q)).sort((a, b) => b.points - a.points).slice(0, 40);
  box.innerHTML = hits.length ? hits.map(a => `<button type="button" data-artist="${encodeURIComponent(a.artist)}">${esc(a.artist)} (${a.points.toFixed(1)} pt)</button>`).join("") : '<div class="muted search-empty">該当なし</div>';
}

function exportCurrentTable() {
  if (!currentTable.headers.length) return;
  const csv = Papa.unparse([currentTable.headers, ...currentTable.rows]);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = currentTable.filename || "analysis.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

$("csvFile").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  $("status").textContent = "CSV読み込み中…";
  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    complete: result => {
      const missing = A.validateRequiredColumns(result.meta.fields || []);
      if (missing.length) { $("status").textContent = `必要な列がありません: ${missing.join(", ")}`; return; }
      allNormalizedRows = result.data.map(A.normalizeRow);
      allLoadedRows = allNormalizedRows.filter(r => r.week && r.song && r.artist && Number.isInteger(r.rank) && r.rank >= 1 && r.rank <= 100)
        .sort((a, b) => a.week.localeCompare(b.week) || a.rank - b.rank);
      if (!allLoadedRows.length) { $("status").textContent = "有効なデータがありません。"; return; }
      const weeks = A.getWeeks(allLoadedRows);
      $("startDate").value = weeks[0]; $("endDate").value = weeks.at(-1);
      $("startDate").min = weeks[0]; $("startDate").max = weeks.at(-1); $("endDate").min = weeks[0]; $("endDate").max = weeks.at(-1);
      applyDateFilter();
      $("menuCard").hidden = false; $("searchCard").hidden = false; $("artistScopeCard").hidden = false;
      const errors = A.qualityCheck(allNormalizedRows).length;
      $("status").textContent = `読み込み完了: ${file.name} / 品質警告 ${errors}件`;
      showSongRanking("points", "曲別ポイント");
    },
    error: err => { $("status").textContent = `CSV読み込みエラー: ${err.message}`; }
  });
});

$("applyFilter").addEventListener("click", () => {
  if (!allLoadedRows.length) return;
  if ($("startDate").value && $("endDate").value && $("startDate").value > $("endDate").value) { alert("開始週が終了週より後です。"); return; }
  if (applyDateFilter()) showSongRanking("points", "曲別ポイント");
});
$("resetFilter").addEventListener("click", () => {
  if (!allLoadedRows.length) return;
  const w = A.getWeeks(allLoadedRows); $("startDate").value = w[0]; $("endDate").value = w.at(-1);
  applyDateFilter(); showSongRanking("points", "曲別ポイント");
});
$("pointMode").addEventListener("change", () => { if (!rows.length) return; rebuild(); showSummary(); showSongRanking("points", "曲別ポイント"); });
$("artistScopeMode").addEventListener("change", updateArtistScopeNote);
$("artistCount").addEventListener("input", updateArtistScopeNote);
$("artistPicker").addEventListener("change", updateArtistScopeNote);
$("songSearch").addEventListener("input", updateSongSearch);
$("artistSearch").addEventListener("input", updateArtistSearch);
$("exportTable").addEventListener("click", exportCurrentTable);

// 検索結果はイベント委譲で処理。候補を描き直してもクリック処理が消えない。
$("songSearchResults").addEventListener("click", e => {
  const b = e.target.closest("button[data-key]"); if (!b) return;
  const key = decodeURIComponent(b.dataset.key), s = songStats.find(x => x.key === key);
  if (s) showSongDetail(s);
});
$("artistSearchResults").addEventListener("click", e => {
  const b = e.target.closest("button[data-artist]"); if (!b) return;
  const artist = decodeURIComponent(b.dataset.artist);
  showArtistDetail(artist);
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
  else if (a === "artistChartWeeks") showArtistRanking("chartWeeks", "登場週数");
  else if (a === "artistTop10Songs") showArtistRanking("top10Songs", "TOP10到達曲数");
  else if (a === "artistNo1Songs") showArtistRanking("no1Songs", "1位到達曲数");
  else if (a === "artistTop10Rate") showArtistRanking("top10HitRate", "TOP10ヒット率", { value: x => x.top10HitRate * 100, formatter: v => `${fmt(v, 1)}%` });
  else if (a === "artistTop10SongWeeks") showArtistRanking("top10SongWeeks", "TOP10延べ曲週");
  else if (a === "artistAvgSongPoints") showArtistRanking("pointsPerSong", "平均曲ポイント", { filter: x => x.songs >= 2 });
  else if (a === "artistWeeklyEfficiency") showArtistRanking("pointsPerChartWeek", "活動週あたりポイント");
  else if (a === "artistSimultaneous") showArtistRanking("maxSimultaneous", "同時ランクイン最大");
  else if (a === "artistDependency") showArtistRanking("bestSongShare", "代表曲依存度", { filter: x => x.songs >= 2, value: x => x.bestSongShare * 100, formatter: v => `${fmt(v, 1)}%` });

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
  else if (a === "pointCompare") showPointComparison();
  else if (a === "quality") showQuality();
}));

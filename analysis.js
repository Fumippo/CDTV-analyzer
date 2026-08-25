"use strict";

window.CDTVAnalysis = (() => {
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const median = a => {
    if (!a.length) return 0;
    const b = [...a].sort((x, y) => x - y), m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  };
  const stddev = a => {
    if (!a.length) return 0;
    const m = mean(a);
    return Math.sqrt(mean(a.map(x => (x - m) ** 2)));
  };
  const entropy = shares => shares.reduce((s, p) => p > 0 ? s - p * Math.log(p) : s, 0);

  function point(rank, mode = "log") {
    if (mode === "linear") return 101 - rank;
    if (mode === "reciprocal") return 100 / rank;
    return 1 + 99 * (1 - Math.log10(rank) / 2);
  }

  function pointLabel(mode = "log") {
    if (mode === "linear") return "101-順位";
    if (mode === "reciprocal") return "100/順位";
    return "対数ポイント";
  }

  function normalizeWeek(v) {
    const s = String(v ?? "").trim();
    const m = s.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
    if (!m) return s;
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }

  function normalizeRow(r) {
    const week = normalizeWeek(r["週"]);
    const rankText = String(r["順位"] ?? "").trim();
    const rank = rankText === "" ? NaN : Number(rankText);
    const song = String(r["正規化曲名"] || r["曲名"] || "").trim();
    const artist = String(r["正規化アーティスト"] || r["アーティスト"] || "").trim();
    const mainArtist = String(r["主要アーティスト"] || artist).trim();
    const productId = String(r["商品ID"] || r["曲ID"] || `${artist}||${song}`).trim();
    return { raw: r, week, rank, song, artist, mainArtist, productId };
  }

  function validateRequiredColumns(fields) {
    const required = ["週", "順位", "曲名", "アーティスト"];
    return required.filter(c => !fields.includes(c));
  }

  function getWeeks(rows) {
    return [...new Set(rows.map(r => r.week).filter(Boolean))].sort();
  }

  function weekDate(week) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(week))) return null;
    const [y, m, d] = week.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function weekDistance(a, b) {
    const da = weekDate(a), db = weekDate(b);
    if (!da || !db) return null;
    return (db - da) / 604800000;
  }

  function isAdjacentWeek(a, b) {
    return weekDistance(a, b) === 1;
  }

  function calendarSpan(firstWeek, lastWeek) {
    const d = weekDistance(firstWeek, lastWeek);
    return d == null || d < 0 ? 0 : Math.floor(d) + 1;
  }

  function longestStreak(weeks) {
    const sorted = [...new Set(weeks)].sort();
    if (!sorted.length) return 0;
    let best = 1, cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (isAdjacentWeek(sorted[i - 1], sorted[i])) cur++;
      else cur = 1;
      best = Math.max(best, cur);
    }
    return best;
  }

  function countReentries(weeks, allWeeks) {
    const set = new Set(weeks), index = new Map(allWeeks.map((w, i) => [w, i]));
    const sorted = [...set].sort((a, b) => (index.get(a) ?? Infinity) - (index.get(b) ?? Infinity));
    let n = 0;
    for (let i = 1; i < sorted.length; i++) {
      const a = index.get(sorted[i - 1]), b = index.get(sorted[i]);
      if (Number.isInteger(a) && Number.isInteger(b) && b > a + 1) n++;
    }
    return n;
  }

  function adjacentChanges(items) {
    let rise = 0, fall = 0, reentryRise = 0, reentryFall = 0;
    const consecutiveDiffs = [];
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1], b = items[i];
      const diff = a.rank - b.rank;
      if (isAdjacentWeek(a.week, b.week)) {
        rise = Math.max(rise, diff);
        fall = Math.max(fall, -diff);
        consecutiveDiffs.push(Math.abs(diff));
      } else {
        reentryRise = Math.max(reentryRise, diff);
        reentryFall = Math.max(reentryFall, -diff);
      }
    }
    return { rise, fall, reentryRise, reentryFall, avgAbsChange: mean(consecutiveDiffs) };
  }

  function buildSongStats(rows, mode = "log") {
    const allWeeks = getWeeks(rows), groups = new Map();
    for (const r of rows) {
      const key = `${r.song}\u0000${r.artist}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    const out = [];
    for (const [key, rawItems] of groups) {
      const items = [...rawItems].sort((a, b) => a.week.localeCompare(b.week) || a.rank - b.rank);
      const ranks = items.map(x => x.rank), weeks = items.map(x => x.week);
      const first = items[0], last = items.at(-1), bestRank = Math.min(...ranks);
      const bestIndex = items.findIndex(x => x.rank === bestRank), peak = items[bestIndex];
      const ch = adjacentChanges(items), pts = items.map(x => point(x.rank, mode));
      const totalPoints = pts.reduce((a, b) => a + b, 0);
      const spanWeeks = Math.max(1, calendarSpan(first.week, last.week) || items.length);
      const peakWaitWeeks = Math.max(0, weekDistance(first.week, peak.week) ?? bestIndex);

      let weightedWeek = 0;
      for (let i = 0; i < items.length; i++) {
        const elapsed = Math.max(0, weekDistance(first.week, items[i].week) ?? i);
        weightedWeek += elapsed * pts[i];
      }
      const hitCenter = spanWeeks <= 1 || !totalPoints ? 0.5 : weightedWeek / ((spanWeeks - 1) * totalPoints);
      const occupancyRate = Math.min(1, items.length / spanWeeks);
      const debutToBest = first.rank - bestRank;
      const lateBloomScore = debutToBest > 0 ? debutToBest * Math.log2(1 + peakWaitWeeks) : 0;

      out.push({
        key, song: first.song, artist: first.artist, mainArtist: first.mainArtist,
        entries: items, points: totalPoints, weeks: items.length, spanWeeks,
        occupancyRate, streak: longestStreak(weeks), reentries: countReentries(weeks, allWeeks),
        bestRank, worstRank: Math.max(...ranks), avgRank: mean(ranks), medianRank: median(ranks), rankStd: stddev(ranks),
        avgAbsChange: ch.avgAbsChange,
        no1Weeks: ranks.filter(x => x === 1).length, top3Weeks: ranks.filter(x => x <= 3).length,
        top10Weeks: ranks.filter(x => x <= 10).length, top20Weeks: ranks.filter(x => x <= 20).length,
        firstDate: first.week, lastDate: last.week, debutRank: first.rank, lastRank: last.rank,
        debutToBest, weeksToPeak: peakWaitWeeks, lateBloomScore,
        biggestRise: ch.rise, biggestFall: ch.fall,
        biggestReentryRise: ch.reentryRise, biggestReentryFall: ch.reentryFall,
        hitCenter, pointsPerWeek: items.length ? totalPoints / items.length : 0,
        leftCensored: first.week === allWeeks[0], rightCensored: last.week === allWeeks.at(-1)
      });
    }
    return out;
  }

  function buildArtistStats(rows, mode = "log") {
    const allWeeks = getWeeks(rows), groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.mainArtist)) groups.set(r.mainArtist, []);
      groups.get(r.mainArtist).push(r);
    }

    const out = [];
    for (const [artist, items] of groups) {
      const ranks = items.map(x => x.rank), weeks = [...new Set(items.map(x => x.week))].sort();
      const byWeek = new Map(), bySong = new Map();
      for (const r of items) {
        if (!byWeek.has(r.week)) byWeek.set(r.week, []);
        byWeek.get(r.week).push(r);
        const sk = `${r.song}\u0000${r.artist}`;
        if (!bySong.has(sk)) bySong.set(sk, []);
        bySong.get(sk).push(r);
      }

      let maxSimultaneous = 0, maxTop10Simultaneous = 0, maxTop20Simultaneous = 0;
      for (const wr of byWeek.values()) {
        maxSimultaneous = Math.max(maxSimultaneous, wr.length);
        maxTop10Simultaneous = Math.max(maxTop10Simultaneous, wr.filter(x => x.rank <= 10).length);
        maxTop20Simultaneous = Math.max(maxTop20Simultaneous, wr.filter(x => x.rank <= 20).length);
      }

      const songRows = [...bySong.entries()].map(([key, sr]) => {
        const points = sr.reduce((s, x) => s + point(x.rank, mode), 0);
        const rr = sr.map(x => x.rank);
        return { key, song: sr[0].song, displayArtist: sr[0].artist, points, bestRank: Math.min(...rr), weeks: sr.length };
      }).sort((a, b) => b.points - a.points);

      const points = songRows.reduce((s, x) => s + x.points, 0);
      const top10Songs = songRows.filter(s => s.bestRank <= 10).length;
      const top20Songs = songRows.filter(s => s.bestRank <= 20).length;
      const no1Songs = songRows.filter(s => s.bestRank === 1).length;
      const bestSongPoints = songRows[0]?.points || 0;
      const top3CatalogPoints = songRows.slice(0, 3).reduce((s, x) => s + x.points, 0);
      const spanWeeks = weeks.length ? Math.max(1, calendarSpan(weeks[0], weeks.at(-1)) || weeks.length) : 0;

      out.push({
        artist, points, songs: songRows.length, chartWeeks: weeks.length, spanWeeks,
        activityRate: spanWeeks ? weeks.length / spanWeeks : 0,
        longestActiveStreak: longestStreak(weeks), songWeeks: items.length,
        bestRank: Math.min(...ranks), avgRank: mean(ranks), medianRank: median(ranks), rankStd: stddev(ranks),
        no1SongWeeks: ranks.filter(x => x === 1).length, top10SongWeeks: ranks.filter(x => x <= 10).length,
        top20SongWeeks: ranks.filter(x => x <= 20).length,
        no1Songs, top10Songs, top20Songs,
        top10HitRate: songRows.length ? top10Songs / songRows.length : 0,
        no1HitRate: songRows.length ? no1Songs / songRows.length : 0,
        maxSimultaneous, maxTop10Simultaneous, maxTop20Simultaneous,
        bestSong: songRows[0]?.song || "", bestSongPoints,
        bestSongShare: points ? bestSongPoints / points : 0,
        top3CatalogShare: points ? top3CatalogPoints / points : 0,
        pointsPerSong: songRows.length ? points / songRows.length : 0,
        pointsPerChartWeek: weeks.length ? points / weeks.length : 0,
        songRows
      });
    }
    return out;
  }

  function resolveArtistScope(artistStats, mode = "top", count = 10, selected = []) {
    const sorted = [...artistStats].sort((a, b) => b.points - a.points).map(a => a.artist);
    if (mode === "all") return sorted;
    if (mode === "selected") {
      const set = new Set(selected);
      return sorted.filter(a => set.has(a));
    }
    return sorted.slice(0, Math.max(1, Math.min(Number(count) || 10, sorted.length)));
  }

  function buildWeeklyArtistMatrix(rows, artists, metric, mode = "log") {
    const weeks = getWeeks(rows), artistSet = new Set(artists);
    const byWeekArtist = new Map(), totalPoints = new Map(), allArtistPointsByWeek = new Map();

    for (const week of weeks) {
      byWeekArtist.set(week, new Map());
      allArtistPointsByWeek.set(week, new Map());
      totalPoints.set(week, 0);
    }

    for (const r of rows) {
      const p = point(r.rank, mode);
      totalPoints.set(r.week, (totalPoints.get(r.week) || 0) + p);
      const allMap = allArtistPointsByWeek.get(r.week);
      allMap.set(r.mainArtist, (allMap.get(r.mainArtist) || 0) + p);
      if (!artistSet.has(r.mainArtist)) continue;
      const wm = byWeekArtist.get(r.week);
      if (!wm.has(r.mainArtist)) wm.set(r.mainArtist, []);
      wm.get(r.mainArtist).push(r);
    }

    const rankByWeek = new Map();
    for (const week of weeks) {
      const sorted = [...allArtistPointsByWeek.get(week).entries()].sort((a, b) => b[1] - a[1]);
      rankByWeek.set(week, new Map(sorted.map(([a], i) => [a, i + 1])));
    }

    const cumulative = new Map(artists.map(a => [a, 0]));
    const recentPoints = new Map(artists.map(a => [a, []]));
    const data = [];

    for (const week of weeks) {
      const vals = [];
      for (const artist of artists) {
        const wr = byWeekArtist.get(week).get(artist) || [];
        const ownPoints = wr.reduce((s, r) => s + point(r.rank, mode), 0);
        recentPoints.get(artist).push(ownPoints);
        if (recentPoints.get(artist).length > 4) recentPoints.get(artist).shift();

        let v = 0;
        if (metric === "points") v = ownPoints;
        else if (metric === "moving4") v = mean(recentPoints.get(artist));
        else if (metric === "cumulative") {
          cumulative.set(artist, cumulative.get(artist) + ownPoints);
          v = cumulative.get(artist);
        }
        else if (metric === "share") v = totalPoints.get(week) ? ownPoints / totalPoints.get(week) * 100 : 0;
        else if (metric === "artistRank") v = rankByWeek.get(week).get(artist) ?? null;
        else if (metric === "songs") v = wr.length;
        else if (metric === "top10Songs") v = wr.filter(r => r.rank <= 10).length;
        else if (metric === "top20Songs") v = wr.filter(r => r.rank <= 20).length;
        else if (metric === "no1Songs") v = wr.filter(r => r.rank === 1).length;
        else if (metric === "bestRank") v = wr.length ? Math.min(...wr.map(r => r.rank)) : null;
        else if (metric === "avgRank") v = wr.length ? mean(wr.map(r => r.rank)) : null;
        else if (metric === "medianRank") v = wr.length ? median(wr.map(r => r.rank)) : null;
        vals.push(v);
      }
      data.push({ week, vals });
    }
    return { artists, weeks, data };
  }

  function buildArtistDetail(rows, artist, mode = "log") {
    const weeks = getWeeks(rows), out = [], cumulative = 0, recent = [];
    const byWeekAllPoints = new Map();
    const byWeekArtistPoints = new Map();

    for (const week of weeks) {
      const wr = rows.filter(r => r.week === week);
      const amap = new Map();
      for (const r of wr) amap.set(r.mainArtist, (amap.get(r.mainArtist) || 0) + point(r.rank, mode));
      byWeekAllPoints.set(week, [...amap.values()].reduce((a, b) => a + b, 0));
      byWeekArtistPoints.set(week, amap);
    }

    for (const week of weeks) {
      const wr = rows.filter(r => r.week === week && r.mainArtist === artist);
      const points = wr.reduce((s, r) => s + point(r.rank, mode), 0);
      cumulative += points;
      recent.push(points); if (recent.length > 4) recent.shift();
      const ranking = [...byWeekArtistPoints.get(week).entries()].sort((a, b) => b[1] - a[1]);
      const artistRank = ranking.findIndex(([a]) => a === artist);
      const total = byWeekAllPoints.get(week) || 0;
      out.push({
        week, points, share: total ? points / total * 100 : 0, moving4: mean(recent), cumulative,
        artistRank: artistRank >= 0 ? artistRank + 1 : null,
        songs: wr.length, top10: wr.filter(r => r.rank <= 10).length,
        top20: wr.filter(r => r.rank <= 20).length, no1: wr.filter(r => r.rank === 1).length,
        bestRank: wr.length ? Math.min(...wr.map(r => r.rank)) : null,
        avgRank: wr.length ? mean(wr.map(r => r.rank)) : null,
        medianRank: wr.length ? median(wr.map(r => r.rank)) : null
      });
    }
    return out;
  }

  function buildArtistConcentration(rows, mode = "log") {
    const out = [];
    for (const week of getWeeks(rows)) {
      const map = new Map();
      for (const r of rows.filter(x => x.week === week)) {
        map.set(r.mainArtist, (map.get(r.mainArtist) || 0) + point(r.rank, mode));
      }
      const vals = [...map.values()].sort((a, b) => b - a), total = vals.reduce((a, b) => a + b, 0);
      const shares = vals.map(v => total ? v / total : 0), pct = k => shares.slice(0, k).reduce((a, b) => a + b, 0) * 100;
      const hhi = shares.reduce((s, p) => s + (p * 100) ** 2, 0);
      out.push({
        week, artists: map.size, top1: pct(1), top3: pct(3), top5: pct(5), top10: pct(10), hhi,
        effectiveArtists: hhi ? 10000 / hhi : 0, entropy: entropy(shares)
      });
    }
    return out;
  }

  function buildWeeklyMarket(rows, mode = "log") {
    const concentration = new Map(buildArtistConcentration(rows, mode).map(x => [x.week, x]));
    const out = [];
    for (const week of getWeeks(rows)) {
      const wr = rows.filter(r => r.week === week), artists = buildArtistStats(wr, mode).sort((a, b) => b.points - a.points);
      const c = concentration.get(week);
      out.push({
        week, entries: wr.length, artists: c?.artists || 0,
        avgSongsPerArtist: c?.artists ? wr.length / c.artists : 0,
        topArtist: artists[0]?.artist || "", topArtistPoints: artists[0]?.points || 0,
        topArtistShare: c?.top1 || 0, top5ArtistShare: c?.top5 || 0,
        effectiveArtists: c?.effectiveArtists || 0
      });
    }
    return out;
  }

  function songKey(r) { return `${r.song}\u0000${r.artist}`; }

  function buildWeeklyTurnover(rows, historyRows = rows) {
    const weeks = getWeeks(rows), historyWeeks = getWeeks(historyRows), out = [];
    if (!weeks.length) return out;
    const firstWeek = weeks[0];
    const previousWeeks = historyWeeks.filter(w => w < firstWeek);
    const prevWeek = previousWeeks.at(-1) || null;
    let prev = prevWeek ? new Set(historyRows.filter(r => r.week === prevWeek).map(songKey)) : new Set();
    const ever = new Set(historyRows.filter(r => r.week < firstWeek).map(songKey));

    for (const week of weeks) {
      const current = new Set(rows.filter(r => r.week === week).map(songKey));
      let newEntries = 0, reentries = 0, continuing = 0;
      for (const k of current) {
        if (prev.has(k)) continuing++;
        else if (ever.has(k)) reentries++;
        else newEntries++;
      }
      let dropouts = 0;
      for (const k of prev) if (!current.has(k)) dropouts++;
      const union = new Set([...prev, ...current]);
      const jaccard = prev.size ? continuing / union.size : null;
      out.push({
        week, newEntries, reentries, dropouts, continuing,
        newRate: current.size ? newEntries / current.size * 100 : 0,
        reentryRate: current.size ? reentries / current.size * 100 : 0,
        continuingRate: current.size ? continuing / current.size * 100 : 0,
        retentionRate: prev.size ? continuing / prev.size * 100 : null,
        jaccard: jaccard == null ? null : jaccard * 100
      });
      for (const k of current) ever.add(k);
      prev = current;
    }
    return out;
  }

  function weeklyTopN(rows, n = 10) {
    const out = [];
    for (const week of getWeeks(rows)) {
      for (const r of rows.filter(x => x.week === week && x.rank <= n).sort((a, b) => a.rank - b.rank)) {
        out.push({ week, rank: r.rank, song: r.song, artist: r.artist });
      }
    }
    return out;
  }

  function qualityCheck(rows) {
    const errors = [], byWeek = new Map();
    for (const r of rows) {
      if (!byWeek.has(r.week || "(日付なし)")) byWeek.set(r.week || "(日付なし)", []);
      byWeek.get(r.week || "(日付なし)").push(r);
      if (!Number.isInteger(r.rank) || r.rank < 1 || r.rank > 100) {
        errors.push(["順位不正", r.week || "(日付なし)", `${r.song || "(曲名なし)"} / ${r.artist || "(アーティストなし)"}: ${String(r.raw?.["順位"] ?? "")}`]);
      }
      if (!r.song || !r.artist || !r.week) errors.push(["必須値欠落", r.week || "(日付なし)", `${r.song || "(曲名なし)"} / ${r.artist || "(アーティストなし)"}`]);
      if (r.week && !weekDate(r.week)) errors.push(["週形式不正", r.week, "YYYY-MM-DDとして解釈できません"]);
    }

    for (const [week, items] of byWeek) {
      if (week === "(日付なし)") continue;
      const validItems = items.filter(r => Number.isInteger(r.rank) && r.rank >= 1 && r.rank <= 100);
      const rankCount = new Map(), songSeen = new Set();
      for (const r of validItems) {
        rankCount.set(r.rank, (rankCount.get(r.rank) || 0) + 1);
        const sk = songKey(r);
        if (songSeen.has(sk)) errors.push(["同一曲週重複", week, `${r.song} / ${r.artist}`]);
        songSeen.add(sk);
      }
      for (const [rank, count] of rankCount) if (count > 1) errors.push(["順位重複", week, `${rank}位が${count}件`]);
      const valid = new Set(validItems.map(r => r.rank)), missing = [];
      for (let rank = 1; rank <= 100; rank++) if (!valid.has(rank)) missing.push(rank);
      if (missing.length) errors.push(["欠落順位", week, missing.join(", ")]);
      if (validItems.length !== 100) errors.push(["週の件数異常", week, `${validItems.length}件（期待値100件）`]);
    }

    const weeks = getWeeks(rows.filter(r => r.week && weekDate(r.week)));
    for (let i = 1; i < weeks.length; i++) {
      const d = weekDistance(weeks[i - 1], weeks[i]);
      if (d !== 1) {
        const detail = d != null && d > 1 ? `${d - 1}週分の欠落の可能性` : `週間隔=${String(d)}`;
        errors.push(["週欠落/間隔異常", weeks[i], `${weeks[i - 1]} → ${weeks[i]} (${detail})`]);
      }
    }
    return errors;
  }

  function comparePointSystems(rows) {
    const modes = ["linear", "log", "reciprocal"], stats = {};
    for (const m of modes) stats[m] = buildSongStats(rows, m).sort((a, b) => b.points - a.points);
    const maps = {};
    for (const m of modes) maps[m] = new Map(stats[m].map((s, i) => [s.key, i + 1]));
    return stats.log.map(s => {
      const r1 = maps.linear.get(s.key), r2 = maps.log.get(s.key), r3 = maps.reciprocal.get(s.key);
      return {
        ...s, linearRank: r1, logRank: r2, reciprocalRank: r3,
        avgSystemRank: mean([r1, r2, r3]), systemSpread: Math.max(r1, r2, r3) - Math.min(r1, r2, r3)
      };
    }).sort((a, b) => a.avgSystemRank - b.avgSystemRank);
  }

  return {
    mean, median, stddev, point, pointLabel, normalizeWeek, normalizeRow, validateRequiredColumns,
    getWeeks, weekDistance, isAdjacentWeek, buildSongStats, buildArtistStats, resolveArtistScope,
    buildWeeklyArtistMatrix, buildArtistDetail, buildArtistConcentration, buildWeeklyMarket,
    buildWeeklyTurnover, weeklyTopN, qualityCheck, comparePointSystems
  };
})();


  return {
    mean,median,stddev,point,pointLabel,normalizeRow,validateRequiredColumns,getWeeks,
    buildSongStats,buildArtistStats,resolveArtistScope,buildWeeklyArtistMatrix,buildArtistDetail,
    buildArtistConcentration,buildSongConcentration,buildWeeklyMarket,buildWeeklyTurnover,weeklyTopN,
    qualityCheck,comparePointSystems
  };
})();

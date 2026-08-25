"use strict";

window.CDTVAnalysis = (() => {
  const DAY_MS = 86400000;
  const WEEK_MS = 7 * DAY_MS;

  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const median = a => {
    if (!a.length) return 0;
    const b = [...a].sort((x, y) => x - y);
    const m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  };
  const stddev = a => {
    if (!a.length) return 0;
    const m = mean(a);
    return Math.sqrt(mean(a.map(x => (x - m) ** 2)));
  };
  const entropy = shares => shares.reduce((s, p) => p > 0 ? s - p * Math.log(p) : s, 0);
  const uniq = a => [...new Set(a.filter(v => v !== "" && v != null))];
  const text = v => String(v ?? "").trim();

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
    const s = text(v);
    const m = s.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
    if (!m) return s;
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }

  function parseTarget(v) {
    const s = text(v).toLowerCase();
    if (s === "") return true;
    if (["0", "false", "no", "n", "除外", "対象外"].includes(s)) return false;
    return true;
  }

  function parseOptionalInt(v) {
    const s = text(v);
    if (!s) return null;
    const n = Number.parseInt(s, 10);
    return Number.isInteger(n) ? n : null;
  }

  function normalizeRow(r) {
    const week = normalizeWeek(r["週"]);
    const rankText = text(r["順位"]);
    const rank = rankText === "" ? NaN : Number(rankText);

    const originalSong = text(r["原文曲名"] || r["曲名"]);
    const originalArtist = text(r["原文アーティスト"] || r["アーティスト"]);
    const song = text(r["正規化曲名"] || r["曲名"] || r["原文曲名"]);
    const artist = text(r["正規化アーティスト"] || r["アーティスト"] || r["原文アーティスト"]);
    const mainArtist = text(r["主要アーティスト"] || artist);
    const participants = text(r["参加アーティスト"]);
    const songId = text(r["曲ID"] || r["商品ID"] || `${artist}||${song}`);
    const mainArtistSongId = text(r["主要アーティスト曲ID"] || `${mainArtist}||${song}`);

    return {
      raw: r,
      type: text(r["種別"]),
      week,
      rank,
      sourceChange: text(r["変動_ソース"] || r["変動"]),
      originalSong,
      originalArtist,
      song,
      artist,
      mainArtist,
      participants,
      songId,
      mainArtistSongId,
      normalizationStatus: text(r["正規化状態"]),
      previousRank: parseOptionalInt(r["前週順位"]),
      actualChange: text(r["実変動"]),
      arrowConsistency: text(r["矢印整合"]),
      source: text(r["データ由来"]),
      correctionNote: text(r["補正メモ"]),
      analysisTarget: parseTarget(r["分析対象"]),
      qaFlag: text(r["QAフラグ"])
    };
  }

  function validateRequiredColumns(fields) {
    const missing = [];
    if (!fields.includes("週")) missing.push("週");
    if (!fields.includes("順位")) missing.push("順位");
    if (!fields.some(c => ["曲名", "正規化曲名", "原文曲名"].includes(c))) missing.push("曲名系");
    if (!fields.some(c => ["アーティスト", "正規化アーティスト", "原文アーティスト"].includes(c))) missing.push("アーティスト系");
    return missing;
  }

  function isValidAnalysisRow(r) {
    return r.analysisTarget &&
      !!r.week &&
      Number.isInteger(r.rank) &&
      r.rank >= 1 && r.rank <= 100 &&
      !!r.song && !!r.artist && !!r.songId;
  }

  function getWeeks(rows) {
    return uniq(rows.map(r => r.week)).sort();
  }

  function weekDate(week) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(week))) return null;
    const [y, m, d] = week.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (Number.isNaN(date.getTime())) return null;
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return date;
  }

  function weekDistance(a, b) {
    const da = weekDate(a), db = weekDate(b);
    if (!da || !db) return null;
    return (db - da) / WEEK_MS;
  }

  function isAdjacentWeek(a, b) {
    return weekDistance(a, b) === 1;
  }

  function calendarSpan(firstWeek, lastWeek) {
    const d = weekDistance(firstWeek, lastWeek);
    return d == null || d < 0 ? 0 : Math.floor(d) + 1;
  }

  function longestStreak(weeks) {
    const sorted = uniq(weeks).sort();
    if (!sorted.length) return 0;
    let best = 1, cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (isAdjacentWeek(sorted[i - 1], sorted[i])) cur++;
      else cur = 1;
      best = Math.max(best, cur);
    }
    return best;
  }

  function countReentries(weeks) {
    const sorted = uniq(weeks).sort();
    let n = 0;
    for (let i = 1; i < sorted.length; i++) {
      const d = weekDistance(sorted[i - 1], sorted[i]);
      if (d != null && d > 1) n++;
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
    return {
      rise, fall, reentryRise, reentryFall,
      avgAbsChange: mean(consecutiveDiffs),
      changeSamples: consecutiveDiffs.length
    };
  }

  function groupBySongId(rows) {
    const groups = new Map();
    for (const r of rows) {
      const key = r.songId || `${r.artist}\u0000${r.song}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    return groups;
  }

  function buildSongStats(rows, mode = "log", fullRows = rows) {
    const periodWeeks = getWeeks(rows);
    const fullWeeks = getWeeks(fullRows);
    const periodFirst = periodWeeks[0] || "";
    const periodLast = periodWeeks.at(-1) || "";
    const fullFirstWeek = fullWeeks[0] || "";
    const fullLastWeek = fullWeeks.at(-1) || "";

    const groups = groupBySongId(rows);
    const fullGroups = groupBySongId(fullRows);
    const out = [];

    for (const [key, rawItems] of groups) {
      const items = [...rawItems].sort((a, b) => a.week.localeCompare(b.week) || a.rank - b.rank);
      const ranks = items.map(x => x.rank);
      const weeks = items.map(x => x.week);
      const first = items[0], last = items.at(-1);
      const bestRank = Math.min(...ranks);
      const bestIndex = items.findIndex(x => x.rank === bestRank);
      const peak = items[bestIndex];
      const ch = adjacentChanges(items);
      const pts = items.map(x => point(x.rank, mode));
      const totalPoints = pts.reduce((a, b) => a + b, 0);
      const spanWeeks = Math.max(1, calendarSpan(first.week, last.week) || items.length);
      const peakWaitWeeks = Math.max(0, weekDistance(first.week, peak.week) ?? bestIndex);

      let weightedWeek = 0;
      for (let i = 0; i < items.length; i++) {
        const elapsed = Math.max(0, weekDistance(first.week, items[i].week) ?? i);
        weightedWeek += elapsed * pts[i];
      }
      const hitCenter = spanWeeks <= 1 || !totalPoints
        ? 0.5
        : weightedWeek / ((spanWeeks - 1) * totalPoints);

      const occupancyRate = Math.min(1, items.length / spanWeeks);
      const debutToBest = first.rank - bestRank;
      const lateBloomScore = debutToBest > 0 ? debutToBest * Math.log2(1 + peakWaitWeeks) : 0;

      const fullItems = [...(fullGroups.get(key) || items)].sort((a, b) => a.week.localeCompare(b.week));
      const fullSongFirst = fullItems[0]?.week || first.week;
      const fullSongLast = fullItems.at(-1)?.week || last.week;
      const leftCensored = (periodFirst && fullSongFirst < periodFirst) || (periodFirst && periodFirst === fullFirstWeek && first.week === periodFirst);
      const rightCensored = (periodLast && fullSongLast > periodLast) || (periodLast && periodLast === fullLastWeek && last.week === periodLast);

      const sources = uniq(items.map(x => x.source));
      const normalizationStates = uniq(items.map(x => x.normalizationStatus));
      const originalSongNames = uniq(items.map(x => x.originalSong));
      const originalArtistNames = uniq(items.map(x => x.originalArtist));
      const qaCount = items.filter(x => isQaFlagged(x.qaFlag)).length;
      const correctionCount = items.filter(x => x.correctionNote).length;

      out.push({
        key,
        songId: key,
        mainArtistSongId: first.mainArtistSongId,
        song: first.song,
        artist: first.artist,
        mainArtist: first.mainArtist,
        participants: first.participants,
        entries: items,
        points: totalPoints,
        weeks: items.length,
        spanWeeks,
        occupancyRate,
        streak: longestStreak(weeks),
        reentries: countReentries(weeks),
        bestRank,
        worstRank: Math.max(...ranks),
        avgRank: mean(ranks),
        medianRank: median(ranks),
        rankStd: stddev(ranks),
        avgAbsChange: ch.avgAbsChange,
        changeSamples: ch.changeSamples,
        no1Weeks: ranks.filter(x => x === 1).length,
        top3Weeks: ranks.filter(x => x <= 3).length,
        top10Weeks: ranks.filter(x => x <= 10).length,
        top20Weeks: ranks.filter(x => x <= 20).length,
        firstDate: first.week,
        lastDate: last.week,
        debutRank: first.rank,
        lastRank: last.rank,
        debutToBest,
        weeksToPeak: peakWaitWeeks,
        lateBloomScore,
        biggestRise: ch.rise,
        biggestFall: ch.fall,
        biggestReentryRise: ch.reentryRise,
        biggestReentryFall: ch.reentryFall,
        hitCenter,
        pointsPerWeek: items.length ? totalPoints / items.length : 0,
        leftCensored,
        rightCensored,
        sources,
        normalizationStates,
        originalSongNames,
        originalArtistNames,
        qaCount,
        correctionCount
      });
    }
    return out;
  }

  function buildArtistStats(rows, mode = "log") {
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.mainArtist)) groups.set(r.mainArtist, []);
      groups.get(r.mainArtist).push(r);
    }

    const out = [];
    for (const [artist, items] of groups) {
      const ranks = items.map(x => x.rank);
      const weeks = uniq(items.map(x => x.week)).sort();
      const byWeek = new Map();
      const bySong = new Map();

      for (const r of items) {
        if (!byWeek.has(r.week)) byWeek.set(r.week, []);
        byWeek.get(r.week).push(r);

        const sk = r.mainArtistSongId || `${r.mainArtist}\u0000${r.song}`;
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
        const sorted = [...sr].sort((a, b) => a.week.localeCompare(b.week));
        const rr = sr.map(x => x.rank);
        const points = sr.reduce((s, x) => s + point(x.rank, mode), 0);
        return {
          key,
          songId: sr[0].songId,
          song: sr[0].song,
          displayArtist: sr[0].artist,
          points,
          bestRank: Math.min(...rr),
          weeks: sr.length,
          top10Weeks: rr.filter(x => x <= 10).length,
          no1Weeks: rr.filter(x => x === 1).length,
          firstDate: sorted[0]?.week || "",
          lastDate: sorted.at(-1)?.week || ""
        };
      }).sort((a, b) => b.points - a.points);

      const points = songRows.reduce((s, x) => s + x.points, 0);
      const top10Songs = songRows.filter(s => s.bestRank <= 10).length;
      const top20Songs = songRows.filter(s => s.bestRank <= 20).length;
      const no1Songs = songRows.filter(s => s.bestRank === 1).length;
      const bestSongPoints = songRows[0]?.points || 0;
      const top3CatalogPoints = songRows.slice(0, 3).reduce((s, x) => s + x.points, 0);
      const spanWeeks = weeks.length ? Math.max(1, calendarSpan(weeks[0], weeks.at(-1)) || weeks.length) : 0;

      out.push({
        artist,
        points,
        songs: songRows.length,
        chartWeeks: weeks.length,
        spanWeeks,
        activityRate: spanWeeks ? weeks.length / spanWeeks : 0,
        longestActiveStreak: longestStreak(weeks),
        songWeeks: items.length,
        bestRank: ranks.length ? Math.min(...ranks) : null,
        avgRank: mean(ranks),
        medianRank: median(ranks),
        rankStd: stddev(ranks),
        no1SongWeeks: ranks.filter(x => x === 1).length,
        top10SongWeeks: ranks.filter(x => x <= 10).length,
        top20SongWeeks: ranks.filter(x => x <= 20).length,
        no1Songs,
        top10Songs,
        top20Songs,
        top10HitRate: songRows.length ? top10Songs / songRows.length : 0,
        no1HitRate: songRows.length ? no1Songs / songRows.length : 0,
        maxSimultaneous,
        maxTop10Simultaneous,
        maxTop20Simultaneous,
        bestSong: songRows[0]?.song || "",
        bestSongPoints,
        bestSongShare: points ? bestSongPoints / points : 0,
        top3CatalogShare: points ? top3CatalogPoints / points : 0,
        pointsPerSong: songRows.length ? points / songRows.length : 0,
        pointsPerChartWeek: weeks.length ? points / weeks.length : 0,
        sources: uniq(items.map(x => x.source)),
        qaCount: items.filter(x => isQaFlagged(x.qaFlag)).length,
        correctionCount: items.filter(x => x.correctionNote).length,
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
    const weeks = getWeeks(rows);
    const artistSet = new Set(artists);
    const weeklyArtistRows = new Map();
    const weeklyArtistPoints = new Map();
    const allWeeklyPoints = new Map();

    for (const r of rows) {
      const key = `${r.week}\u0000${r.mainArtist}`;
      if (!weeklyArtistRows.has(key)) weeklyArtistRows.set(key, []);
      weeklyArtistRows.get(key).push(r);
      weeklyArtistPoints.set(key, (weeklyArtistPoints.get(key) || 0) + point(r.rank, mode));

      if (!allWeeklyPoints.has(r.week)) allWeeklyPoints.set(r.week, new Map());
      const wm = allWeeklyPoints.get(r.week);
      wm.set(r.mainArtist, (wm.get(r.mainArtist) || 0) + point(r.rank, mode));
    }

    const weeklyRanks = new Map();
    for (const week of weeks) {
      const sorted = [...(allWeeklyPoints.get(week) || new Map()).entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
      weeklyRanks.set(week, new Map(sorted.map(([a], i) => [a, i + 1])));
    }

    const rolling = new Map(artists.map(a => [a, []]));
    const cumulative = new Map(artists.map(a => [a, 0]));
    const data = [];

    for (const week of weeks) {
      const vals = [];
      for (const artist of artists) {
        const key = `${week}\u0000${artist}`;
        const wr = weeklyArtistRows.get(key) || [];
        const p = weeklyArtistPoints.get(key) || 0;

        const arr = rolling.get(artist);
        arr.push(p);
        if (arr.length > 4) arr.shift();

        let v = 0;
        if (metric === "points") v = p;
        else if (metric === "moving4") v = mean(arr);
        else if (metric === "cumulative") {
          cumulative.set(artist, cumulative.get(artist) + p);
          v = cumulative.get(artist);
        }
        else if (metric === "artistRank") v = weeklyRanks.get(week)?.get(artist) ?? null;
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
    const matrixMetrics = ["points", "moving4", "cumulative", "artistRank", "songs", "top10Songs", "top20Songs", "no1Songs", "bestRank", "avgRank", "medianRank"];
    const matrices = Object.fromEntries(matrixMetrics.map(m => [m, buildWeeklyArtistMatrix(rows, [artist], m, mode)]));
    const weeks = getWeeks(rows);

    return weeks.map((week, i) => ({
      week,
      points: matrices.points.data[i]?.vals[0] ?? 0,
      moving4: matrices.moving4.data[i]?.vals[0] ?? 0,
      cumulative: matrices.cumulative.data[i]?.vals[0] ?? 0,
      artistRank: matrices.artistRank.data[i]?.vals[0] ?? null,
      songs: matrices.songs.data[i]?.vals[0] ?? 0,
      top10: matrices.top10Songs.data[i]?.vals[0] ?? 0,
      top20: matrices.top20Songs.data[i]?.vals[0] ?? 0,
      no1: matrices.no1Songs.data[i]?.vals[0] ?? 0,
      bestRank: matrices.bestRank.data[i]?.vals[0] ?? null,
      avgRank: matrices.avgRank.data[i]?.vals[0] ?? null,
      medianRank: matrices.medianRank.data[i]?.vals[0] ?? null
    }));
  }

  function buildArtistConcentration(rows, mode = "log") {
    const out = [];
    for (const week of getWeeks(rows)) {
      const map = new Map();
      for (const r of rows.filter(x => x.week === week)) {
        map.set(r.mainArtist, (map.get(r.mainArtist) || 0) + point(r.rank, mode));
      }
      const vals = [...map.values()].sort((a, b) => b - a);
      const total = vals.reduce((a, b) => a + b, 0);
      const shares = vals.map(v => total ? v / total : 0);
      const pct = k => shares.slice(0, k).reduce((a, b) => a + b, 0) * 100;
      const hhi = shares.reduce((s, p) => s + (p * 100) ** 2, 0);

      out.push({
        week,
        artists: map.size,
        top1: pct(1),
        top3: pct(3),
        top5: pct(5),
        top10: pct(10),
        hhi,
        effectiveArtists: hhi ? 10000 / hhi : 0,
        entropy: entropy(shares)
      });
    }
    return out;
  }

  function buildWeeklyMarket(rows, mode = "log") {
    const out = [];
    for (const week of getWeeks(rows)) {
      const wr = rows.filter(r => r.week === week);
      const artistMap = new Map();
      for (const r of wr) {
        artistMap.set(r.mainArtist, (artistMap.get(r.mainArtist) || 0) + point(r.rank, mode));
      }
      const sorted = [...artistMap.entries()].sort((a, b) => b[1] - a[1]);
      const total = sorted.reduce((s, [, p]) => s + p, 0);
      const shares = sorted.map(([, p]) => total ? p / total : 0);
      const hhi = shares.reduce((s, p) => s + (p * 100) ** 2, 0);

      out.push({
        week,
        artists: artistMap.size,
        songsPerArtist: artistMap.size ? wr.length / artistMap.size : 0,
        topArtist: sorted[0]?.[0] || "",
        topArtistPoints: sorted[0]?.[1] || 0,
        topArtistShare: (shares[0] || 0) * 100,
        top5Share: shares.slice(0, 5).reduce((a, b) => a + b, 0) * 100,
        effectiveArtists: hhi ? 10000 / hhi : 0
      });
    }
    return out;
  }

  function buildWeeklyTurnover(rows, historyRows = rows) {
    const weeks = getWeeks(rows);
    if (!weeks.length) return [];

    const firstWeek = weeks[0];
    const priorRows = historyRows.filter(r => r.week < firstWeek);
    const priorWeeks = getWeeks(priorRows);
    const prevWeek = priorWeeks.at(-1) || null;

    const ever = new Set(priorRows.map(r => r.songId));
    let prev = new Set(prevWeek ? priorRows.filter(r => r.week === prevWeek).map(r => r.songId) : []);
    const out = [];

    for (const week of weeks) {
      const current = new Set(rows.filter(r => r.week === week).map(r => r.songId));
      let newEntries = 0, reentries = 0, continuing = 0, dropouts = 0;

      for (const k of current) {
        if (prev.has(k)) continuing++;
        else if (ever.has(k)) reentries++;
        else newEntries++;
      }
      for (const k of prev) if (!current.has(k)) dropouts++;

      const union = new Set([...prev, ...current]).size;
      out.push({
        week,
        newEntries,
        reentries,
        continuing,
        dropouts,
        newRate: current.size ? newEntries / current.size * 100 : 0,
        reentryRate: current.size ? reentries / current.size * 100 : 0,
        continuingRate: current.size ? continuing / current.size * 100 : 0,
        retentionRate: prev.size ? continuing / prev.size * 100 : null,
        jaccard: union ? continuing / union * 100 : null
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
        out.push({ week, rank: r.rank, song: r.song, artist: r.artist, mainArtist: r.mainArtist });
      }
    }
    return out;
  }

  function isQaFlagged(v) {
    const s = text(v).toLowerCase();
    if (!s) return false;
    return !["0", "ok", "なし", "無", "false", "正常"].includes(s);
  }

  function isArrowProblem(v) {
    const s = text(v).toLowerCase();
    if (!s) return false;
    return !["ok", "一致", "整合", "true", "1", "○", "◯"].includes(s);
  }

  function qualityCheck(allRows, analysisRows) {
    const issues = [];
    const add = (severity, type, r, detail) => issues.push({
      severity, type,
      week: r?.week || "",
      rank: Number.isInteger(r?.rank) ? r.rank : "",
      song: r?.song || r?.originalSong || "",
      artist: r?.artist || r?.originalArtist || "",
      detail
    });

    for (const r of allRows) {
      if (r.analysisTarget) {
        if (!r.week) add("error", "必須値欠落", r, "週がありません");
        else if (!weekDate(r.week)) add("error", "週形式不正", r, `週=${r.week}`);

        if (!Number.isInteger(r.rank) || r.rank < 1 || r.rank > 100) {
          add("error", "順位不正", r, `順位=${Number.isNaN(r.rank) ? "NaN" : r.rank}`);
        }
        if (!r.song) add("error", "必須値欠落", r, "曲名がありません");
        if (!r.artist) add("error", "必須値欠落", r, "アーティストがありません");
        if (!r.songId) add("error", "曲ID欠落", r, "分析対象行なのに曲IDを作れません");
      }

      if (isQaFlagged(r.qaFlag)) add("warning", "CSV側QAフラグ", r, r.qaFlag);
      if (isArrowProblem(r.arrowConsistency)) add("warning", "矢印整合", r, r.arrowConsistency);
      if (r.correctionNote) add("info", "補正メモ", r, r.correctionNote);
    }

    const byWeek = new Map();
    for (const r of analysisRows) {
      if (!byWeek.has(r.week)) byWeek.set(r.week, []);
      byWeek.get(r.week).push(r);
    }

    for (const [week, items] of byWeek) {
      const rankCount = new Map();
      const songSeen = new Set();

      for (const r of items) {
        rankCount.set(r.rank, (rankCount.get(r.rank) || 0) + 1);
        if (songSeen.has(r.songId)) add("error", "同一曲週重複", r, `曲ID=${r.songId}`);
        songSeen.add(r.songId);
      }

      for (const [rank, count] of rankCount) {
        if (count > 1) issues.push({
          severity: "error", type: "順位重複", week, rank, song: "", artist: "",
          detail: `${rank}位が${count}件`
        });
      }

      const valid = new Set(items.map(r => r.rank));
      const missing = [];
      for (let rank = 1; rank <= 100; rank++) if (!valid.has(rank)) missing.push(rank);
      if (missing.length) issues.push({
        severity: "warning", type: "欠落順位", week, rank: "", song: "", artist: "",
        detail: missing.join(", ")
      });
    }

    const weeks = [...byWeek.keys()].sort();
    for (let i = 1; i < weeks.length; i++) {
      const d = weekDistance(weeks[i - 1], weeks[i]);
      if (d != null && d > 1) {
        issues.push({
          severity: "warning", type: "週そのものの欠落", week: weeks[i], rank: "", song: "", artist: "",
          detail: `${weeks[i - 1]} → ${weeks[i]}（${d - 1}週分の間隔）`
        });
      }
    }

    const order = { error: 0, warning: 1, info: 2 };
    return issues.sort((a, b) =>
      (order[a.severity] ?? 9) - (order[b.severity] ?? 9) ||
      a.week.localeCompare(b.week) ||
      String(a.rank).localeCompare(String(b.rank))
    );
  }

  function buildDataAudit(allRows) {
    const countBy = getter => {
      const m = new Map();
      for (const r of allRows) {
        const k = text(getter(r)) || "(空欄)";
        m.set(k, (m.get(k) || 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    };

    const target = allRows.filter(r => r.analysisTarget).length;
    const excluded = allRows.length - target;
    const qa = allRows.filter(r => isQaFlagged(r.qaFlag)).length;
    const corrected = allRows.filter(r => r.correctionNote).length;
    const arrowProblems = allRows.filter(r => isArrowProblem(r.arrowConsistency)).length;

    return {
      totals: { rows: allRows.length, target, excluded, qa, corrected, arrowProblems },
      sources: countBy(r => r.source),
      normalization: countBy(r => r.normalizationStatus),
      types: countBy(r => r.type),
      qaFlags: countBy(r => r.qaFlag).filter(x => x.name !== "(空欄)"),
      corrections: allRows.filter(r => r.correctionNote).map(r => ({
        week: r.week, rank: r.rank, song: r.song, artist: r.artist,
        note: r.correctionNote, source: r.source
      }))
    };
  }

  function comparePointSystems(rows) {
    const modes = ["linear", "log", "reciprocal"];
    const stats = {};
    for (const m of modes) stats[m] = buildSongStats(rows, m, rows).sort((a, b) => b.points - a.points);

    const maps = {};
    for (const m of modes) maps[m] = new Map(stats[m].map((s, i) => [s.songId, i + 1]));

    return stats.log.map(s => {
      const r1 = maps.linear.get(s.songId);
      const r2 = maps.log.get(s.songId);
      const r3 = maps.reciprocal.get(s.songId);
      return {
        ...s,
        linearRank: r1,
        logRank: r2,
        reciprocalRank: r3,
        avgSystemRank: mean([r1, r2, r3]),
        systemSpread: Math.max(r1, r2, r3) - Math.min(r1, r2, r3)
      };
    }).sort((a, b) => a.avgSystemRank - b.avgSystemRank);
  }

  return {
    mean, median, stddev, point, pointLabel,
    normalizeWeek, normalizeRow, validateRequiredColumns, isValidAnalysisRow,
    getWeeks, weekDistance, calendarSpan, longestStreak,
    buildSongStats, buildArtistStats, resolveArtistScope,
    buildWeeklyArtistMatrix, buildArtistDetail,
    buildArtistConcentration, buildWeeklyMarket, buildWeeklyTurnover,
    weeklyTopN, qualityCheck, buildDataAudit, comparePointSystems,
    isQaFlagged, isArrowProblem
  };
})();

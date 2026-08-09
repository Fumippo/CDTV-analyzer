"use strict";

window.CDTVAnalysis = (() => {
  const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
  const median = a => {
    if (!a.length) return 0;
    const b=[...a].sort((x,y)=>x-y), m=Math.floor(b.length/2);
    return b.length%2 ? b[m] : (b[m-1]+b[m])/2;
  };
  const stddev = a => {
    if (!a.length) return 0;
    const m=mean(a);
    return Math.sqrt(mean(a.map(x=>(x-m)**2)));
  };
  const entropy = shares => shares.reduce((s,p)=>p>0 ? s-p*Math.log(p) : s,0);

  function point(rank, mode="log") {
    if (mode === "linear") return 101-rank;
    if (mode === "reciprocal") return 100/rank;
    return 1 + 99*(1-Math.log10(rank)/2);
  }

  function pointLabel(mode="log") {
    if (mode === "linear") return "101-順位";
    if (mode === "reciprocal") return "100/順位";
    return "対数ポイント";
  }

  function normalizeRow(r) {
    const week=String(r["週"]||"").trim();
    const rank=Number.parseInt(r["順位"],10);
    const song=String(r["正規化曲名"]||r["曲名"]||"").trim();
    const artist=String(r["正規化アーティスト"]||r["アーティスト"]||"").trim();
    const mainArtist=String(r["主要アーティスト"]||artist).trim();
    const productId=String(r["商品ID"]||r["曲ID"]||`${artist}||${song}`).trim();
    return {raw:r,week,rank,song,artist,mainArtist,productId};
  }

  function validateRequiredColumns(fields) {
    const required=["週","順位","曲名","アーティスト"];
    return required.filter(c=>!fields.includes(c));
  }

  function getWeeks(rows) {
    return [...new Set(rows.map(r=>r.week))].sort();
  }

  function longestStreak(weeks, allWeeks) {
    const set=new Set(weeks); let best=0,cur=0;
    for (const w of allWeeks) {
      if (set.has(w)) { cur++; best=Math.max(best,cur); }
      else cur=0;
    }
    return best;
  }

  function countReentries(weeks, allWeeks) {
    const set=new Set(weeks); let seen=false,gap=false,n=0;
    for (const w of allWeeks) {
      const now=set.has(w);
      if (now) { if (seen&&gap) n++; seen=true; gap=false; }
      else if (seen) gap=true;
    }
    return n;
  }

  function adjacentChanges(items, allWeeks) {
    let rise=0,fall=0,reentryRise=0,reentryFall=0;
    const index=new Map(allWeeks.map((w,i)=>[w,i]));
    for (let i=1;i<items.length;i++) {
      const a=items[i-1], b=items[i];
      const diff=a.rank-b.rank;
      if (index.get(b.week)===index.get(a.week)+1) {
        rise=Math.max(rise,diff); fall=Math.max(fall,-diff);
      } else {
        reentryRise=Math.max(reentryRise,diff); reentryFall=Math.max(reentryFall,-diff);
      }
    }
    return {rise,fall,reentryRise,reentryFall};
  }

  function buildSongStats(rows, mode="log") {
    const allWeeks=getWeeks(rows), groups=new Map();
    for (const r of rows) {
      const key=`${r.song}\u0000${r.artist}`;
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(r);
    }
    const out=[];
    for (const [key,rawItems] of groups) {
      const items=[...rawItems].sort((a,b)=>a.week.localeCompare(b.week));
      const ranks=items.map(x=>x.rank), weeks=items.map(x=>x.week);
      const first=items[0], last=items.at(-1), bestRank=Math.min(...ranks);
      const bestIndex=items.findIndex(x=>x.rank===bestRank), ch=adjacentChanges(items,allWeeks);
      const pts=items.map(x=>point(x.rank,mode)), totalPoints=pts.reduce((a,b)=>a+b,0);
      const first3Points=pts.slice(0,3).reduce((a,b)=>a+b,0);
      const secondHalfPoints=pts.slice(Math.floor(pts.length/2)).reduce((a,b)=>a+b,0);
      out.push({
        key,song:first.song,artist:first.artist,entries:items,points:totalPoints,weeks:items.length,
        streak:longestStreak(weeks,allWeeks),reentries:countReentries(weeks,allWeeks),bestRank,
        worstRank:Math.max(...ranks),avgRank:mean(ranks),medianRank:median(ranks),rankStd:stddev(ranks),
        no1Weeks:ranks.filter(x=>x===1).length,top3Weeks:ranks.filter(x=>x<=3).length,
        top10Weeks:ranks.filter(x=>x<=10).length,top20Weeks:ranks.filter(x=>x<=20).length,
        firstDate:first.week,lastDate:last.week,debutRank:first.rank,lastRank:last.rank,
        debutToBest:first.rank-bestRank,weeksToPeak:bestIndex,biggestRise:ch.rise,biggestFall:ch.fall,
        biggestReentryRise:ch.reentryRise,biggestReentryFall:ch.reentryFall,
        earlyShare:totalPoints?first3Points/totalPoints:0,
        lateShare:totalPoints?secondHalfPoints/totalPoints:0,
        pointsPerWeek:items.length?totalPoints/items.length:0,
        leftCensored:first.week===allWeeks[0],rightCensored:last.week===allWeeks.at(-1)
      });
    }
    return out;
  }

  function buildArtistStats(rows, mode="log") {
    const groups=new Map();
    for (const r of rows) {
      if (!groups.has(r.mainArtist)) groups.set(r.mainArtist,[]);
      groups.get(r.mainArtist).push(r);
    }
    const out=[];
    for (const [artist,items] of groups) {
      const ranks=items.map(x=>x.rank), songs=new Set(items.map(x=>`${x.song}\u0000${x.artist}`));
      const weeks=new Set(items.map(x=>x.week)), byWeek=new Map(), bySongPoints=new Map();
      for (const r of items) {
        if (!byWeek.has(r.week)) byWeek.set(r.week,[]);
        byWeek.get(r.week).push(r);
        const sk=`${r.song}\u0000${r.artist}`;
        bySongPoints.set(sk,(bySongPoints.get(sk)||0)+point(r.rank,mode));
      }
      let maxSimultaneous=0,maxTop10Simultaneous=0,maxTop20Simultaneous=0;
      for (const wr of byWeek.values()) {
        maxSimultaneous=Math.max(maxSimultaneous,wr.length);
        maxTop10Simultaneous=Math.max(maxTop10Simultaneous,wr.filter(x=>x.rank<=10).length);
        maxTop20Simultaneous=Math.max(maxTop20Simultaneous,wr.filter(x=>x.rank<=20).length);
      }
      const points=items.reduce((s,x)=>s+point(x.rank,mode),0);
      const bestSongKey=[...bySongPoints.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||"";
      out.push({
        artist,points,songs:songs.size,chartWeeks:weeks.size,songWeeks:items.length,bestRank:Math.min(...ranks),
        avgRank:mean(ranks),medianRank:median(ranks),rankStd:stddev(ranks),
        no1SongWeeks:ranks.filter(x=>x===1).length,top10SongWeeks:ranks.filter(x=>x<=10).length,
        top20SongWeeks:ranks.filter(x=>x<=20).length,maxSimultaneous,maxTop10Simultaneous,maxTop20Simultaneous,
        bestSong:bestSongKey.split("\u0000")[0]||"",pointsPerSong:songs.size?points/songs.size:0,
        pointsPerChartWeek:weeks.size?points/weeks.size:0
      });
    }
    return out;
  }

  function resolveArtistScope(artistStats, mode="top", count=10, selected=[]) {
    const sorted=[...artistStats].sort((a,b)=>b.points-a.points).map(a=>a.artist);
    if (mode==="all") return sorted;
    if (mode==="selected") {
      const set=new Set(selected);
      return sorted.filter(a=>set.has(a));
    }
    return sorted.slice(0,Math.max(1,Math.min(Number(count)||10,sorted.length)));
  }

  function buildWeeklyArtistMatrix(rows, artists, metric, mode="log") {
    const weeks=getWeeks(rows), maps=new Map(artists.map(a=>[a,new Map()]));
    const totalPoints=new Map(weeks.map(w=>[w,0]));
    const cumulative=new Map(artists.map(a=>[a,0]));
    const rowsByWeekArtist=new Map();
    for (const r of rows) {
      const p=point(r.rank,mode);
      totalPoints.set(r.week,(totalPoints.get(r.week)||0)+p);
      if (!maps.has(r.mainArtist)) continue;
      const key=`${r.week}\u0000${r.mainArtist}`;
      if (!rowsByWeekArtist.has(key)) rowsByWeekArtist.set(key,[]);
      rowsByWeekArtist.get(key).push(r);
      if (["points","share","cumulative"].includes(metric)) {
        const m=maps.get(r.mainArtist); m.set(r.week,(m.get(r.week)||0)+p);
      }
    }
    const data=[];
    for (const week of weeks) {
      const vals=[];
      for (const a of artists) {
        const key=`${week}\u0000${a}`, wr=rowsByWeekArtist.get(key)||[];
        let v=0;
        if (metric==="points") v=maps.get(a).get(week)||0;
        else if (metric==="cumulative") {
          cumulative.set(a,cumulative.get(a)+(maps.get(a).get(week)||0)); v=cumulative.get(a);
        }
        else if (metric==="share") {
          const own=maps.get(a).get(week)||0,total=totalPoints.get(week)||0; v=total?own/total*100:0;
        }
        else if (metric==="songs") v=wr.length;
        else if (metric==="top10Songs") v=wr.filter(r=>r.rank<=10).length;
        else if (metric==="top20Songs") v=wr.filter(r=>r.rank<=20).length;
        else if (metric==="no1Songs") v=wr.filter(r=>r.rank===1).length;
        else if (metric==="bestRank") v=wr.length?Math.min(...wr.map(r=>r.rank)):null;
        else if (metric==="avgRank") v=wr.length?mean(wr.map(r=>r.rank)):null;
        else if (metric==="medianRank") v=wr.length?median(wr.map(r=>r.rank)):null;
        vals.push(v);
      }
      data.push({week,vals});
    }
    return {artists,weeks,data};
  }

  function buildArtistDetail(rows, artist, mode="log") {
    const weeks=getWeeks(rows), out=[], cumulative=0;
    for (const week of weeks) {
      const wr=rows.filter(r=>r.week===week&&r.mainArtist===artist);
      const points=wr.reduce((s,r)=>s+point(r.rank,mode),0); cumulative+=points;
      out.push({
        week,points,cumulative,songs:wr.length,top10:wr.filter(r=>r.rank<=10).length,
        top20:wr.filter(r=>r.rank<=20).length,no1:wr.filter(r=>r.rank===1).length,
        bestRank:wr.length?Math.min(...wr.map(r=>r.rank)):null,
        avgRank:wr.length?mean(wr.map(r=>r.rank)):null,
        medianRank:wr.length?median(wr.map(r=>r.rank)):null
      });
    }
    return out;
  }

  function buildArtistConcentration(rows, mode="log") {
    const out=[];
    for (const week of getWeeks(rows)) {
      const map=new Map();
      for (const r of rows.filter(x=>x.week===week)) map.set(r.mainArtist,(map.get(r.mainArtist)||0)+point(r.rank,mode));
      const vals=[...map.values()].sort((a,b)=>b-a), total=vals.reduce((a,b)=>a+b,0);
      const shares=vals.map(v=>total?v/total:0), pct=k=>shares.slice(0,k).reduce((a,b)=>a+b,0)*100;
      const hhi=shares.reduce((s,p)=>s+(p*100)**2,0);
      out.push({week,artists:map.size,top1:pct(1),top3:pct(3),top5:pct(5),top10:pct(10),hhi,
        effectiveArtists:hhi?10000/hhi:0,entropy:entropy(shares)});
    }
    return out;
  }

  function buildSongConcentration(rows, mode="log") {
    const out=[];
    for (const week of getWeeks(rows)) {
      const vals=rows.filter(r=>r.week===week).map(r=>point(r.rank,mode)).sort((a,b)=>b-a);
      const total=vals.reduce((a,b)=>a+b,0), shares=vals.map(v=>total?v/total:0), pct=k=>shares.slice(0,k).reduce((a,b)=>a+b,0)*100;
      const hhi=shares.reduce((s,p)=>s+(p*100)**2,0);
      out.push({week,entries:vals.length,top1:pct(1),top3:pct(3),top5:pct(5),top10:pct(10),hhi});
    }
    return out;
  }

  function buildWeeklyMarket(rows, mode="log") {
    const out=[];
    for (const week of getWeeks(rows)) {
      const wr=rows.filter(r=>r.week===week), ranks=wr.map(r=>r.rank), artistSet=new Set(wr.map(r=>r.mainArtist));
      const artists=buildArtistStats(wr,mode).sort((a,b)=>b.points-a.points);
      out.push({week,entries:wr.length,artists:artistSet.size,avgRank:mean(ranks),medianRank:median(ranks),
        totalPoints:wr.reduce((s,r)=>s+point(r.rank,mode),0),topArtist:artists[0]?.artist||"",topArtistPoints:artists[0]?.points||0});
    }
    return out;
  }

  function buildWeeklyTurnover(rows) {
    const weeks=getWeeks(rows), out=[]; let prev=new Set(), ever=new Set();
    for (const week of weeks) {
      const currentRows=rows.filter(r=>r.week===week), current=new Set(currentRows.map(r=>`${r.song}\u0000${r.artist}`));
      let newEntries=0,reentries=0;
      for (const k of current) {
        if (!prev.has(k)) {
          if (ever.has(k)) reentries++; else newEntries++;
        }
      }
      let dropouts=0; for (const k of prev) if (!current.has(k)) dropouts++;
      out.push({week,newEntries,reentries,dropouts,continuing:[...current].filter(k=>prev.has(k)).length});
      for (const k of current) ever.add(k); prev=current;
    }
    return out;
  }

  function weeklyTopN(rows,n=10) {
    const out=[];
    for (const week of getWeeks(rows)) {
      for (const r of rows.filter(x=>x.week===week&&x.rank<=n).sort((a,b)=>a.rank-b.rank)) {
        out.push({week,rank:r.rank,song:r.song,artist:r.artist});
      }
    }
    return out;
  }

  function qualityCheck(rows) {
    const errors=[], byWeek=new Map();
    for (const r of rows) {
      if (!byWeek.has(r.week)) byWeek.set(r.week,[]); byWeek.get(r.week).push(r);
      if (!Number.isInteger(r.rank)||r.rank<1||r.rank>100) errors.push(["順位範囲外",r.week,`${r.song} / ${r.artist}: ${r.rank}`]);
      if (!r.song||!r.artist||!r.week) errors.push(["必須値欠落",r.week||"(日付なし)",`${r.song} / ${r.artist}`]);
    }
    for (const [week,items] of byWeek) {
      const rankCount=new Map(), songSeen=new Set();
      for (const r of items) {
        rankCount.set(r.rank,(rankCount.get(r.rank)||0)+1);
        const sk=`${r.song}\u0000${r.artist}`;
        if (songSeen.has(sk)) errors.push(["同一曲週重複",week,`${r.song} / ${r.artist}`]);
        songSeen.add(sk);
      }
      for (const [rank,count] of rankCount) if (count>1) errors.push(["順位重複",week,`${rank}位が${count}件`]);
      const valid=new Set(items.filter(r=>r.rank>=1&&r.rank<=100).map(r=>r.rank)), missing=[];
      for (let rank=1;rank<=100;rank++) if (!valid.has(rank)) missing.push(rank);
      if (missing.length) errors.push(["欠落順位",week,missing.join(", ")]);
    }
    return errors;
  }

  function comparePointSystems(rows) {
    const modes=["linear","log","reciprocal"], stats={};
    for (const m of modes) stats[m]=buildSongStats(rows,m).sort((a,b)=>b.points-a.points);
    const maps={};
    for (const m of modes) maps[m]=new Map(stats[m].map((s,i)=>[s.key,i+1]));
    return stats.log.map(s=>{
      const r1=maps.linear.get(s.key),r2=maps.log.get(s.key),r3=maps.reciprocal.get(s.key);
      return {...s,linearRank:r1,logRank:r2,reciprocalRank:r3,avgSystemRank:mean([r1,r2,r3]),systemSpread:Math.max(r1,r2,r3)-Math.min(r1,r2,r3)};
    }).sort((a,b)=>a.avgSystemRank-b.avgSystemRank);
  }

  return {
    mean,median,stddev,point,pointLabel,normalizeRow,validateRequiredColumns,getWeeks,
    buildSongStats,buildArtistStats,resolveArtistScope,buildWeeklyArtistMatrix,buildArtistDetail,
    buildArtistConcentration,buildSongConcentration,buildWeeklyMarket,buildWeeklyTurnover,weeklyTopN,
    qualityCheck,comparePointSystems
  };
})();

"use strict";

const A=window.CDTVAnalysis;
const $=id=>document.getElementById(id);
let allLoadedRows=[],rows=[],allWeeks=[],songStats=[],artistStats=[],currentChart=null;
let currentTable={headers:[],rows:[],filename:"analysis.csv"};

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");}
function fmt(v,d=2){return v==null||Number.isNaN(v)?"":Number(v.toFixed(d));}
function pointMode(){return $("pointMode").value;}
function topN(){return Number($("topN").value)||20;}

function rebuild(){
  allWeeks=A.getWeeks(rows);
  songStats=A.buildSongStats(rows,pointMode());
  artistStats=A.buildArtistStats(rows,pointMode());
  populateArtistPicker();
  updateArtistScopeNote();
}

function applyDateFilter(){
  const start=$("startDate").value,end=$("endDate").value;
  rows=allLoadedRows.filter(r=>(!start||r.week>=start)&&(!end||r.week<=end));
  if(!rows.length){alert("指定期間にデータがありません。");return false;}
  rebuild(); showSummary(); return true;
}

function showSummary(){
  if(!rows.length)return;
  $("summaryCard").hidden=false;
  const edge=songStats.filter(s=>s.leftCensored||s.rightCensored).length;
  const metrics=[
    ["行数",rows.length],["ランキング週数",allWeeks.length],["曲数",songStats.length],["アーティスト数",artistStats.length],
    ["期間",`${allWeeks[0]}<br>～<br>${allWeeks.at(-1)}`],["ポイント方式",esc(A.pointLabel(pointMode()))]
  ];
  $("summary").innerHTML=metrics.map(([n,v])=>`<div class="metric"><div class="metric-name">${n}</div><div class="metric-value" style="${String(v).includes('<br>')?'font-size:14px':''}">${v}</div></div>`).join("");
  $("edgeWarning").innerHTML=`<div class="notice">期間の最初または最後の週に接している曲は <b>${edge}曲</b>。期間外の実績が切れている可能性があります。</div>`;
}

function populateArtistPicker(){
  const selected=new Set([...$("artistPicker").selectedOptions].map(o=>o.value));
  const sorted=[...artistStats].sort((a,b)=>b.points-a.points);
  $("artistPicker").innerHTML=sorted.map(a=>`<option value="${esc(a.artist)}" ${selected.has(a.artist)?"selected":""}>${esc(a.artist)} (${a.points.toFixed(1)} pt)</option>`).join("");
  $("artistCount").max=Math.max(1,artistStats.length);
}

function selectedArtists(){return [...$("artistPicker").selectedOptions].map(o=>o.value);}
function scopedArtists(){return A.resolveArtistScope(artistStats,$("artistScopeMode").value,$("artistCount").value,selectedArtists());}
function updateArtistScopeNote(){
  if(!artistStats.length)return;
  const artists=scopedArtists();
  let txt=`現在 ${artists.length} / ${artistStats.length} アーティストを対象にします。`;
  if(artists.length>30)txt+=" 線が非常に多くなりますが、指定どおり省略せず描画します。数値表は全列を保持します。";
  $("artistScopeNote").textContent=txt;
  $("artistCount").disabled=$("artistScopeMode").value!=="top";
  $("artistPicker").disabled=$("artistScopeMode").value!=="selected";
}

function setCurrentTable(headers,data,filename){currentTable={headers,rows:data,filename};}
function showTable(headers,data,filename="analysis.csv"){
  $("resultCard").hidden=false; setCurrentTable(headers,data,filename);
  let html='<div class="table-wrap"><table><thead><tr>'+headers.map(h=>`<th>${esc(h)}</th>`).join("")+'</tr></thead><tbody>';
  for(const row of data)html+='<tr>'+row.map((c,i)=>`<td class="${i===0?'left':''}">${esc(c)}</td>`).join("")+'</tr>';
  $("resultTable").innerHTML=html+'</tbody></table></div>';
}

function destroyChart(){if(currentChart){currentChart.destroy();currentChart=null;}}
function showBarChart(title,labels,values,label){
  $("chartCard").hidden=false;$("chartTitle").textContent=title;$("chartWarning").textContent="";destroyChart();
  currentChart=new Chart($("chart"),{type:"bar",data:{labels,datasets:[{label,data:values}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});
}
function showMultiLineChart(title,labels,series,yTitle,{reverse=false,min=null,max=null}={}){
  $("chartCard").hidden=false;$("chartTitle").textContent=title;$("chartWarning").textContent=series.length>30?`全${series.length}系列を描画しています。見づらい場合は対象アーティストを絞ってください。`:"";destroyChart();
  const y={beginAtZero:!reverse,reverse,title:{display:true,text:yTitle}}; if(min!=null)y.min=min;if(max!=null)y.max=max;
  currentChart=new Chart($("chart"),{type:"line",data:{labels,datasets:series.map(s=>({label:s.label,data:s.data,pointRadius:series.length>20?0:2,borderWidth:series.length>30?1:2,tension:.12,spanGaps:false}))},options:{responsive:true,maintainAspectRatio:false,animation:series.length>40?false:undefined,interaction:{mode:"nearest",intersect:false},scales:{y},plugins:{legend:{display:series.length<=35,position:"bottom"}}}});
}
function hideChart(){destroyChart();$("chartCard").hidden=true;}

function showSongRanking(key,title,{ascending=false,filter=null,value=x=>x[key]}={}){
  let data=filter?songStats.filter(filter):[...songStats];
  data.sort((a,b)=>ascending?value(a)-value(b):value(b)-value(a)); data=data.slice(0,topN());
  $("resultTitle").textContent=`${title} TOP${data.length}`;$("resultInfo").textContent=`ポイント方式: ${A.pointLabel(pointMode())}`;
  const table=data.map((s,i)=>[i+1,s.song,s.artist,fmt(value(s),3),s.weeks,s.bestRank,(s.leftCensored||s.rightCensored)?"⚠":""]);
  showTable(["順位","曲名","アーティスト",title,"登場週","最高順位","期間端"],table,`${title}.csv`);
  showBarChart(title,data.map(s=>`${s.song} / ${s.artist}`).reverse(),data.map(value).reverse(),title);
}

function showLateBloomers(){
  const data=songStats.filter(s=>s.weeks>=3).map(s=>({...s,score:s.debutToBest*Math.max(1,s.weeksToPeak)})).sort((a,b)=>b.score-a.score).slice(0,topN());
  $("resultTitle").textContent=`遅咲き曲 TOP${data.length}`;$("resultInfo").textContent="上昇幅 × 最高順位到達までの週数。";
  showTable(["順位","曲名","アーティスト","初登場順位","最高順位","上昇幅","ピークまで週","遅咲きスコア"],data.map((s,i)=>[i+1,s.song,s.artist,s.debutRank,s.bestRank,s.debutToBest,s.weeksToPeak,s.score]),"late_bloomers.csv");
  showBarChart("遅咲き曲",data.map(s=>`${s.song} / ${s.artist}`).reverse(),data.map(s=>s.score).reverse(),"遅咲きスコア");
}

function showArtistRanking(key,title,{ascending=false,value=x=>x[key]}={}){
  const data=[...artistStats].sort((a,b)=>ascending?value(a)-value(b):value(b)-value(a)).slice(0,topN());
  $("resultTitle").textContent=`${title} TOP${data.length}`;$("resultInfo").textContent=`ポイント方式: ${A.pointLabel(pointMode())}`;
  showTable(["順位","アーティスト",title,"総合ポイント","曲数","登場週","掲載曲週","最高順位","平均順位","1位曲週","TOP10曲週","同時ランクイン最大","最高ポイント曲"],data.map((a,i)=>[i+1,a.artist,fmt(value(a),3),a.points.toFixed(1),a.songs,a.chartWeeks,a.songWeeks,a.bestRank,a.avgRank.toFixed(2),a.no1SongWeeks,a.top10SongWeeks,a.maxSimultaneous,a.bestSong]),`${title}.csv`);
  showBarChart(title,data.map(a=>a.artist).reverse(),data.map(value).reverse(),title);
}

const weeklyMetricInfo={
  points:["週間アーティストポイント","ポイント",false], cumulative:["累積アーティストポイント","累積ポイント",false], share:["週間アーティストシェア","シェア (%)",false],
  songs:["週間ランクイン曲数","曲数",false],top10Songs:["週間TOP10曲数","曲数",false],top20Songs:["週間TOP20曲数","曲数",false],no1Songs:["週間1位曲数","曲数",false],
  bestRank:["週間最高順位","順位",true],avgRank:["週間平均順位","順位",true],medianRank:["週間中央値順位","順位",true]
};
function showWeeklyArtistMetric(metric){
  const artists=scopedArtists(); if(!artists.length){alert("対象アーティストが選択されていません。");return;}
  const [title,unit,reverse]=weeklyMetricInfo[metric],matrix=A.buildWeeklyArtistMatrix(rows,artists,metric,pointMode());
  $("resultTitle").textContent=`${title}【数値表】`;$("resultInfo").textContent=`${artists.length}アーティスト。表とグラフは同じデータを使用し、全系列を省略せず表示します。`;
  showTable(["週",...artists],matrix.data.map(d=>[d.week,...d.vals.map(v=>v==null?"":fmt(v,metric==="share"?3:2))]),`${metric}_weekly_artist.csv`);
  showMultiLineChart(title,matrix.weeks,artists.map((a,i)=>({label:a,data:matrix.data.map(d=>d.vals[i])})),unit,reverse?{reverse:true,min:1,max:100}:{});
}

function showArtistConcentration(){
  const data=A.buildArtistConcentration(rows,pointMode());$("resultTitle").textContent="週別アーティスト集中度";$("resultInfo").textContent="TOPシェア、HHI、実効アーティスト数、エントロピーを週ごとに計算。";
  showTable(["週","登場アーティスト数","TOP1シェア%","TOP3シェア%","TOP5シェア%","TOP10シェア%","HHI","実効アーティスト数","エントロピー"],data.map(x=>[x.week,x.artists,fmt(x.top1,3),fmt(x.top3,3),fmt(x.top5,3),fmt(x.top10,3),fmt(x.hhi,2),fmt(x.effectiveArtists,2),fmt(x.entropy,4)]),"artist_concentration.csv");
  showMultiLineChart("週別アーティスト集中度",data.map(x=>x.week),[{label:"TOP1",data:data.map(x=>x.top1)},{label:"TOP3",data:data.map(x=>x.top3)},{label:"TOP5",data:data.map(x=>x.top5)},{label:"TOP10",data:data.map(x=>x.top10)}],"シェア (%)");
}
function showSongConcentration(){
  const data=A.buildSongConcentration(rows,pointMode());$("resultTitle").textContent="週別 曲ポイント集中度";$("resultInfo").textContent="その週の順位ポイントが上位曲にどれだけ集中しているか。";
  showTable(["週","掲載曲数","TOP1シェア%","TOP3シェア%","TOP5シェア%","TOP10シェア%","HHI"],data.map(x=>[x.week,x.entries,fmt(x.top1,3),fmt(x.top3,3),fmt(x.top5,3),fmt(x.top10,3),fmt(x.hhi,2)]),"song_concentration.csv");
  showMultiLineChart("曲ポイント集中度",data.map(x=>x.week),[{label:"TOP1",data:data.map(x=>x.top1)},{label:"TOP3",data:data.map(x=>x.top3)},{label:"TOP5",data:data.map(x=>x.top5)},{label:"TOP10",data:data.map(x=>x.top10)}],"シェア (%)");
}
function showWeeklyMarket(){
  const data=A.buildWeeklyMarket(rows,pointMode());$("resultTitle").textContent="週別市場統計";$("resultInfo").textContent="各週の掲載数・アーティスト数・総ポイント・首位アーティストを数値化。";
  showTable(["週","掲載曲数","登場アーティスト数","平均順位","中央値順位","TOP100総ポイント","首位アーティスト","首位アーティストPt"],data.map(x=>[x.week,x.entries,x.artists,fmt(x.avgRank,2),fmt(x.medianRank,2),fmt(x.totalPoints,2),x.topArtist,fmt(x.topArtistPoints,2)]),"weekly_market.csv");
  showMultiLineChart("週別 登場アーティスト数",data.map(x=>x.week),[{label:"登場アーティスト数",data:data.map(x=>x.artists)}],"アーティスト数");
}
function showWeeklyTurnover(){
  const data=A.buildWeeklyTurnover(rows);$("resultTitle").textContent="週別 新規・脱落・再登場";$("resultInfo").textContent="TOP100構成の入れ替わりを追跡。最初の週は全曲を新規扱いします。";
  showTable(["週","新規登場","再登場","脱落","継続"],data.map(x=>[x.week,x.newEntries,x.reentries,x.dropouts,x.continuing]),"weekly_turnover.csv");
  showMultiLineChart("週別チャート入れ替わり",data.map(x=>x.week),[{label:"新規",data:data.map(x=>x.newEntries)},{label:"再登場",data:data.map(x=>x.reentries)},{label:"脱落",data:data.map(x=>x.dropouts)}],"曲数");
}
function showPointComparison(){
  const data=A.comparePointSystems(rows).slice(0,topN());$("resultTitle").textContent="3ポイント方式比較";$("resultInfo").textContent="3方式の順位と方式間の最大順位差を比較。";
  showTable(["曲名","アーティスト","101-順位方式","対数方式","100/順位方式","3方式平均順位","最大順位差"],data.map(s=>[s.song,s.artist,s.linearRank,s.logRank,s.reciprocalRank,fmt(s.avgSystemRank,2),s.systemSpread]),"point_system_comparison.csv"); hideChart();
}
function showQuality(){const e=A.qualityCheck(allLoadedRows);$("resultTitle").textContent="データ品質チェック";$("resultInfo").textContent=`検出 ${e.length}件。`;showTable(["種類","週","内容"],e,"data_quality.csv");hideChart();}
function showWeeklyNo1(){const d=A.weeklyTopN(rows,1);$("resultTitle").textContent="週間1位の変遷";$("resultInfo").textContent="";showTable(["週","順位","曲名","アーティスト"],d.map(x=>[x.week,x.rank,x.song,x.artist]),"weekly_no1.csv");hideChart();}
function showWeeklyTop10(){const d=A.weeklyTopN(rows,10);$("resultTitle").textContent="週間TOP10一覧";$("resultInfo").textContent="全週のTOP10を縦持ちデータで出力。";showTable(["週","順位","曲名","アーティスト"],d.map(x=>[x.week,x.rank,x.song,x.artist]),"weekly_top10.csv");hideChart();}

function showSongDetail(s){
  $("resultTitle").textContent=`${s.song} / ${s.artist}`;$("resultInfo").textContent=`ポイント ${s.points.toFixed(1)} / 登場 ${s.weeks}週 / 最高 ${s.bestRank}位 / 平均 ${s.avgRank.toFixed(2)}位 / TOP10 ${s.top10Weeks}週 / 再登場 ${s.reentries}回 / 順位標準偏差 ${s.rankStd.toFixed(2)} / 最大上昇 ${s.biggestRise}`;
  showTable(["週","順位","変動"],s.entries.map(r=>[r.week,r.rank,r.raw["変動"]||""]),`${s.song}_history.csv`);
  const map=new Map(s.entries.map(r=>[r.week,r.rank])), first=allWeeks.indexOf(s.firstDate),last=allWeeks.indexOf(s.lastDate),labels=allWeeks.slice(first,last+1),values=labels.map(w=>map.has(w)?map.get(w):null);
  showMultiLineChart(`${s.song} / ${s.artist} 順位推移`,labels,[{label:"順位",data:values}],"順位",{reverse:true,min:1,max:100});
}
function showArtistDetail(artist){
  const d=A.buildArtistDetail(rows,artist,pointMode());$("resultTitle").textContent=`${artist} 週間詳細`;$("resultInfo").textContent="ポイント・累積・曲数・TOP10/TOP20・最高/平均/中央値順位を全週表示。";
  showTable(["週","ポイント","累積ポイント","ランクイン曲数","TOP10曲数","TOP20曲数","1位曲数","最高順位","平均順位","中央値順位"],d.map(x=>[x.week,fmt(x.points,2),fmt(x.cumulative,2),x.songs,x.top10,x.top20,x.no1,x.bestRank??"",fmt(x.avgRank,2),fmt(x.medianRank,2)]),`${artist}_weekly_detail.csv`);
  showMultiLineChart(`${artist} 週間ポイント`,d.map(x=>x.week),[{label:"週間ポイント",data:d.map(x=>x.points)}],"ポイント");
}

function updateSongSearch(){
  const q=$("songSearch").value.trim().toLowerCase(),box=$("songSearchResults");if(!q){box.innerHTML="";return;}
  const hits=songStats.filter(s=>s.song.toLowerCase().includes(q)||s.artist.toLowerCase().includes(q)).slice(0,40);
  box.innerHTML=hits.map(s=>`<button data-key="${encodeURIComponent(s.key)}">${esc(s.song)} / ${esc(s.artist)}</button>`).join("");
  box.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{const s=songStats.find(x=>x.key===decodeURIComponent(b.dataset.key));if(s)showSongDetail(s);}));
}
function updateArtistSearch(){
  const q=$("artistSearch").value.trim().toLowerCase(),box=$("artistSearchResults");if(!q){box.innerHTML="";return;}
  const hits=artistStats.filter(a=>a.artist.toLowerCase().includes(q)).sort((a,b)=>b.points-a.points).slice(0,40);
  box.innerHTML=hits.map(a=>`<button data-artist="${encodeURIComponent(a.artist)}">${esc(a.artist)} (${a.points.toFixed(1)} pt)</button>`).join("");
  box.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>showArtistDetail(decodeURIComponent(b.dataset.artist))));
}

function exportCurrentTable(){
  if(!currentTable.headers.length)return;
  const csv=Papa.unparse([currentTable.headers,...currentTable.rows]);
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=currentTable.filename||"analysis.csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

$("csvFile").addEventListener("change",e=>{
  const file=e.target.files[0];if(!file)return;$("status").textContent="CSV読み込み中…";
  Papa.parse(file,{header:true,skipEmptyLines:true,complete:result=>{
    const missing=A.validateRequiredColumns(result.meta.fields||[]);if(missing.length){$("status").textContent=`必要な列がありません: ${missing.join(", ")}`;return;}
    allLoadedRows=result.data.map(A.normalizeRow).filter(r=>r.week&&Number.isInteger(r.rank)).sort((a,b)=>a.week.localeCompare(b.week)||a.rank-b.rank);
    if(!allLoadedRows.length){$("status").textContent="有効なデータがありません。";return;}
    const weeks=A.getWeeks(allLoadedRows);$("startDate").value=weeks[0];$("endDate").value=weeks.at(-1);$("startDate").min=weeks[0];$("startDate").max=weeks.at(-1);$("endDate").min=weeks[0];$("endDate").max=weeks.at(-1);
    applyDateFilter();$("menuCard").hidden=false;$("searchCard").hidden=false;$("artistScopeCard").hidden=false;$("status").textContent=`読み込み完了: ${file.name}`;showSongRanking("points","曲別ポイント");
  },error:err=>{$("status").textContent=`CSV読み込みエラー: ${err.message}`;}});
});

$("applyFilter").addEventListener("click",()=>{if(!allLoadedRows.length)return;if($("startDate").value&&$("endDate").value&&$("startDate").value>$("endDate").value){alert("開始週が終了週より後です。");return;}if(applyDateFilter())showSongRanking("points","曲別ポイント");});
$("resetFilter").addEventListener("click",()=>{if(!allLoadedRows.length)return;const w=A.getWeeks(allLoadedRows);$("startDate").value=w[0];$("endDate").value=w.at(-1);applyDateFilter();showSongRanking("points","曲別ポイント");});
$("pointMode").addEventListener("change",()=>{if(!rows.length)return;rebuild();showSummary();showSongRanking("points","曲別ポイント");});
$("artistScopeMode").addEventListener("change",updateArtistScopeNote);$("artistCount").addEventListener("input",updateArtistScopeNote);$("artistPicker").addEventListener("change",updateArtistScopeNote);
$("songSearch").addEventListener("input",updateSongSearch);$("artistSearch").addEventListener("input",updateArtistSearch);$("exportTable").addEventListener("click",exportCurrentTable);

document.querySelectorAll("[data-action]").forEach(btn=>btn.addEventListener("click",()=>{
  const a=btn.dataset.action;
  if(a==="songPoints")showSongRanking("points","曲別ポイント");
  else if(a==="songWeeks")showSongRanking("weeks","登場週数");
  else if(a==="songStreak")showSongRanking("streak","最長連続登場週数");
  else if(a==="songTop10")showSongRanking("top10Weeks","TOP10滞在週数");
  else if(a==="songNo1")showSongRanking("no1Weeks","1位獲得週数");
  else if(a==="lateBloomers")showLateBloomers();
  else if(a==="stableSongs")showSongRanking("rankStd","順位標準偏差",{ascending:true,filter:s=>s.weeks>=5});
  else if(a==="volatileSongs")showSongRanking("rankStd","順位標準偏差",{filter:s=>s.weeks>=5});
  else if(a==="reentries")showSongRanking("reentries","再登場回数");
  else if(a==="biggestRise")showSongRanking("biggestRise","週間最大上昇");
  else if(a==="biggestFall")showSongRanking("biggestFall","週間最大下落");
  else if(a==="peakDelay")showSongRanking("weeksToPeak","ピーク到達までの週数",{filter:s=>s.debutToBest>0});
  else if(a==="earlyHit")showSongRanking("earlyShare","初動3週ポイント比率",{filter:s=>s.weeks>=4});
  else if(a==="longTail")showSongRanking("lateShare","後半ポイント比率",{filter:s=>s.weeks>=6});
  else if(a==="pointCompare")showPointComparison();
  else if(a==="artistPoints")showArtistRanking("points","総合ポイント");
  else if(a==="artistSongs")showArtistRanking("songs","曲数");
  else if(a==="artistChartWeeks")showArtistRanking("chartWeeks","登場週数");
  else if(a==="artistTop10")showArtistRanking("top10SongWeeks","TOP10曲週");
  else if(a==="artistNo1")showArtistRanking("no1SongWeeks","1位曲週");
  else if(a==="artistEfficiency")showArtistRanking("pointsPerSong","1曲あたりポイント");
  else if(a==="artistWeeklyEfficiency")showArtistRanking("pointsPerChartWeek","登場週あたりポイント");
  else if(a==="artistSimultaneous")showArtistRanking("maxSimultaneous","同時ランクイン最大");
  else if(a==="weeklyArtistPoints")showWeeklyArtistMetric("points");
  else if(a==="weeklyArtistCumulative")showWeeklyArtistMetric("cumulative");
  else if(a==="weeklyArtistShare")showWeeklyArtistMetric("share");
  else if(a==="weeklyArtistSongs")showWeeklyArtistMetric("songs");
  else if(a==="weeklyArtistTop10Songs")showWeeklyArtistMetric("top10Songs");
  else if(a==="weeklyArtistTop20Songs")showWeeklyArtistMetric("top20Songs");
  else if(a==="weeklyArtistNo1Songs")showWeeklyArtistMetric("no1Songs");
  else if(a==="weeklyArtistBestRank")showWeeklyArtistMetric("bestRank");
  else if(a==="weeklyArtistAvgRank")showWeeklyArtistMetric("avgRank");
  else if(a==="weeklyArtistMedianRank")showWeeklyArtistMetric("medianRank");
  else if(a==="weeklyMarket")showWeeklyMarket();
  else if(a==="artistConcentration")showArtistConcentration();
  else if(a==="songConcentration")showSongConcentration();
  else if(a==="weeklyTurnover")showWeeklyTurnover();
  else if(a==="weeklyNo1")showWeeklyNo1();
  else if(a==="weeklyTop10")showWeeklyTop10();
  else if(a==="quality")showQuality();
}));

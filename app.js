// 小番茄溫室作業板 — 資料存放於 Google 試算表(透過 Apps Script 網頁應用程式)
import { SHEET_API_URL } from "./sheet-config.js";

/* ---------- defaults (from 種植工作計畫排程表) ---------- */
const DEFAULT_CFG={plantDate:"2026-10-15",orderLead:2,flowerWeek:3,feedStart:4,feedInterval:3,feedCount:7,harvestWeek:11,endWeek:30,
  area:1000,bedSpacing:1.5,rowsPerBed:1,plantSpacing:0.6,stems:2,pollination:"bee",targetN:225,targetP:175,targetK:150,staff:[]};
const SRC={
  S1:["臺南場 小果番茄栽培管理","https://book.tndais.gov.tw/Brochure/tech96.htm"],
  S2:["TGAP 番茄良好農業規範","https://gazette.nat.gov.tw/EG_FileManager/eguploadpub/eg027026/ch07/type3/gov62/num67/images/BB.pdf"],
  S3:["農業部 設施番茄養液土耕栽培技術","https://www.moa.gov.tw/ws.php?id=19487"],
  S4:["農試所 設施小果番茄高溫調適策略","https://kmweb.moa.gov.tw/knowledgebase.php?func=1&type=12815&id=423553"],
  S5:["臺中場 設施小果番茄鉀肥試驗","https://www.tcdares.gov.tw/files/tdais/web_structure/13097/A01_1.pdf"],
  S6:["臺南場 番茄青枯病防治實務","https://book.tndais.gov.tw/Magazine/mag100/100-4.pdf"],
  S7:["臺南場 番茄嫁接茄子根砧","https://book.tndais.gov.tw/Magazine/mag35-1.htm"],
  S8:["臺南場 番茄健康管理病蟲害管理","https://kmweb.moa.gov.tw/redirect_files.php?theme=knowledgebase&id=456949"],
  S10:["臺南場 設施土壤鹽化防治","https://kmweb.moa.gov.tw/theme_data.php?theme=news&sub_theme=variety&id=55647"],
  S12:["Alabama Extension 溫室番茄生產","https://www.aces.edu/blog/topics/crop-production/greenhouse-tomato-production/"],
  S13:["UMass 溫室/高隧道番茄指南","https://nevegetable.org/crops/tomato-greenhouse-and-high-tunnel"],
  S14:["Greenhouse Grower 吊蔓番茄指南","https://www.greenhousegrower.com/production/your-guide-to-high-wire-tomato-growing/"],
  S15:["Ageon 番茄生長量測","https://ageoncropconsulting.com/crop-registration-undestanding-the-tomato-crop/"],
  S16:["Shamshiri 2018 溫室番茄微氣候","https://www.ars.usda.gov/ARSUserFiles/20200500/Pubs%202018/Shamshiri2018%20-%20review%20optimum%20microclimate%20greenhouse.pdf"],
  S17:["Bayer 設施番茄溫濕度與水分","https://www.vegetables.bayer.com/us/en-us/resources/growing-tips-and-innovation-articles/cultivation-insights/temperature-humidity-and-water-in-protected-culture-tomatoes.html"],
  S18:["Koppert 番茄熊蜂授粉檢查表","https://www.koppert.com/news-information/knowledge-documents/pollination-checklist-tomato/"],
  S19:["Rutgers 溫室害蟲計數與門檻","https://plant-pest-advisory.rutgers.edu/pest-counts-action-thresholds-in-the-greenhouse/"],
  S20:["UC Davis 番茄採後處理","https://postharvest.ucdavis.edu/produce-facts-sheets/tomato"],
  S22:["防檢署 農藥資訊服務網","https://pesticide.aphia.gov.tw/information/Query/Bug"]
};
const STATUS=[["todo","待辦"],["doing","進行中"],["done","完成"],["issue","異常"]];
const STATUS_LABEL={...Object.fromEntries(STATUS),notdone:"未完成"};

/* ---------- computed quantities ---------- */
function calc(c){
  const plants=Math.floor(c.area/c.bedSpacing*c.rowsPerBed/c.plantSpacing);
  const stems=plants*c.stems;
  const ha=c.area/10000;
  const N=c.targetN*ha,P=c.targetP*ha,K=c.targetK*ha;
  const bN=N*0.18,bK=K*0.18;
  const tN=N*0.82/c.feedCount,tK=K*0.82/c.feedCount;
  const kno3=k=>k/0.46; const canNeed=(n,k)=>Math.max(0,n-kno3(k)*0.13)/0.155;
  return {plants,stems,order:Math.ceil(plants*1.1),m2PerStem:c.area/stems,cards:Math.ceil(c.area/93),
    beeMin:Math.ceil(c.area/1000),beeMax:Math.ceil(c.area/1000*2),compost:350*c.area/1000,borax:c.area/1000,
    superP:P/0.18,basalKNO3:kno3(bK),basalCaN:canNeed(bN,bK),tN,tK,feedKNO3:kno3(tK),feedCaN:canNeed(tN,tK)};
}
const f1=x=>(Math.round(x*10)/10).toLocaleString("zh-TW");

/* ---------- task catalogue ---------- */
// milestone: w(c) returns week relative to planting (0 = planting week)
function milestones(c,q){
  const pol={bee:`放入熊蜂 ${q.beeMin}–${q.beeMax} 箱(每分地1–2箱)。蜂箱水平放置、放在顯眼處、防凝結水,炎熱時遮陰。放蜂後用藥前先確認藥劑對熊蜂的影響。`,
    hormone:"花序有2–3朵花盛開時開始噴花:番茄多旺 20°C用100倍、30°C用250倍;或多結果朗 20°C用800倍、30°C用1200倍。使用前查詢現行登記。",
    vibration:"以電動振動器或搖動吊線振動花序,每週3次;陰濕天每天進行。相對濕度60–70%時效果最好。"}[c.pollination];
  const M=[
    {id:"A01",stage:"作前準備",w:-8,t:"前作清園",how:"前作植株、殘根、落果、舊黏紙全部清出溫室並裝袋帶離園區;清除棚內與周邊雜草。",chk:"地面無殘株落果",rec:"田間作業紀錄",src:["S8"]},
    {id:"A02",stage:"作前準備",w:-8,t:"土壤採樣送驗",how:"依送驗單位規定採樣,驗 pH、EC、有機質、磷、鉀、鈣、鎂。標準:pH 5.6–7.0、EC 不超過 2.0 dS/m。結果決定基肥量與是否淋洗。",chk:"取得檢驗報告並存檔",rec:"施肥灌溉紀錄",src:["S2"]},
    {id:"A03",stage:"作前準備",w:-8,t:"鹽化土壤處理(視驗土結果)",how:"EC 偏高時:以大量清水淋洗降鹽。稻草約1公噸/分地或低養分纖維質堆肥10–20公噸/公頃需1個月以上分解,距定植不足1個月時留到作後休閒期做;排水不良田區規劃地表下60–80 cm暗渠。",chk:"複驗 EC 回到標準內",rec:"田間作業紀錄",src:["S10","S2"]},
    {id:"A04",stage:"作前準備",w:-7,t:"決定自根苗或嫁接苗",how:"田區曾發生青枯病→訂茄子根砧(EG203、EG219、EG190)嫁接苗:自根苗罹病率80–100%,嫁接苗15%以下。灌溉水不可流經病田。",chk:"決定後通知訂苗負責人",rec:"田間作業紀錄",src:["S6","S7"]},
    {id:"A05",stage:"作前準備",w:-6,t:"溫室設施檢修",how:"防蟲網破洞修補、出入口檢查;側窗/捲揚、遮陰網、循環風扇試運轉(參考:9×30 m 溫室配4台、每台≥1,600 cfm);滴灌管路逐條試水,確認出水均勻、無堵塞漏水。",chk:"設施各項試運轉正常",rec:"田間作業紀錄",src:["S13"]},
    {id:"A07",stage:"作前準備",w:-3,t:"基肥施用與整地",how:`本場 ${c.area.toLocaleString()} m² 用量:堆肥 ${f1(q.compost)} kg、硼砂 ${f1(q.borax)} kg、過磷酸鈣 ${f1(q.superP)} kg(磷肥全量)、硝酸鉀 ${f1(q.basalKNO3)} kg、硝酸鈣 ${f1(q.basalCaN)} kg(氮鉀約18%)。均勻撒施後翻耕。若驗土磷鉀偏高請減量。`,chk:"施用量與紀錄一致",rec:"施肥灌溉紀錄",src:["S1","S2"]},
    {id:"A06",stage:"作前準備",w:-Math.max(c.orderLead,2),t:"向育苗場訂苗",how:`最晚本週下訂(育苗場需至少定植前2週)。數量 ${q.order.toLocaleString()} 株(含10%備苗)。訂單寫明:品種、苗齡四本葉(4–6葉)、株高約10–15 cm、128格穴盤苗、育苗期以60目網隔離銀葉粉蝨;青枯病田指定茄砧嫁接苗(依A04)。確認到苗日與是否有現成苗。`,chk:"取得育苗場確認(品種、數量、規格、到苗日)",rec:"田間作業紀錄",src:["S1","S2","S12","S7"]},
    {id:"A08",stage:"作前準備",w:-2,t:"作畦、鋪設滴灌",how:`畦距 ${c.bedSpacing} m、每畦 ${c.rowsPerBed} 行;鋪滴灌帶後通水,寬畦需3–4條滴帶才能整畦濕潤。`,chk:"每畦濕潤帶連續無乾點",rec:"田間作業紀錄",src:["S13"]},
    {id:"A09",stage:"作前準備",w:-1,t:"架設吊線/支架",how:`吊線鋼線高度至少 2.4 m;每幹一條尼龍吊繩,共 ${q.stems.toLocaleString()} 條。`,chk:"吊繩數量足夠",rec:"田間作業紀錄",src:["S13"]},
    {id:"A10",stage:"作前準備",w:-1,t:"懸掛監測黏紙",how:`黃色黏紙 ${q.cards} 張(約每93 m²一張),掛在通風口、門口與周邊,高度與作物冠層齊並隨植株升高;另掛藍色黏紙監測薊馬。黏紙編號並畫位置圖。`,chk:"黏紙已編號、有位置圖",rec:"病蟲害防治紀錄",src:["S19","S8"]},
    {id:"A11",stage:"定植緩苗",w:0,t:"到苗驗收",how:"逐盤檢查:苗齡四本葉(4–6葉)、株高約10–15 cm、根團完整;剔除捲葉、黃化、矮化苗,不合格數量當場與育苗場確認補苗;記錄育苗場、品種、批號、數量。",chk:"不合格苗已剔除並記錄",rec:"田間作業紀錄",src:["S1","S2","S12"]},
    {id:"B01",stage:"定植緩苗",w:0,t:"定植",how:`株距 ${c.plantSpacing} m,共 ${q.plants.toLocaleString()} 株;定植前後充分灌水。可控溫溫室定植後24°C維持1–2天,再逐日降至19°C。嫁接苗嫁接口保持在土面以上。`,chk:"定植株數正確",rec:"田間作業紀錄",src:["S17"]},
    {id:"B03",stage:"定植緩苗",w:1,t:"補植",how:"檢查缺株與病株(捲葉、萎凋),以備苗補植。",chk:"全區無缺株",rec:"田間作業紀錄",src:[]},
    {id:"B05",stage:"營養生長",w:2,t:"雙幹整枝定幹",how:"保留主幹及第一花序下方側枝作為第二幹,其餘側芽全部摘除。",chk:"每株2幹、無多餘側枝",rec:"田間作業紀錄",src:["S1"]},
    {id:"C02",stage:"開花著果",w:c.flowerWeek,t:"首花序開花・啟動授粉",how:pol,chk:"授粉作業已排入例行工作",rec:"溫濕度與授粉紀錄",src:["S1","S4","S12","S13","S18"]},
  ];
  for(let i=1;i<=c.feedCount;i++){
    const w=c.feedStart+(i-1)*c.feedInterval;
    M.push({id:"F"+i,stage:w<c.harvestWeek?"開花著果":"結果採收",w,t:`第 ${i} 次追肥`,
      how:`${i===1?"定植後20–30天、第一花序結果時首次追肥。":"每3週一次。"}本場每次:N ${f1(q.tN)} kg、K₂O ${f1(q.tK)} kg,約硝酸鉀 ${f1(q.feedKNO3)} kg + 硝酸鈣 ${f1(q.feedCaN)} kg(可隨滴灌施用)。結果期 N:P₂O₅:K₂O 約 3:1:2。${w>c.endWeek-6?" 已接近摘心,可視植株狀況省略。":""}`,
      chk:"施用量與紀錄一致",rec:"施肥灌溉紀錄",src:["S1","S2"]});
  }
  M.push(
    {id:"D01",stage:"結果採收",w:c.harvestWeek,t:"第1果房轉色・調整肥水",how:"參考農業部試驗:轉色期起滴灌改為每日1次、每次5分鐘(依土壤濕度調整);水溶肥由 20-20-20 改為高鉀 15-20-25。避免忽乾忽濕以防裂果、尻腐。若首採週與預估不同,請到排程設定修正。",chk:"灌溉設定已調整",rec:"施肥灌溉紀錄",src:["S3","S2","S13"]},
    {id:"D06",stage:"結果採收",w:c.harvestWeek,t:"果實農藥殘留檢驗",how:"首批採收前後送驗,每期作至少一次,報告存檔。",chk:"取得合格報告",rec:"病蟲害防治紀錄",src:["S2"]},
    {id:"D07",stage:"結果採收",w:c.harvestWeek,t:"葉片營養分析(選用)",how:"採15–20片生長點往下第3–4片的完整成熟葉送驗,確認氮磷鉀鈣鎂。",chk:"取得分析報告",rec:"施肥灌溉紀錄",src:["S13"]},
    {id:"E01",stage:"作期末",w:c.endWeek-6,t:"摘心",how:"作期結束前6週摘除頂芽,養分集中到已著果果房。之後停止授粉、摘側芽與生長量測。",chk:"全部幹已摘心",rec:"田間作業紀錄",src:["S12"]},
    {id:"E02",stage:"作期末",w:c.endWeek+1,t:"清園",how:"末採後拔除植株、殘根、落果並帶離溫室;回收滴帶、吊繩、黏紙;撤出蜂箱。",chk:"溫室內無植株殘體",rec:"田間作業紀錄",src:["S8"]},
    {id:"E03",stage:"作期末",w:c.endWeek+1,t:"作後土壤檢測與休閒規劃",how:"驗 pH、EC;EC 偏高安排淋洗與有機質改良;有青枯病、線蟲則規劃輪作或嫁接苗。",chk:"完成下期作土壤改良計畫",rec:"施肥灌溉紀錄",src:["S2","S10","S6"]},
    {id:"E04",stage:"作期末",w:c.endWeek+1,t:"作期檢討",how:"彙整總產量(kg/分地)、特級果比例、糖度、用肥量、病蟲害與工時。參考:臺中場秋作玉女總產量 2,019 kg/0.1公頃、特級果 91.9%。",chk:"完成檢討報告",rec:"採收出貨紀錄",src:["S5"]}
  );
  return M;
}
// recurring: freq daily | 2day | weekly | monthly ; active from..to (weeks)
function routines(c){
  const E=c.endWeek, T=c.endWeek-6;
  return [
    {id:"RENV",freq:"daily",from:0,to:E,t:"溫濕度巡查紀錄",how:w=>`記錄最高/最低溫與相對濕度。白天21–27°C、夜間17–18°C;RH 50–70%,不超過90%${w>=5&&w<=7?"(盛花期特別注意高濕灰黴)":""}。日溫>26°C且夜溫>20°C為高溫障礙:開遮陰、提高供水頻率,葉面補鈣每7–10天1次連2–3次。開花期<15°C花粉發育不良。`,rec:"溫濕度與授粉紀錄",src:["S17","S16","S13","S4"]},
    {id:"RVENT",freq:"daily",from:0,to:E,t:"通風・遮陰・循環風扇操作",how:()=>"日出後通風排濕並開循環風扇;晴天後夜溫維持17–18°C、陰天後16–17°C;高溫時段開遮陰網。",rec:"溫濕度與授粉紀錄",src:["S13","S4"]},
    {id:"RDRIP",freq:"daily",from:0,to:E,t:"滴灌巡查",how:w=>`${w<c.harvestWeek?"生長初期參考:每日滴灌2次、每次10分鐘。":"轉色期後參考:每日1次、每次5分鐘。"}依土壤濕度調整(手握成團不滴水)。檢查滴帶破損、堵塞、漏水;避免忽乾忽濕。`,rec:"施肥灌溉紀錄",src:["S3","S13"]},
    {id:"RSICK",freq:"daily",from:0,to:E,t:"病株・病葉・病果清除",how:()=>"巡園發現捲葉病毒株、萎凋株、灰黴病果,裝袋帶離園區。萎凋株切莖基部泡清水,出現乳白色雲霧狀菌泥即為青枯病:拔除帶出焚燬、減少給水、築土堤隔離。用藥前查農藥資訊服務網現行登記與安全採收期。",rec:"病蟲害防治紀錄",src:["S8","S6","S22"]},
    {id:"RCOLD",freq:"daily",from:c.harvestWeek,to:E,t:"採後處理・冷藏溫度紀錄",how:()=>"採後移陰涼處分級、預冷;淡紅果10–12.5°C、紅熟硬果7–10°C 可放3–5天,RH 90–95%;低於10°C超過2週會寒害。冷藏溫度每天記錄。",rec:"採收出貨紀錄",src:["S20","S2"]},
    {id:"RBEE",freq:"2day",from:c.flowerWeek,to:T,cond:c.pollination==="bee",t:"熊蜂咬痕檢查",how:()=>"在不同位置採20朵已閉合的花,應全部有咬痕;每朵咬痕降到只剩1–2個時換新箱。熊蜂活動溫度8–28°C。",rec:"溫濕度與授粉紀錄",src:["S18"]},
    {id:"RHORM",freq:"weekly",from:c.flowerWeek,to:T,cond:c.pollination==="hormone",t:"生長調節劑噴花",how:()=>"花序2–3朵花盛開時處理,依溫度調整倍數;冬季6–7天一次、夏季4–5天一次。",rec:"病蟲害防治紀錄",src:["S1","S4"]},
    {id:"RVIB",freq:"weekly",from:c.flowerWeek,to:T,cond:c.pollination==="vibration",t:"振動授粉(本週3次)",how:()=>"每週3次,陰濕天每天;RH 60–70%時效果最好。",rec:"田間作業紀錄",src:["S12","S13"]},
    {id:"RCLIP",freq:"weekly",from:1,to:T,t:"誘引夾莖",how:()=>"沿主莖約每25 cm夾一次,夾在兩片葉之間,不夾在花序下方。",rec:"田間作業紀錄",src:["S12","S14"]},
    {id:"RSUCK",freq:"weekly",from:2,to:T,t:"摘側芽",how:()=>"側芽長到5–7.5 cm前摘除,乾脆折斷,晴天乾燥時段進行。",rec:"田間作業紀錄",src:["S12","S13"]},
    {id:"RTRAP",freq:"weekly",from:-1,to:E,t:"黏紙計數",how:()=>"每張黏紙計數粉蝨、薊馬、斑潛蠅隻數並記錄;蟲量少可續用。粉蝨為病毒媒介,初見即啟動防治;薊馬參考門檻每張每週15隻。",rec:"病蟲害防治紀錄",src:["S19","S8"]},
    {id:"RMEAS",freq:"weekly",from:c.flowerWeek,to:T,t:"生長量測(固定10株)",how:()=>"量莖徑、生長點至開花花序距離、新開花序數、著果數。花距變短/莖變細=偏生殖;變長/變粗=偏營養。前3–4週數據建立自家基準。",rec:"生長量測紀錄",src:["S15"]},
    {id:"RTHIN",freq:"weekly",from:c.flowerWeek,to:T,t:"疏果(依品種)",how:()=>"果穗過長或弱株:小果每穗留8–10果。",rec:"田間作業紀錄",src:["S12","S14"]},
    {id:"RLEAF",freq:"weekly",from:c.harvestWeek,to:E,t:"摘下位葉",how:()=>"採收完的果房以下葉片全摘,再多摘上方1片;維持約1.5–1.8 m葉幕,摘下葉片帶出溫室。",rec:"田間作業紀錄",src:["S14","S12"]},
    {id:"RHARV",freq:"weekly",from:c.harvestWeek,to:E,t:"採收(每週1–3次)",how:()=>"紅熟且硬度高時採收,抽測糖度應達7°Brix以上;高溫期提早採收防裂果。記錄採收日期、區塊、人員、重量。",rec:"採收出貨紀錄",src:["S1","S12","S2"]},
    {id:"RCOLDM",freq:"monthly",from:c.harvestWeek,to:E,t:"冷藏設施維修檢查",how:()=>"檢查溫控、門封、除霜。",rec:"採收出貨紀錄",src:["S2"]},
    {id:"RBEEM",freq:"monthly",from:c.flowerWeek,to:T,cond:c.pollination==="bee",t:"蜂群評估・預訂下一箱",how:()=>"蜂群活躍期約6–8週,依咬痕狀況提早訂下一箱。",rec:"溫濕度與授粉紀錄",src:["S12","S18"]},
  ].filter(r=>r.cond!==false);
}
const FREQ_LABEL={daily:"每日","2day":"每2天",weekly:"每週",monthly:"每月"};

/* ---------- dates ---------- */
const DAY=86400000;
function parseYmd(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);}
function ymd(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function dayDiff(a,b){return Math.round((parseYmd(ymd(a))-parseYmd(ymd(b)))/DAY);}
function md(d){return (d.getMonth()+1)+"/"+d.getDate();}
const WD="日一二三四五六";
function stageOf(w,c){if(w<0)return"作前準備";if(w<=1)return"定植緩苗";if(w<c.flowerWeek)return"營養生長";if(w<c.harvestWeek)return"開花著果";if(w<=c.endWeek)return"採收期";if(w===c.endWeek+1)return"清園";return"作後休閒";}

/* ---------- state ---------- */
let cfg={...DEFAULT_CFG};
let statusMap={};           // manager-owned: key -> {status, assignee, note, by, at}
let reportMap={};           // staff reports: key -> {result:"done"|"notdone", reason, by, at}
let online=false, loaded=false;
let role="pending";         // pending | online | local
let token="", sheetUrl="";  // manager login token (kept on this device)
try{token=localStorage.getItem("tomato.mgrToken")||"";sheetUrl=localStorage.getItem("tomato.sheetUrl")||"";}catch(e){}
let loginOpen=false;
let today=parseYmd(ymd(new Date()));
let viewDate=today;
let tab="today", personFilter="all", planFilter="all";
const open=new Set();
const reasonOpen=new Set();
let me="";
try{me=localStorage.getItem("tomato.me")||"";}catch(e){}
let pendingRender=false;
let demoStaff=false;       // demo mode only: preview the staff view
const isManagerView=()=>role==="local"?!demoStaff:(role==="online"&&!!token);

/* ---------- instances ---------- */
function build(date){
  const c=cfg,q=calc(c);
  const plant=parseYmd(c.plantDate);
  const dIdx=dayDiff(date,plant);
  const week=Math.floor(dIdx/7);
  const M=milestones(c,q).map(m=>({...m,kind:"m",key:m.id,date:addDays(plant,m.w*7)}));
  const out={week,dIdx,overdue:[],thisWeek:[],daily:[],weekly:[],monthly:[],upcoming:[],all:M};
  for(const m of M){
    const s=st(m.key).status;
    if(m.w<week&&s!=="done")out.overdue.push(m);
    else if(m.w===week)out.thisWeek.push(m);
    else if(m.w===week+1||m.w===week+2)out.upcoming.push(m);
  }
  for(const r of routines(c)){
    if(week<r.from||week>r.to)continue;
    const base={...r,kind:"r",stage:stageOf(week,c),how:r.how(week),chk:""};
    if(r.freq==="daily")out.daily.push({...base,key:r.id+"_"+ymd(date)});
    else if(r.freq==="2day"){if((dIdx-r.from*7)%2===0)out.daily.push({...base,key:r.id+"_"+ymd(date)});}
    else if(r.freq==="weekly")out.weekly.push({...base,key:r.id+"_w"+week});
    else if(r.freq==="monthly")out.monthly.push({...base,key:r.id+"_m"+ymd(date).slice(0,7)});
  }
  return out;
}

/* ---------- effective status: newest of manager status and staff report ---------- */
function st(key){
  const s=statusMap[key], r=reportMap[key];
  const base={status:"todo",assignee:"",note:"",...(s||{})};
  if(r&&r.at&&(!s||!s.at||r.at>s.at)){
    return {...base,status:r.result==="done"?"done":"notdone",reason:r.reason||"",by:r.by,at:r.at,fromReport:true};
  }
  return base;
}



/* ---------- Google 試算表 API ---------- */
function saveToken(t,url){
  token=t||"";if(url!==undefined&&/^https:\/\/docs\.google\.com\//.test(url||""))sheetUrl=url;
  try{if(token)localStorage.setItem("tomato.mgrToken",token);else localStorage.removeItem("tomato.mgrToken");if(sheetUrl)localStorage.setItem("tomato.sheetUrl",sheetUrl);}catch(e){}
}
async function api(action,data){
  let j;
  try{
    // 不加自訂 header(送 text/plain),瀏覽器才不會先送 CORS 預檢,Apps Script 才收得到
    const res=await fetch(SHEET_API_URL,{method:"POST",body:JSON.stringify({action,token,...(data||{})})});
    j=await res.json();
  }catch(e){throw {error:"network"};}
  if(!j||!j.ok){
    const err=j||{error:"server"};
    if(err.error==="auth"&&token){
      saveToken("");unsubscribeLogs();loginOpen=false;
      if(!["today","plan"].includes(tab))tab="today";
      scheduleRender();toast("管理者登入已過期,請重新登入");
    }
    throw err;
  }
  return j;
}
function apiErr(e){
  const c=e&&e.error||"";
  if(c==="bad-password")return"密碼不正確";
  if(c==="no-password")return"尚未設定管理者密碼(Apps Script 裡的 INITIAL_PASSWORD)";
  if(c==="weak-password")return"新密碼至少 6 碼";
  if(c==="network")return"網路連線失敗,請稍後再試";
  if(c==="auth")return"請重新登入管理者";
  return"發生錯誤,請稍後再試";
}
function writeErr(e){
  if(e&&e.error==="auth")return;
  toast(e&&e.error==="network"?"儲存失敗,請檢查網路後再試":"儲存失敗,請稍後再試");
}
let pending=0;
function write(action,data,okMsg){
  pending++;
  return api(action,data).then(j=>{if(okMsg)toast(okMsg);return j;}).catch(writeErr)
    .finally(()=>{pending--;if(!pending)refresh();});
}
function setStatus(key,patch){
  const cur=statusMap[key]||{status:"todo",assignee:"",note:""};
  const nextDoc={status:cur.status||"todo",assignee:cur.assignee||"",note:cur.note||"",...patch,by:me||"管理者",at:new Date().toISOString()};
  const logs=[];
  if(patch.status!==undefined&&patch.status!==(st(key).status))logs.push({action:"狀態:"+STATUS_LABEL[patch.status],detail:nextDoc.assignee?"負責:"+nextDoc.assignee:""});
  if(patch.assignee!==undefined&&patch.assignee!==(cur.assignee||""))logs.push({action:"分派",detail:patch.assignee||"取消分派"});
  if(patch.note!==undefined&&patch.note!==(cur.note||""))logs.push({action:"備註",detail:patch.note});
  statusMap={...statusMap,[key]:nextDoc};
  render();
  if(!online){logs.forEach(l=>addLocalLog(key,l.action,l.detail));return;}
  write("setStatus",{key,doc:nextDoc,info:taskInfo(key),logs});
}
function setReport(key,result,reason){
  const d={result,reason:(reason||"").slice(0,500),by:(me||"未具名").slice(0,40),at:new Date().toISOString()};
  reportMap={...reportMap,[key]:d};
  render();
  const msg=result==="done"?"已回報完成":"已送出未完成說明";
  if(!online){addLocalLog(key,result==="done"?"回報完成":"回報未完成",d.reason);toast(msg);return;}
  write("setReport",{key,doc:d,info:taskInfo(key)},msg);
}
function saveCfg(next){
  cfg={...DEFAULT_CFG,...next};
  render();
  if(online)return write("saveCfg",{cfg},"已儲存設定");
  toast("示範模式:設定不會儲存");
}
let refreshing=false;
async function refresh(){
  if(!online||pending||refreshing)return;
  refreshing=true;
  try{
    const j=await api("load");
    if(!pending){
      cfg={...DEFAULT_CFG,...(j.cfg||{})};statusMap=j.status||{};reportMap=j.reports||{};
      if(lostBanner){$("#banner").hidden=true;lostBanner=false;}
    }
  }catch(e){
    if(e.error!=="auth"){showBanner("無法讀取 Google 試算表,請確認網路,或檢查 sheet-config.js 的網址後重新整理。");lostBanner=true;}
  }finally{refreshing=false;}
  loaded=true;
  if(isManagerView()&&tab==="logs")fetchLogs(true);
  scheduleRender();
}
let lostBanner=false;
function connect(){
  const url=String(SHEET_API_URL||"");
  if(!/^https?:\/\//.test(url)){
    role="local";loaded=true;
    showBanner("示範模式:尚未設定 Google 試算表(sheet-config.js),資料不會儲存,也不需要密碼。");
    render();return;
  }
  role="online";online=true;
  render();
  refresh();
  if(token)api("check").catch(()=>{});
  setInterval(()=>{if(document.visibilityState==="visible")refresh();},60000);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh();});
}
function scheduleRender(){
  const a=document.activeElement;
  if(a&&(a.tagName==="TEXTAREA"||(a.tagName==="INPUT"&&a.closest("#view")))){pendingRender=true;return;}
  render();
}
document.addEventListener("focusout",()=>{setTimeout(()=>{if(pendingRender){pendingRender=false;scheduleRender();}},0);});

/* ---------- automatic work log ---------- */
const PLAN_XLSX="docs/tomato-plan.xlsx";
const PLAN_XLSX_NAME="溫室土耕小番茄_種植工作計畫排程表.xlsx";
const REC_SHEETS=[["田間作業紀錄","紀錄_田間作業"],["施肥灌溉紀錄","紀錄_施肥灌溉"],["病蟲害防治紀錄","紀錄_病蟲害防治"],["溫濕度與授粉紀錄","紀錄_溫濕度"],["生長量測紀錄","紀錄_生長量測"],["採收出貨紀錄","紀錄_採收出貨"]];
let logEntries=[];          // entries for the selected month
let logMonth=ymd(today).slice(0,7);
let logRec="all", logWho="all", logAct="all";
let logUnsub=null, logSubMonth="";
const localLogs=[];         // demo mode

function taskInfo(key){
  const [code,rest]=key.split("_");
  const q=calc(cfg);
  const m=milestones(cfg,q).find(x=>x.id===code);
  if(m)return {code,task:m.t,rec:m.rec,plan:ymd(addDays(parseYmd(cfg.plantDate),m.w*7))};
  const r=routines(cfg).find(x=>x.id===code)||{t:code,rec:"田間作業紀錄"};
  const plan=!rest?"":rest.startsWith("w")?`定植後第${rest.slice(1)}週`:rest.startsWith("m")?rest.slice(1):rest;
  return {code,task:r.t,rec:r.rec,plan};
}
function addLocalLog(key,action,detail){   // demo mode only; online logs are written by Apps Script
  const info=taskInfo(key);
  localLogs.push({at:new Date().toISOString(),key,code:info.code,task:info.task,rec:info.rec,plan:String(info.plan),
    who:me||(isManagerView()?"管理者":"未具名"),role:isManagerView()?"manager":"staff",action,detail:detail||""});
  if(tab==="logs")render();
}
let logLoading=false;
function fetchLogs(force){
  if(!online||!isManagerView())return;
  if(!force&&logSubMonth===logMonth)return;
  const month=logMonth;
  if(logSubMonth!==month)logEntries=[];
  logSubMonth=month;logLoading=true;
  api("logs",{month}).then(j=>{
    if(month!==logMonth)return;
    logEntries=(j.logs||[]).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  }).catch(e=>{
    if(month===logMonth)logSubMonth="";
    if(e.error!=="auth")toast("無法讀取工作紀錄,請稍後再試");
  }).finally(()=>{if(month===logMonth){logLoading=false;scheduleRender();}});
}
function unsubscribeLogs(){logSubMonth="";logEntries=[];logLoading=false;}
function currentLogs(){
  const src=online?logEntries:localLogs.filter(e=>e.at.slice(0,7)===logMonth).sort((a,b)=>b.at.localeCompare(a.at));
  return src.filter(e=>(logRec==="all"||e.rec===logRec)&&(logWho==="all"||e.who===logWho)&&
    (logAct==="all"||(logAct==="done"&&/完成/.test(e.action)&&!/未完成/.test(e.action))||(logAct==="notdone"&&/未完成|異常/.test(e.action))||(logAct==="assign"&&e.action==="分派")||(logAct==="note"&&e.action==="備註")));
}
function fmtTime(iso){const d=new Date(iso);return `${ymd(d)} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}
function actClass(a){return /未完成|異常/.test(a)?"issue":/完成/.test(a)?"done":/進行中/.test(a)?"doing":"todo";}

function viewLogs(){
  fetchLogs(false);
  const rows=currentLogs();
  const base=online?logEntries:localLogs;
  const who=[...new Set(base.map(e=>e.who))].sort();
  const byRec=Object.fromEntries(REC_SHEETS.map(([r])=>[r,rows.filter(e=>e.rec===r).length]));
  return `<div class="logbar">
      <label class="field"><span>月份</span><input id="logMonth" type="month" value="${logMonth}"></label>
      <label class="field"><span>人員</span><select id="logWho"><option value="all">全部人員</option>${who.map(n=>`<option ${n===logWho?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
      <label class="field"><span>動作</span><select id="logAct">
        ${[["all","全部"],["done","完成"],["notdone","未完成/異常"],["assign","分派"],["note","備註"]].map(([v,l])=>`<option value="${v}" ${logAct===v?"selected":""}>${l}</option>`).join("")}</select></label>
      <div class="logbtns">
        ${online?`<button class="btn" id="refreshLogs">重新整理</button>`:""}
        ${online&&sheetUrl?`<a class="btn" href="${esc(sheetUrl)}" target="_blank" rel="noopener">開啟 Google 試算表</a>`:""}
        <button class="btn primary" id="exportLogs">匯出本月工作紀錄</button>
        <a class="btn" href="${PLAN_XLSX}" download="${PLAN_XLSX_NAME}">下載空白排程表</a>
      </div>
    </div>
    <div class="chips">${[["all",`全部 ${rows.length}`],...REC_SHEETS.map(([r])=>[r,`${r} ${byRec[r]}`])].map(([v,l])=>`<button class="chip" data-logrec="${esc(v)}" aria-pressed="${logRec===v}">${esc(l)}</button>`).join("")}</div>
    <p class="hint">員工回報與管理者的分派、狀態、備註都會自動寫入${online?" Google 試算表的「工作紀錄」分頁":"紀錄"},不需另外登打。用量、糖度、溫度等數值仍請填在計畫排程表的紀錄表中。</p>
    <div class="tablewrap"><table><thead><tr><th>時間</th><th>工作</th><th>紀錄表</th><th>預定</th><th>人員</th><th>動作</th><th>說明</th></tr></thead><tbody>
      ${rows.length?rows.map(e=>`<tr><td class="num">${fmtTime(e.at)}</td><td><span class="code">${esc(e.code)}</span> ${esc(e.task)}</td><td>${esc(e.rec)}</td><td class="num">${esc(e.plan)}</td>
        <td>${esc(e.who)}${e.role==="manager"?' <span class="tag">管理者</span>':""}</td><td><span class="st ${actClass(e.action)}">${esc(e.action)}</span></td><td>${esc(e.detail)}</td></tr>`).join("")
        :`<tr><td colspan="7" class="empty-msg">${logLoading?"正在讀取 Google 試算表…":`${logMonth} 沒有符合條件的紀錄。`}</td></tr>`}
    </tbody></table></div>`;
}

function loadSheetJS(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  return new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=()=>res(window.XLSX);s.onerror=rej;document.head.appendChild(s);});
}
async function exportLogs(){
  const rows=currentLogs().slice().reverse();
  if(!rows.length){toast("沒有可匯出的紀錄");return;}
  let X;try{X=await loadSheetJS();}catch(e){toast("無法載入 Excel 元件,請檢查網路");return;}
  const head=["日期","時間","工作編號","作業項目","紀錄表","預定日期/週","作業人員","身分","動作","說明(原因/備註/分派對象)"];
  const toRow=e=>{const d=new Date(e.at);return [ymd(d),`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`,e.code,e.task,e.rec,e.plan,e.who,e.role==="manager"?"管理者":"員工",e.action,e.detail];};
  const wb=X.utils.book_new();
  const add=(name,list)=>{const ws=X.utils.aoa_to_sheet([head,...list.map(toRow)]);ws["!cols"]=[12,7,9,22,14,14,10,7,12,40].map(w=>({wch:w}));ws["!autofilter"]={ref:`A1:J${list.length+1}`};X.utils.book_append_sheet(wb,ws,name);};
  add("全部紀錄",rows);
  REC_SHEETS.forEach(([r,sheet])=>add(sheet,rows.filter(e=>e.rec===r)));
  X.writeFile(wb,`工作紀錄_${logMonth}.xlsx`);
  toast("已匯出 Excel");
}

/* ---------- ui helpers ---------- */
const $=s=>document.querySelector(s);
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function showBanner(t){const b=$("#banner");b.textContent=t;b.hidden=false;}
let toastTimer;
function toast(t){const el=$("#toast");el.textContent=t;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,2200);}
function fmtAt(iso){if(!iso)return"";const d=new Date(iso);return md(d)+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}
function staffOptions(sel){
  const names=[...cfg.staff];
  if(sel&&!names.includes(sel))names.push(sel);
  return `<option value="">未分派</option>`+names.map(n=>`<option ${n===sel?"selected":""}>${esc(n)}</option>`).join("");
}
function srcLinks(t){return (t.src||[]).map(k=>SRC[k]?`<a href="${SRC[k][1]}" target="_blank" rel="noopener">${esc(SRC[k][0])}</a>`:"").filter(Boolean).join("、");}
function dateTag(t,late){return t.kind==="m"?`<span class="tag ${late?"late":""}">${late?"逾期・":""}預定 ${md(t.date)} 週</span>`:`<span class="tag">${FREQ_LABEL[t.freq]}</span>`;}
function reportTag(key){
  const r=reportMap[key];if(!r)return"";
  return r.result==="done"
    ?`<span class="tag rep-ok">員工回報完成・${esc(r.by)} ${fmtAt(r.at)}</span>`
    :`<span class="notepreview">✕ ${esc(r.by)} 回報未完成:${esc(r.reason)}</span>`;
}
function detailBlock(t){
  const srcs=srcLinks(t);
  return `<div class="how">${esc(t.how)}</div>
    <dl>
      ${t.chk?`<dt>完成判定</dt><dd>${esc(t.chk)}</dd>`:""}
      <dt>填寫紀錄</dt><dd>${esc(t.rec)}</dd>
      <dt>階段</dt><dd>${esc(t.stage)}</dd>
      ${srcs?`<dt>依據</dt><dd>${srcs}</dd>`:""}
    </dl>`;
}

/* ---------- manager rows ---------- */
function rowHTML(t,ctx){
  const s=st(t.key);
  const isOpen=open.has(t.key);
  const shown=s.status==="notdone"?"issue":s.status;
  const lastBy=s.at?`最後更新:${esc(s.by||"")} ${fmtAt(s.at)}`:"尚無更新";
  const mNote=(statusMap[t.key]||{}).note||"";
  return `<div class="row" data-s="${shown}" data-key="${esc(t.key)}">
    <div class="row-main">
      <div class="row-title">
        <span class="code">${esc(t.id)}</span>
        <button class="tname" data-act="toggle" aria-expanded="${isOpen}">${esc(t.t)}</button>
        ${dateTag(t,ctx==="overdue")}
        ${reportTag(t.key)}
        ${mNote&&s.status==="issue"&&!isOpen?`<span class="notepreview">⚠ ${esc(mNote)}</span>`:""}
      </div>
      <div class="row-act">
        <select class="assign ${s.assignee?"":"empty"}" data-act="assign" aria-label="分派給">${staffOptions(s.assignee)}</select>
        <div class="seg" role="group" aria-label="狀態">${STATUS.map(([v,l])=>`<button data-act="status" data-v="${v}" aria-pressed="${s.status===v}">${l}</button>`).join("")}</div>
      </div>
    </div>
    ${isOpen?`<div class="detail">${detailBlock(t)}
      <div class="note">
        <textarea id="note-${esc(t.key)}" placeholder="管理者備註:交辦重點、數量、異常處理…" data-note="${esc(t.key)}">${esc(mNote)}</textarea>
        <div class="bar"><button class="btn primary" data-act="savenote">儲存備註</button><span>${lastBy}</span></div>
      </div>
    </div>`:""}
  </div>`;
}
function passFilter(t){
  if(personFilter==="all")return true;
  const a=st(t.key).assignee||"";
  if(personFilter==="__none")return !a;
  return a===personFilter;
}
function groupHTML(title,items,ctx,emptyText,rowFn){
  rowFn=rowFn||rowHTML;
  if(!items.length&&!emptyText)return"";
  return `<section class="group ${ctx}"><h2>${title} <span class="count">${items.length}</span></h2>
    <div class="list">${items.length?items.map(t=>rowFn(t,ctx)).join(""):`<div class="empty-msg">${emptyText}</div>`}</div></section>`;
}

/* ---------- staff rows ---------- */
function staffRowHTML(t,ctx){
  const s=st(t.key);
  const r=reportMap[t.key];
  const isOpen=open.has(t.key);
  const asking=reasonOpen.has(t.key)||(s.status==="notdone");
  const shown=s.status==="notdone"?"issue":s.status;
  const mNote=(statusMap[t.key]||{}).note||"";
  const stateText=s.status==="done"?`<span class="st done">已完成${s.fromReport?"":"(管理者確認)"}</span>`
    :s.status==="notdone"?`<span class="st issue">未完成</span>`
    :s.status==="doing"?`<span class="st doing">進行中</span>`
    :s.status==="issue"?`<span class="st issue">管理者標示異常</span>`:"";
  return `<div class="row" data-s="${shown}" data-key="${esc(t.key)}">
    <div class="row-main">
      <div class="row-title">
        <span class="code">${esc(t.id)}</span>
        <button class="tname" data-act="toggle" aria-expanded="${isOpen}">${esc(t.t)}</button>
        ${dateTag(t,ctx==="overdue")} ${stateText}
      </div>
      <div class="row-act">
        <div class="checks" role="group" aria-label="回報">
          <button class="check ok" data-act="repdone" aria-pressed="${s.status==="done"}"><span class="box" aria-hidden="true">${s.status==="done"?"✓":""}</span>已完成</button>
          <button class="check no" data-act="repnot" aria-pressed="${asking}"><span class="box" aria-hidden="true">${asking?"✕":""}</span>尚未完成</button>
        </div>
      </div>
    </div>
    ${asking?`<div class="reason">
      <label for="reason-${esc(t.key)}">尚未完成的原因(必填)</label>
      <textarea id="reason-${esc(t.key)}" placeholder="例如:雨天無法進行、缺少資材、植株狀況異常需主管判斷…">${esc(r&&r.result==="notdone"?r.reason:"")}</textarea>
      <div class="bar"><button class="btn primary" data-act="sendreason">送出說明</button>${r&&r.result==="notdone"?`<span>已於 ${fmtAt(r.at)} 送出</span>`:""}</div>
    </div>`:""}
    ${isOpen?`<div class="detail">${detailBlock(t)}${mNote?`<div class="mnote"><b>管理者備註</b>${esc(mNote)}</div>`:""}</div>`:""}
  </div>`;
}

/* ---------- views ---------- */
function renderHeader(b){
  const c=cfg;const plant=parseYmd(c.plantDate);
  const d=b.dIdx;
  const dayText=d<0?`距定植 <b>${-d}</b> 天`:`定植後第 <b>${d}</b> 天`;
  $("#cropday").innerHTML=`<span>${viewDate.getFullYear()}/${md(viewDate)}(${WD[viewDate.getDay()]})${ymd(viewDate)===ymd(today)?" 今天":""}</span>
    <span>${dayText}・第 <b>${b.week}</b> 週</span><span class="stage-pill">${stageOf(b.week,c)}</span>
    <span>定植 ${md(plant)}・末採 ${md(addDays(plant,c.endWeek*7))}</span>`;
  $("#datePick").value=ymd(viewDate);
  const sel=$("#meSel");
  sel.innerHTML=`<option value="">選擇姓名</option>`+cfg.staff.map(n=>`<option ${n===me?"selected":""}>${esc(n)}</option>`).join("");
  const mgr=isManagerView();
  const tabs=mgr?[["today","今日工作"],["plan","全期進度"],["people","人員分工"],["logs","工作紀錄"],["settings","排程設定"]]:[["today","我的工作"],["plan","全期進度"]];
  if(!tabs.some(x=>x[0]===tab))tab="today";
  $("#tabs").innerHTML=tabs.map(([k,l])=>`<button role="tab" data-tab="${k}" aria-selected="${tab===k}">${l}</button>`).join("");
  const rb=$("#rolebar");
  if(mgr)rb.innerHTML=`<span class="rolepill">管理者</span>${online&&sheetUrl?`<a class="btn" href="${esc(sheetUrl)}" target="_blank" rel="noopener" title="開啟存放資料的 Google 試算表">Google 試算表</a>`:""}<a class="btn" href="${PLAN_XLSX}" download="${PLAN_XLSX_NAME}" title="下載空白的溫室土耕小番茄_種植工作計畫排程表(範本,不含網頁上的資料)">下載空白排程表</a><button class="btn" data-tab="logs">工作紀錄</button>${role==="local"?`<button class="btn" id="demoStaff">試用員工檢視</button>`:`<button class="btn" id="logoutMgr">登出管理者</button>`}`;
  else rb.innerHTML=`<span class="rolepill staffp">員工</span>${role==="local"?`<button class="btn" id="demoMgr">切回管理者檢視</button>`:`<button class="btn" id="openLogin" aria-expanded="${loginOpen}">管理者登入</button>`}`;
}

function viewToday(b){
  const items=[...b.overdue,...b.thisWeek,...b.daily,...b.weekly,...b.monthly];
  const cnt={todo:0,doing:0,done:0,issue:0,notdone:0};let unassigned=0;
  items.forEach(t=>{const s=st(t.key);cnt[s.status]=(cnt[s.status]||0)+1;if(!s.assignee&&s.status!=="done")unassigned++;});
  const pct=items.length?Math.round(cnt.done/items.length*100):0;
  const people=[["all","全部"],["__none","未分派"],...cfg.staff.map(n=>[n,n])];
  const noStaff=!cfg.staff.length?`<div class="banner">還沒有設定人員名單。到「排程設定」新增人員後,就能分派工作。 <button class="btn" data-goto="settings">前往設定</button></div>`:"";
  const f=xs=>xs.filter(passFilter);
  return `${noStaff}
    <div class="summary">
      <div class="stat"><span class="n">${items.length}</span><span class="l">今日應處理</span></div>
      <div class="stat done"><span class="n">${cnt.done}</span><span class="l">完成</span></div>
      <div class="stat doing"><span class="n">${cnt.doing}</span><span class="l">進行中</span></div>
      <div class="stat issue"><span class="n">${cnt.notdone}</span><span class="l">回報未完成</span></div>
      <div class="stat issue"><span class="n">${cnt.issue}</span><span class="l">異常</span></div>
      <div class="stat overdue"><span class="n">${b.overdue.length}</span><span class="l">逾期里程碑</span></div>
      <div class="stat"><span class="n">${unassigned}</span><span class="l">未分派</span></div>
    </div>
    <div class="progressline" aria-label="完成率 ${pct}%"><i style="width:${pct}%"></i></div>
    <div class="chips" style="margin-top:12px">${people.map(([v,l])=>`<button class="chip" data-person="${esc(v)}" aria-pressed="${personFilter===v}">${esc(l)}</button>`).join("")}</div>
    ${groupHTML("逾期未完成",f(b.overdue),"overdue")}
    ${groupHTML("本週里程碑",f(b.thisWeek),"week","本週沒有排定的里程碑工作。")}
    ${groupHTML("今日例行",f(b.daily),"daily",b.week<0?"尚未定植,每日例行工作從定植週開始。":"今日沒有例行工作。")}
    ${groupHTML("本週例行",f(b.weekly),"weekly")}
    ${groupHTML("本月例行",f(b.monthly),"monthly")}
    ${b.upcoming.length?`<section class="group"><h2>未來兩週預告 <span class="count">${b.upcoming.length}</span></h2><div class="list">${b.upcoming.map(t=>`<div class="row" data-s="${st(t.key).status}" data-key="${t.key}"><div class="row-main"><div class="row-title"><span class="code">${t.id}</span><span>${esc(t.t)}</span><span class="tag">預定 ${md(t.date)} 週</span></div><div class="row-act"><select class="assign ${st(t.key).assignee?"":"empty"}" data-act="assign" aria-label="預先分派">${staffOptions(st(t.key).assignee)}</select></div></div></div>`).join("")}</div></section>`:""}
    ${feedHTML(b)}`;
}
function feedHTML(b){
  const names=Object.fromEntries([...b.all,...routines(cfg)].map(t=>[t.id,t.t]));
  const label=k=>{const [id,rest]=k.split("_");let extra="";if(rest){extra=rest.startsWith("w")?`(第${rest.slice(1)}週)`:rest.startsWith("m")?`(${rest.slice(1)})`:`(${rest.slice(5)})`;}return (names[id]||id)+extra;};
  const ev=[
    ...Object.entries(statusMap).filter(([,v])=>v&&v.at).map(([k,v])=>({k,at:v.at,by:v.by,html:`<span class="st ${v.status}">${STATUS_LABEL[v.status]||""}</span>${v.assignee?`<span>→ ${esc(v.assignee)}</span>`:""}`})),
    ...Object.entries(reportMap).filter(([,v])=>v&&v.at).map(([k,v])=>({k,at:v.at,by:v.by,html:v.result==="done"?`<span class="st done">回報完成</span>`:`<span class="st issue">回報未完成</span><span>${esc(v.reason)}</span>`}))
  ].sort((a,c)=>c.at.localeCompare(a.at)).slice(0,15);
  return `<section class="feed"><div class="group"><h2>最近動態</h2></div>
    ${ev.length?`<ol>${ev.map(e=>`<li><time>${fmtAt(e.at)}</time><span>${esc(e.by||"")}</span><span>${esc(label(e.k))}</span>${e.html}</li>`).join("")}</ol>`:`<div class="list"><div class="empty-msg">還沒有人更新工作狀態。</div></div>`}
  </section>`;
}

function viewMine(b){
  if(!cfg.staff.length)return `<div class="banner">管理者尚未建立人員名單,請聯絡農場管理者。</div>`;
  if(!me||!cfg.staff.includes(me)){
    return `<div class="pickme"><h2>請先選擇你的姓名</h2><p class="hint">選好後會記在這台裝置,只顯示分派給你的工作。</p>
      <div class="chips">${cfg.staff.map(n=>`<button class="chip big" data-pickme="${esc(n)}">${esc(n)}</button>`).join("")}</div></div>`;
  }
  const mine=xs=>xs.filter(t=>(st(t.key).assignee||"")===me);
  const all=[...mine(b.overdue),...mine(b.thisWeek),...mine(b.daily),...mine(b.weekly),...mine(b.monthly)];
  const done=all.filter(t=>st(t.key).status==="done").length;
  const pct=all.length?Math.round(done/all.length*100):0;
  const up=mine(b.upcoming);
  return `<div class="summary">
      <div class="stat"><span class="n">${all.length}</span><span class="l">${esc(me)} 今日工作</span></div>
      <div class="stat done"><span class="n">${done}</span><span class="l">已完成</span></div>
      <div class="stat issue"><span class="n">${all.filter(t=>st(t.key).status==="notdone").length}</span><span class="l">未完成</span></div>
      <div class="stat overdue"><span class="n">${mine(b.overdue).length}</span><span class="l">逾期</span></div>
      <button class="btn" data-pickme="">不是 ${esc(me)}?切換</button>
    </div>
    <div class="progressline" aria-label="完成率 ${pct}%"><i style="width:${pct}%"></i></div>
    ${all.length?"":`<div class="list" style="margin-top:18px"><div class="empty-msg">今天沒有分派給你的工作。可以到「全期進度」查看整體排程。</div></div>`}
    ${groupHTML("逾期未完成",mine(b.overdue),"overdue",null,staffRowHTML)}
    ${groupHTML("本週工作",mine(b.thisWeek),"week",null,staffRowHTML)}
    ${groupHTML("今日例行",mine(b.daily),"daily",null,staffRowHTML)}
    ${groupHTML("本週例行",mine(b.weekly),"weekly",null,staffRowHTML)}
    ${groupHTML("本月例行",mine(b.monthly),"monthly",null,staffRowHTML)}
    ${up.length?`<section class="group"><h2>接下來兩週 <span class="count">${up.length}</span></h2><div class="list">${up.map(t=>`<div class="row" data-key="${t.key}"><div class="row-main"><div class="row-title"><span class="code">${t.id}</span><button class="tname" data-act="toggle">${esc(t.t)}</button><span class="tag">預定 ${md(t.date)} 週</span></div></div>${open.has(t.key)?`<div class="detail">${detailBlock(t)}</div>`:""}</div>`).join("")}</div></section>`:""}`;
}

function viewPlan(b){
  const mgr=isManagerView();
  const M=b.all;const order=["作前準備","定植緩苗","營養生長","開花著果","結果採收","作期末"];
  const cur=stageOf(b.week,cfg);
  const stageNow={"採收期":"結果採收","清園":"作期末","作後休閒":"作期末"}[cur]||cur;
  const cards=order.map(sn=>{const xs=M.filter(m=>m.stage===sn);const done=xs.filter(m=>st(m.key).status==="done").length;const pct=xs.length?Math.round(done/xs.length*100):0;
    return `<div class="stagecard ${sn===stageNow?"now":""}"><div class="t">${sn}${sn===stageNow?"・目前":""}</div><div class="v">${done}/${xs.length}</div><div class="progressline"><i style="width:${pct}%"></i></div></div>`;}).join("");
  const filters=[["all","全部"],["open","未完成"],["late","逾期"],["issue","異常/未完成"],["done","已完成"]];
  if(!mgr&&me&&cfg.staff.includes(me))filters.splice(1,0,["mine","我的"]);
  const rows=[...M].sort((a,c)=>a.w-c.w||a.id.localeCompare(c.id)).filter(m=>{const s=st(m.key).status;
    if(planFilter==="mine")return (st(m.key).assignee||"")===me;
    if(planFilter==="open")return s!=="done";if(planFilter==="late")return s!=="done"&&m.w<b.week;if(planFilter==="issue")return s==="issue"||s==="notdone";if(planFilter==="done")return s==="done";return true;});
  const label=s=>s==="notdone"?"未完成":STATUS_LABEL[s];
  return `${mgr?"":`<div class="readonly">全期進度僅供參考,無法修改。回報請到「我的工作」。</div>`}
    <div class="stages">${cards}</div>
    <div class="chips">${filters.map(([v,l])=>`<button class="chip" data-planf="${v}" aria-pressed="${planFilter===v}">${l}</button>`).join("")}</div>
    <div class="tablewrap"><table><thead><tr><th>預定週</th><th>週次</th><th>編號</th><th>工作</th><th>階段</th><th>負責人</th><th>狀態</th><th>說明</th></tr></thead><tbody>
    ${rows.map(m=>{const s=st(m.key);const late=m.w<b.week&&s.status!=="done";const cls=s.status==="notdone"?"issue":s.status;
      const expl=s.status==="notdone"?s.reason:((statusMap[m.key]||{}).note||"");
      return `<tr class="${m.w===b.week?"cur":""}" data-key="${m.key}">
      <td class="num">${md(m.date)}–${md(addDays(m.date,6))}</td><td class="num">${m.w}</td><td class="num">${m.id}</td>
      <td>${esc(m.t)}${late?` <span class="tag late">逾期</span>`:""}</td><td>${m.stage}</td>
      <td>${mgr?`<select class="assign ${s.assignee?"":"empty"}" data-act="assign" aria-label="分派給">${staffOptions(s.assignee)}</select>`:(s.assignee?esc(s.assignee):`<span class="hint">未分派</span>`)}</td>
      <td><span class="st ${cls}">${label(s.status)}</span></td><td>${esc(expl)}</td></tr>`;}).join("")}
    </tbody></table></div>`;
}

function viewPeople(b){
  const items=[...b.overdue,...b.thisWeek,...b.daily,...b.weekly,...b.monthly];
  if(!cfg.staff.length)return `<div class="banner">還沒有人員名單。 <button class="btn" data-goto="settings">到排程設定新增人員</button></div>`;
  const names=[...cfg.staff,"__none"];
  return `<div class="people">${names.map(n=>{
    const who=n==="__none"?"":n;
    const mine=items.filter(t=>(st(t.key).assignee||"")===who);
    const done=mine.filter(t=>st(t.key).status==="done").length;
    const bad=mine.filter(t=>["issue","notdone"].includes(st(t.key).status)).length;
    const openItems=mine.filter(t=>st(t.key).status!=="done");
    const lateAll=b.all.filter(m=>m.w<b.week&&st(m.key).status!=="done"&&(st(m.key).assignee||"")===who).length;
    return `<div class="person"><h3>${n==="__none"?"未分派":esc(n)}<span class="code">${mine.length?Math.round(done/mine.length*100):0}%</span></h3>
      <div class="nums"><span>今日 <b>${mine.length}</b></span><span>完成 <b>${done}</b></span><span>未完成/異常 <b>${bad}</b></span><span>逾期 <b>${lateAll}</b></span></div>
      <div class="progressline"><i style="width:${mine.length?done/mine.length*100:0}%"></i></div>
      ${openItems.length?`<ul>${openItems.map(t=>{const s=st(t.key);return `<li class="${b.overdue.includes(t)||s.status==="notdone"?"late":""}">${esc(t.t)}${s.status==="doing"?"(進行中)":s.status==="issue"?"(異常)":s.status==="notdone"?`(未完成:${esc(s.reason)})`:""}</li>`;}).join("")}</ul>`:`<div class="hint" style="margin:0">今日工作都已完成或尚無分派。</div>`}
    </div>`;}).join("")}</div>`;
}

function numField(id,label,val,step,min){return `<label class="field"><span>${label}</span><input id="${id}" type="number" step="${step||1}" ${min!=null?`min="${min}"`:""} value="${val}"></label>`;}
function viewSettings(){
  const c=cfg,q=calc(c);
  return `<form class="form" id="cfgForm">
    <fieldset><legend>作期時程</legend><div class="fgrid">
      <label class="field"><span>定植日期</span><input id="s-plantDate" type="date" value="${c.plantDate}"></label>
      ${numField("s-orderLead","訂苗提前週數(至少2)",c.orderLead,1,2)}
      ${numField("s-flowerWeek","首花週(定植後第幾週)",c.flowerWeek,1,0)}
      ${numField("s-harvestWeek","首採週(估計,轉色時修正)",c.harvestWeek,1,1)}
      ${numField("s-endWeek","末採週",c.endWeek,1,8)}
      ${numField("s-feedStart","追肥起始週",c.feedStart,1,1)}
      ${numField("s-feedInterval","追肥間隔(週)",c.feedInterval,1,1)}
      ${numField("s-feedCount","追肥次數",c.feedCount,1,1)}
      <label class="field"><span>授粉方式</span><select id="s-pollination">
        <option value="bee" ${c.pollination==="bee"?"selected":""}>熊蜂</option>
        <option value="hormone" ${c.pollination==="hormone"?"selected":""}>生長調節劑噴花</option>
        <option value="vibration" ${c.pollination==="vibration"?"selected":""}>振動授粉</option></select></label>
    </div><p class="hint">改定植日或週次後,所有預定日期會重新排定;已記錄的里程碑狀態會保留。</p></fieldset>
    <fieldset><legend>種植規格與施肥目標</legend><div class="fgrid">
      ${numField("s-area","種植區面積(m²)",c.area,1,1)}
      ${numField("s-bedSpacing","畦距(m)",c.bedSpacing,0.05,0.3)}
      ${numField("s-rowsPerBed","每畦行數",c.rowsPerBed,1,1)}
      ${numField("s-plantSpacing","株距(m)",c.plantSpacing,0.05,0.2)}
      ${numField("s-stems","整枝幹數",c.stems,1,1)}
      ${numField("s-targetN","N 目標(kg/公頃)",c.targetN,5,0)}
      ${numField("s-targetP","P₂O₅ 目標(kg/公頃)",c.targetP,5,0)}
      ${numField("s-targetK","K₂O 目標(kg/公頃)",c.targetK,5,0)}
    </div>
    <div class="calc" style="margin-top:12px">
      <div>定植株數<b>${q.plants.toLocaleString()}</b></div><div>訂苗數(含10%)<b>${q.order.toLocaleString()}</b></div>
      <div>每幹面積 m²<b>${q.m2PerStem.toFixed(2)}</b></div><div>黃色黏紙<b>${q.cards} 張</b></div>
      <div>熊蜂箱數<b>${q.beeMin}–${q.beeMax}</b></div><div>每次追肥 N / K₂O kg<b>${f1(q.tN)} / ${f1(q.tK)}</b></div>
    </div>
    <p class="hint">施肥目標預設為 TGAP 番茄建議量中間值(N 200–250、P₂O₅ 150–200、K₂O 120–180);每幹面積建議 0.33–0.56 m²。</p></fieldset>
    <div><button class="btn primary" type="submit" id="saveCfg">儲存排程設定</button></div>
  </form>
  <fieldset style="margin-top:18px"><legend>人員名單</legend>
    <div class="staffrow">${c.staff.length?c.staff.map(n=>`<span class="staff">${esc(n)}<button data-delstaff="${esc(n)}" aria-label="移除 ${esc(n)}">✕</button></span>`).join(""):`<span class="hint" style="margin:0">尚未新增人員</span>`}</div>
    <div class="addstaff"><input id="newStaff" placeholder="輸入姓名,例如:王小明" maxlength="20"><button class="btn primary" id="addStaffBtn">新增人員</button></div>
    <p class="hint">移除人員不會清掉已分派給他的工作,需要時請到全期進度改派。</p>
  </fieldset>
  <fieldset style="margin-top:18px"><legend>變更管理者密碼</legend>${role==="local"?`<p class="hint" style="margin-top:0">示範模式無法變更密碼。</p>`:""}
    <div class="fgrid">
      <label class="field"><span>目前密碼</span><input id="pw-cur" type="password" autocomplete="current-password"></label>
      <label class="field"><span>新密碼(至少 6 碼)</span><input id="pw-new" type="password" autocomplete="new-password"></label>
      <label class="field"><span>再輸入一次新密碼</span><input id="pw-new2" type="password" autocomplete="new-password"></label>
    </div>
    <div style="margin-top:10px"><button class="btn primary" id="changePw">變更密碼</button></div>
  </fieldset>`;
}

function loginHTML(){
  if(isManagerView()||!loginOpen)return"";
  return `<div class="login"><h2>管理者登入</h2>
    <form id="loginForm" class="loginbar">
      <label class="field" style="flex:1 1 200px"><span>管理者密碼</span><input id="pw-login" type="password" autocomplete="current-password"></label>
      <button class="btn primary" type="submit" id="loginBtn">登入</button><button class="btn" type="button" id="closeLogin">關閉</button>
    </form>
    <p class="hint">忘記密碼:打開 Google 試算表 →「擴充功能 → Apps Script」,上方選 resetPassword 按「執行」,密碼會回到當初設定的初始密碼。</p></div>`;
}
function render(){
  const b=build(viewDate);
  renderHeader(b);
  const mgr=isManagerView();
  if(role==="online"&&!loaded){
    $("#view").innerHTML=loginHTML()+`<div class="list" style="margin-top:18px"><div class="empty-msg">正在讀取 Google 試算表…</div></div>`;
    $("#meWrap").hidden=true;return;
  }
  let html="";
  if(tab==="plan")html=viewPlan(b);
  else if(mgr&&tab==="people")html=viewPeople(b);
  else if(mgr&&tab==="settings")html=viewSettings();
  else if(mgr&&tab==="logs")html=viewLogs();
  else html=mgr?viewToday(b):viewMine(b);
  $("#view").innerHTML=loginHTML()+html;
  $("#meWrap").hidden=!mgr&&!(me&&cfg.staff.includes(me));
}

/* ---------- demo: try the staff view ---------- */
function enterDemoStaff(){
  if(!cfg.staff.length){
    cfg={...cfg,staff:["王小明","李大華"]};
    const b=build(viewDate);let i=0;
    const at=new Date(Date.now()-60000).toISOString();
    [...b.overdue,...b.thisWeek,...b.daily,...b.weekly,...b.monthly,...b.upcoming].forEach(t=>{
      if(!(statusMap[t.key]||{}).assignee)statusMap={...statusMap,[t.key]:{status:"todo",assignee:cfg.staff[i++%2],note:"",by:"示範",at}};
    });
    toast("示範:已加入範例人員「王小明、李大華」並分派工作");
  }
  if(!cfg.staff.includes(me))me="";
  demoStaff=true;tab="today";loginOpen=false;
  render();window.scrollTo(0,0);
}

/* ---------- events ---------- */
document.addEventListener("click",e=>{
  const t=e.target.closest("button");if(!t)return;
  if(t.dataset.tab){tab=t.dataset.tab;planFilter="all";render();return;}
  if(t.dataset.goto){tab=t.dataset.goto;render();return;}
  if(t.dataset.pickme!=null){me=t.dataset.pickme;try{localStorage.setItem("tomato.me",me);}catch(_){}render();return;}
  if(t.id==="openLogin"){loginOpen=!loginOpen;render();const i=document.getElementById("pw-login");if(i)i.focus();return;}
  if(t.id==="closeLogin"){loginOpen=false;render();return;}
  if(t.id==="demoStaff"){enterDemoStaff();return;}
  if(t.id==="demoMgr"){demoStaff=false;tab="today";render();window.scrollTo(0,0);toast("已切回管理者檢視");return;}
  if(t.id==="logoutMgr"){if(online)api("logout").catch(()=>{});saveToken("");unsubscribeLogs();tab="today";loginOpen=false;render();toast("已登出管理者");return;}
  if(t.id==="refreshLogs"){fetchLogs(true);render();return;}
  if(t.id==="changePw"){
    const cur=$("#pw-cur").value,a=$("#pw-new").value,c2=$("#pw-new2").value;
    if(!online||!token){toast("示範模式無法變更密碼");return;}
    if(!cur){toast("請輸入目前密碼");return;}
    if(a.length<6){toast("新密碼至少 6 碼");return;}
    if(a!==c2){toast("兩次輸入的新密碼不一致");return;}
    t.disabled=true;
    api("changePw",{current:cur,next:a}).then(()=>{render();toast("已變更管理者密碼");})
      .catch(e=>{t.disabled=false;toast(apiErr(e));});
    return;}
  if(t.dataset.logrec){logRec=t.dataset.logrec;render();return;}
  if(t.id==="exportLogs"){exportLogs();return;}
  if(t.dataset.person!=null){personFilter=t.dataset.person;render();return;}
  if(t.dataset.planf){planFilter=t.dataset.planf;render();return;}
  if(t.dataset.delstaff){const n=t.dataset.delstaff;saveCfg({...cfg,staff:cfg.staff.filter(x=>x!==n)});return;}
  if(t.id==="addStaffBtn"){e.preventDefault();const inp=$("#newStaff");const n=inp.value.trim();if(!n)return;if(cfg.staff.includes(n)){toast("名單中已有此人");return;}saveCfg({...cfg,staff:[...cfg.staff,n]});return;}
  if(t.id==="prevDay"){viewDate=addDays(viewDate,-1);render();return;}
  if(t.id==="nextDay"){viewDate=addDays(viewDate,1);render();return;}
  if(t.id==="goToday"){viewDate=today;render();return;}
  const row=t.closest("[data-key]");if(!row)return;const key=row.dataset.key;
  if(t.dataset.act==="toggle"){open.has(key)?open.delete(key):open.add(key);render();return;}
  if(t.dataset.act==="status"&&isManagerView()){
    const cur=st(key);setStatus(key,{status:t.dataset.v,assignee:cur.assignee||""});
    if(t.dataset.v==="issue"){open.add(key);render();const ta=document.getElementById("note-"+key);if(ta)ta.focus();}
    return;}
  if(t.dataset.act==="savenote"&&isManagerView()){const ta=row.querySelector("textarea");setStatus(key,{note:ta.value.trim()});toast("已儲存備註");return;}
  if(t.dataset.act==="repdone"){reasonOpen.delete(key);setReport(key,"done","");return;}
  if(t.dataset.act==="repnot"){reasonOpen.add(key);render();const ta=document.getElementById("reason-"+key);if(ta)ta.focus();return;}
  if(t.dataset.act==="sendreason"){
    const ta=row.querySelector(".reason textarea");const v=ta.value.trim();
    if(!v){toast("請填寫尚未完成的原因");ta.focus();return;}
    reasonOpen.delete(key);setReport(key,"notdone",v);return;}
});
document.addEventListener("change",e=>{
  const el=e.target;
  if(el.id==="logMonth"&&el.value){logMonth=el.value;render();return;}
  if(el.id==="logWho"){logWho=el.value;render();return;}
  if(el.id==="logAct"){logAct=el.value;render();return;}
  if(el.id==="meSel"){me=el.value;try{localStorage.setItem("tomato.me",me);}catch(_){}render();return;}
  if(el.id==="datePick"&&el.value){viewDate=parseYmd(el.value);render();return;}
  if(el.dataset.act==="assign"&&isManagerView()){const key=el.closest("[data-key]").dataset.key;setStatus(key,{assignee:el.value});return;}
});
document.addEventListener("keydown",e=>{if(e.target.id==="newStaff"&&e.key==="Enter"){e.preventDefault();$("#addStaffBtn").click();}});
document.addEventListener("submit",e=>{
  if(e.target.id==="loginForm"){e.preventDefault();
    const pw=$("#pw-login").value;if(!pw)return;
    if(!online){toast("示範模式不需要登入");return;}
    $("#loginBtn").disabled=true;
    api("login",{password:pw})
      .then(j=>{saveToken(j.token,j.sheetUrl);loginOpen=false;tab="today";render();toast("已登入管理者");})
      .catch(e=>{toast(apiErr(e));const b=$("#loginBtn");if(b)b.disabled=false;const i=$("#pw-login");if(i)i.select();});
    return;}
  if(e.target.id!=="cfgForm")return;e.preventDefault();
  const v=id=>document.getElementById(id).value;const n=(id,min)=>{const x=Number(v(id));return Number.isFinite(x)?Math.max(min,x):cfg[id.slice(2)];};
  const next={...cfg,plantDate:v("s-plantDate")||cfg.plantDate,orderLead:Math.round(n("s-orderLead",2)),flowerWeek:Math.round(n("s-flowerWeek",0)),
    harvestWeek:Math.round(n("s-harvestWeek",1)),endWeek:Math.round(n("s-endWeek",8)),feedStart:Math.round(n("s-feedStart",1)),feedInterval:Math.round(n("s-feedInterval",1)),
    feedCount:Math.round(n("s-feedCount",1)),pollination:v("s-pollination"),area:n("s-area",1),bedSpacing:n("s-bedSpacing",0.3),rowsPerBed:Math.round(n("s-rowsPerBed",1)),
    plantSpacing:n("s-plantSpacing",0.2),stems:Math.round(n("s-stems",1)),targetN:n("s-targetN",0),targetP:n("s-targetP",0),targetK:n("s-targetK",0)};
  if(next.harvestWeek<=next.flowerWeek){toast("首採週需晚於首花週");return;}
  if(next.endWeek<=next.harvestWeek){toast("末採週需晚於首採週");return;}
  saveCfg(next);
});
setInterval(()=>{const t=parseYmd(ymd(new Date()));if(ymd(t)!==ymd(today)){const wasToday=ymd(viewDate)===ymd(today);today=t;if(wasToday)viewDate=t;scheduleRender();}},60000);

connect();

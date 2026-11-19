'use strict';
const C=window.REHAB_CONFIG, R=window.Rehab, $=id=>document.getElementById(id);
const demo=new URLSearchParams(location.search).get('demo')==='1';
const scope='https://www.googleapis.com/auth/spreadsheets';
let token='',expiry=0,client,ready=false,busy=false,pending=[],cloud=[],db=Object.create(null),names=R.exercises,timer;
const endpoint='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(C.spreadsheetId);
function status(message,kind='') { $('status').textContent=message; $('status').dataset.kind=kind; }
function enabled() { return demo || ready; }
function rebuild() { db=R.reduce([...cloud,...pending]); render(); }
function element(tag,text,className) { const e=document.createElement(tag); if(text!==undefined)e.textContent=text;if(className)e.className=className;return e; }
function controls() { for(const id of ['complete','clear','rpe','note','import'])$(id).disabled=!enabled(); $('refresh').disabled=demo||!token||busy; $('logout').hidden=!token; }
function render() {
  const date=$('date').value, record=db[date]||R.blank(), count=R.count(record);
  $('count').textContent=`已完成 ${count} / 6 項`;$('progress').value=count;
  if(document.activeElement!==$('note'))$('note').value=record.note;
  if(document.activeElement!==$('rpe'))$('rpe').value=String(record.rpe);
  const order=[...names];if($('unfinished').checked)order.sort((a,b)=>Number(record[a[0]])-Number(record[b[0]]));
  $('exercises').replaceChildren();
  for(const [key,zh,en,dose,tip] of order){
    const label=element('label',undefined,'exercise'+(record[key]?' done':'')), cb=element('input');cb.type='checkbox';cb.checked=record[key];cb.disabled=!enabled();cb.setAttribute('aria-label',zh);
    cb.addEventListener('change',()=>change(key,cb.checked));
    const body=element('div');body.append(element('strong',zh),element('small',en),element('span',dose,'dose'),element('small',tip));label.append(cb,body);$('exercises').append(label);
  }
  controls(); renderMonth();
}
function renderMonth(){
  const month=$('month').value;if(!/^\d{4}-\d{2}$/.test(month))return;
  const s=R.stats(db,month);$('days').textContent=s.days;$('full').textContent=s.full;$('rate').textContent=Math.round(s.rate*100)+'%';$('average').textContent='平均 RPE：'+(s.rpe===null?'—':s.rpe.toFixed(1));
  $('calendar').replaceChildren();for(const w of ['日','一','二','三','四','五','六'])$('calendar').append(element('div',w,'weekday'));
  const [y,m]=month.split('-').map(Number),first=new Date(y,m-1,1).getDay(),last=new Date(y,m,0).getDate();
  for(let i=0;i<first;i++)$('calendar').append(element('div'));
  for(let n=1;n<=last;n++){
    const date=month+'-'+String(n).padStart(2,'0'),count=R.count(db[date]||R.blank());const b=element('button',String(n),'day'+(count===6?' full':count?' partial':'')+(date===$('date').value?' selected':''));
    b.setAttribute('aria-label',`${date}，完成 ${count} 項`);if(count)b.append(element('small',`${count}/6`));b.onclick=()=>selectDate(date);$('calendar').append(b);
  }
  $('breakdown').replaceChildren();names.forEach((e,i)=>{const row=element('div',undefined,'metric');row.append(element('span',e[1]),element('b',s.counts[i]+' 天'));$('breakdown').append(row)});
  $('history').replaceChildren();if(!s.all.length)$('history').append(element('p',enabled()?'本月尚無訓練紀錄':'登入後顯示雲端紀錄','muted'));
  for(const [date,r] of [...s.all].reverse()) { const row=element('div',undefined,'historyRow'),b=element('button',date);b.onclick=()=>selectDate(date);row.append(b,element('span',`${R.count(r)}/6 · RPE ${r.rpe===''?'—':r.rpe}`));$('history').append(row); }
}
function selectDate(date) { if(!R.validDate(date))return;document.activeElement?.blur();$('date').value=date;render();window.scrollTo({top:0,behavior:'smooth'}); }
function change(field,value,date=$('date').value){
  if(!enabled()||!R.validDate(date)||!R.validValue(field,value)){status('請選擇有效日期與數值。','error');return;}
  pending.push([new Date().toISOString(),date,field,value,crypto.randomUUID()]);rebuild();
  if(demo){cloud.push(...pending);pending=[];status('試用模式：只在本頁示範，不會寫入 Google Sheet');return;}
  status(`有 ${pending.length} 項變更待同步`);clearTimeout(timer);timer=setTimeout(sync,800);
}
async function api(path,options={}){
  if(!token||Date.now()>=expiry){token='';controls();throw Error('登入已到期。請重新登入；待同步變更仍保留在本頁。');}
  let response;
  try { response=await fetch(endpoint+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000)}); }
  catch { throw Error('網路未完成回應。變更仍在本頁；恢復連線後按「重新整理／重試」。'); }
  if(response.status===401){token='';controls();throw Error('登入已到期，請重新登入。');}
  if(!response.ok){ const hint=response.status===403?'確認此帳號有試算表編輯權限、已啟用 Sheets API 並授予權限。':response.status===429?'要求太頻繁，稍後再重試。':'請確認試算表與分頁名稱未變更。';throw Error(`雲端回應 ${response.status}。${hint}`); }
  return response.json();
}
async function readCloud(){
  const ranges=["'同步紀錄'!A2:E","'動作設定'!A2:E7","'同步紀錄'!A1:E1"];
  const result=await api('/values:batchGet?'+ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&')+'&valueRenderOption=UNFORMATTED_VALUE');
  const [events,config,header]=result.valueRanges||[];
  if(JSON.stringify(header?.values?.[0])!==JSON.stringify(['送出時間（UTC）','訓練日期','欄位代碼','新值','變更識別碼']))throw Error('同步紀錄欄位不符，已停止寫入。');
  const conf=config?.values||[];
  if(conf.length!==6 || conf.some((r,i)=>r[0]!=='ex'+i || !r[1]))throw Error('動作設定必須保留 ex0 至 ex5 六個代碼與名稱。');
  names=conf.map(r=>Array.from({length:5},(_,i)=>String(r[i]??'')));cloud=events?.values||[];
  // Reconcile uncertain previous responses before retrying. Never resend accepted IDs.
  const accepted=new Set(cloud.map(r=>r[4]));pending=pending.filter(r=>!accepted.has(r[4]));
}
async function sync(){
  if(demo||busy)return;busy=true;controls();let success=false;
  try{
    status(pending.length?'同步中，請保持頁面開啟…':'讀取雲端紀錄…');await readCloud();ready=true;
    if(pending.length){
      const batch=pending.slice();
      await api('/values/'+encodeURIComponent("'同步紀錄'!A:E")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({majorDimension:'ROWS',values:batch})});
      await readCloud();
      const accepted=new Set(cloud.map(r=>r[4]));if(batch.some(r=>!accepted.has(r[4])))throw Error('尚未確認全部變更，請按重試。');
    }
    success=true;rebuild();status(pending.length?'還有變更待同步…':'已同步','ok');$('lastSync').textContent='最後確認：'+new Date().toLocaleString('zh-TW');
  }catch(e){status(e.message,'error');rebuild();}
  finally{busy=false;controls();if(success&&pending.length)timer=setTimeout(sync,500);}
  return success;
}
$('login').onclick=()=>{
  if(demo)return;
  if(!C.clientId){$('setup').hidden=false;status('請先完成 Google 登入設定。','error');return;}
  if(!window.google?.accounts?.oauth2){status('Google 登入元件尚未載入，請檢查網路後再試。','error');return;}
  client=google.accounts.oauth2.initTokenClient({client_id:C.clientId,scope,include_granted_scopes:false,callback:response=>{
    if(response.error){status('未完成授權，未寫入任何新資料。','error');return;}
    if(!google.accounts.oauth2.hasGrantedAllScopes(response,scope)){status('需要試算表權限才能同步。','error');return;}
    token=response.access_token;expiry=Date.now()+(Number(response.expires_in)-30)*1000;sync();
  },error_callback:()=>status('登入視窗未完成。請允許彈出視窗後再試。','error')});
  client.requestAccessToken({prompt:'select_account'});
};
$('refresh').onclick=sync;
$('logout').onclick=()=>{if(busy){status('同步進行中，請稍後登出。');return;}if(pending.length&&!confirm('尚有未同步變更。登出會清除本頁內容，確定登出？'))return;clearTimeout(timer);token='';expiry=0;ready=false;pending=[];cloud=[];rebuild();status('已登出，頁面資料已清除。');$('lastSync').textContent='';};
$('date').value=R.localDate();$('month').value=R.localDate().slice(0,7);
$('date').onchange=()=>{if(!R.validDate($('date').value)){$('date').value=R.localDate();}render();};$('month').onchange=renderMonth;$('unfinished').onchange=render;
$('rpe').onchange=()=>change('rpe',$('rpe').value===''?-1:Number($('rpe').value));$('note').oninput=()=>change('note',$('note').value);
$('complete').onclick=()=>R.fields.slice(0,6).forEach(f=>{if(!(db[$('date').value]||{})[f])change(f,true)});
$('clear').onclick=()=>{if(confirm('清除這一天的六項勾選？RPE 與備註會保留。'))R.fields.slice(0,6).forEach(f=>{if((db[$('date').value]||{})[f])change(f,false)});};
function download(name,content,type){const a=element('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('csv').onclick=()=>download('頸肩復健_'+$('month').value+'.csv',R.csv(db,$('month').value,names),'text/csv;charset=utf-8');
$('backup').onclick=()=>download('頸肩復健_'+R.localDate()+'.json',JSON.stringify({app:'neck_rehab_v2',records:db,pendingChanges:pending,exportedAt:new Date().toISOString()},null,2),'application/json');
$('import').onclick=()=>$('file').click();
$('file').onchange=async()=>{
  const file=$('file').files[0];if(!file)return;
  try{
    if(file.size>2e6)throw Error('檔案超過 2 MB。');const data=JSON.parse(await file.text());
    if(!['neck_rehab_v1','neck_rehab_v2'].includes(data.app)||!data.records||Array.isArray(data.records))throw Error('備份格式不符。');
    if(!demo){const synced=await sync();if(!synced||!token||busy||pending.length)throw Error('請先完成雲端同步，再匯入。');}
    const rows=[];let skipped=0;
    for(const [date,record] of Object.entries(data.records)){
      if(!R.validDate(date)||!record||typeof record!=='object')throw Error('備份日期或紀錄格式不符。');
      if(db[date]){skipped++;continue;}
      const r=data.app==='neck_rehab_v1'?{...R.blank(),...Object.fromEntries(R.fields.slice(0,6).map((f,i)=>[f,Array.isArray(record.done)&&record.done.includes(i)])),note:record.note||''}:record;
      for(const f of R.fields){const v=f==='rpe'&&r[f]===''?-1:r[f];if(!R.validValue(f,v))throw Error('備份欄位不符。');rows.push([date,f,v]);}
    }
    if(!rows.length){status(`沒有可新增日期；略過 ${skipped} 個已有日期。`);return;}
    if(!confirm(`新增 ${rows.length/8} 個日期；略過 ${skipped} 個已有日期，不覆寫。確定匯入？`))return;
    rows.forEach(([d,f,v])=>change(f,v,d));
  }catch(e){status('無法匯入：'+e.message,'error');}finally{$('file').value='';}
};
window.addEventListener('beforeunload',e=>{if(pending.length){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token&&!pending.length&&!busy)sync();});
setInterval(()=>{if(!document.hidden&&token&&!pending.length&&!busy)sync();},60000);
$('sheetLink').href='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(C.spreadsheetId)+'/edit';
if(demo){document.body.classList.add('demo');$('login').hidden=true;ready=true;const d=R.localDate();cloud=R.fields.slice(0,3).map((f,i)=>[new Date().toISOString(),d,f,true,'demo-'+i]);status('試用模式：只在本頁示範，不會寫入 Google Sheet');}
else{$('setup').hidden=!!C.clientId;status(C.clientId?'請登入 Google，讀取你的雲端紀錄。':'網站已備妥，待完成 Google 登入設定。');}
rebuild();

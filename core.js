(function(root) {
  'use strict';
  const fields = ['ex0','ex1','ex2','ex3','ex4','ex5','rpe','note'];
  const exercises = [
    ['ex0','胸靠式划船','Chest-supported row','3 組 × 12 下','頸部中立，肩胛自然後收'],
    ['ex1','上斜椅 Y 字抬手','Incline prone Y raise','2 組 × 12 下','不仰頭、不刻意聳肩'],
    ['ex2','滑輪前鋸肌推拳','Cable serratus punch','3 組 × 12 下／側','肩胛自然前引，軀幹不旋轉'],
    ['ex3','坐姿中立握啞鈴肩推','Seated neutral-grip DB press','2 組 × 12 下','掌心相對，頸部中立'],
    ['ex4','滑輪面拉','Cable face pull','2 組 × 15 下','不前伸頭部'],
    ['ex5','頸部等長收縮','Cervical isometric','2 組 × 5 次','原菜單：每次 5 秒，約 20–30% 主觀出力'],
  ];
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s+'T12:00:00Z')) && new Date(s+'T12:00:00Z').toISOString().slice(0,10) === s; }
  function localDate(d=new Date()) { return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); }
  function blank() { return {ex0:false,ex1:false,ex2:false,ex3:false,ex4:false,ex5:false,rpe:'',note:''}; }
  function validValue(f,v) { return fields.includes(f) && (f.startsWith('ex') ? typeof v==='boolean' : f==='rpe' ? v===-1 || (typeof v==='number' && Number.isInteger(v) && v>=0 && v<=10) : typeof v==='string' && v.length<=2000); }
  function reduce(rows) {
    const db = Object.create(null);
    // Server row order is authoritative. A change touches only its own field.
    for(const r of rows) {
      if(!Array.isArray(r)) continue;
      const [,date,field,value] = r;
      const v=field==='note' && value===undefined ? '' : value;
      if(!validDate(date) || !validValue(field,v)) continue;
      if(!db[date]) db[date]=blank();
      db[date][field] = field==='rpe' && v===-1 ? '' : v;
    }
    return db;
  }
  function count(r) { return fields.slice(0,6).filter(f=>r[f]===true).length; }
  function stats(db,month) {
    const all=Object.entries(db).filter(([d])=>d.startsWith(month+'-')).sort(([a],[b])=>a.localeCompare(b));
    const active=all.filter(([,r])=>count(r)>0), values=active.map(([,r])=>r.rpe).filter(v=>typeof v==='number');
    return {all,days:active.length,full:active.filter(([,r])=>count(r)===6).length,rate:active.length?active.reduce((n,[,r])=>n+count(r),0)/(6*active.length):0,rpe:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,counts:fields.slice(0,6).map(f=>active.filter(([,r])=>r[f]).length)};
  }
  function csvCell(value) { let s=String(value??''); if(/^[\s]*[=+\-@\t\r]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; }
  function csv(db,month,names=exercises) { return '\ufeff'+[['日期',...names.map(x=>x[1]),'RPE','備註','完成項數'],...stats(db,month).all.map(([d,r])=>[d,...fields.slice(0,6).map(f=>r[f]?'完成':''),r.rpe,r.note,count(r)])].map(row=>row.map(csvCell).join(',')).join('\r\n'); }
  const api={fields,exercises,validDate,localDate,blank,validValue,reduce,count,stats,csv};
  if(typeof module!=='undefined') module.exports=api; else root.Rehab=api;
})(typeof window!=='undefined'?window:this);

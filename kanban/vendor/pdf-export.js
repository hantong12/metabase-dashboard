/* 详情页导出 PDF（浏览器内直出）。由 template_board.html 动态加载；相对路径优先，失败回退 GitHub Pages。 */
(function(){
var btn=document.getElementById('pdfFab'), tip=document.getElementById('pdfTip');
if(!btn) return;
var IDLE=btn.innerHTML, busy=false, tipTimer=0;
function showTip(ms){ if(!tip) return; tip.classList.add('show'); clearTimeout(tipTimer); tipTimer=setTimeout(function(){tip.classList.remove('show');}, ms||5200); }
function idle(){ busy=false; btn.disabled=false; btn.innerHTML=IDLE; }
function label(t){ btn.innerHTML='<span>'+t+'</span>'; }
/* 超宽表格（如「客服账号 vs 行业标杆」在账号多时有几十上百列）：
   1) 列数多 → 按实测列宽拆成若干张分表，各分表都保留指标列与「行业标杆」列；
   2) 拆不了或拆完仍超宽 → 固定布局压回容器宽度（html2canvas 不认 zoom，不能用缩放兜底）；
   3) 列数太多导致单列不足 40px → 省略并给出说明。 */
var PRINT_AVAIL=1029, MIN_KEEP=0.6, SPLIT_MAX=16, SPLIT_MIN_COLS=20;
function colW(t,i){
  var w=0,k,rows=t.rows;
  for(k=0;k<Math.min(rows.length,3);k++){
    var c=rows[k].cells[i];
    if(c) w=Math.max(w,c.getBoundingClientRect().width);
  }
  return w;
}
function splitWide(w,t){
  var head=t.tHead&&t.tHead.rows[0];
  if(!head||!t.tBodies.length) return false;
  var n=head.cells.length;
  if(n<SPLIT_MIN_COLS) return false;
  var bench=/行业标杆/.test(head.cells[n-1].textContent||'');
  var dS=1, dE=bench?n-1:n, dN=dE-dS;
  if(dN<=SPLIT_MAX) return false;
  if(w.getAttribute('data-pdf-split')) return true;
  var rows=[].slice.call(t.tBodies[0].rows);
  var frag=document.createDocumentFragment();
  /* 按实测列宽累加定每组列数：每账号占 2 列（8月/9月），组宽取偶数，避免把账号拆到两张表 */
  var budget=PRINT_AVAIL-colW(t,0)-(bench?colW(t,n-1):0)-10;
  var acc=0,per=0,q,cw=0;
  for(q=0;q<dN;q++){
    cw=colW(t,dS+q);
    if(acc+cw>budget) break;
    acc+=cw; per++;
  }
  per=Math.max(2,Math.floor(per/2)*2);
  if(per>SPLIT_MAX) per=SPLIT_MAX;
  /* 账号极多时（如 553 个账号 × 1108 列）拆完是上千页马赛克，PDF 里没有可读性，直接省略 */
  if(Math.ceil(dN/per)*rows.length>1200) return 'omit';
  for(var s=0;s<dN;s+=per){
    var cols=[0], i, ii;
    for(i=s;i<Math.min(s+per,dN);i++) cols.push(dS+i);
    if(bench) cols.push(n-1);
    var box=document.createElement('div');
    box.className='table-wrap pdf-split';
    var nt=t.cloneNode(false);
    var th=document.createElement('thead'), trh=document.createElement('tr');
    for(ii=0;ii<cols.length;ii++) trh.appendChild(head.cells[cols[ii]].cloneNode(true));
    th.appendChild(trh); nt.appendChild(th);
    var tb=document.createElement('tbody');
    for(var r=0;r<rows.length;r++){
      var tr=document.createElement('tr');
      for(ii=0;ii<cols.length;ii++){
        var cell=rows[r].cells[cols[ii]];
        tr.appendChild(cell?cell.cloneNode(true):document.createElement('td'));
      }
      tb.appendChild(tr);
    }
    nt.appendChild(tb);
    box.appendChild(nt);
    frag.appendChild(box);
  }
  w.parentNode.insertBefore(frag,w.nextSibling);
  w.setAttribute('data-pdf-split','1');
  return true;
}
function fitTables(root){
  var wraps=(root||document).querySelectorAll('.table-wrap');
  for(var k=0;k<wraps.length;k++){
    var w=wraps[k];
    if(w.classList && w.classList.contains('pdf-split')) continue;
    var t=w.firstElementChild;
    if(!t || t.tagName!=='TABLE') continue;
    t.style.zoom='';
    if(w.getAttribute('data-pdf-wide')) continue;
    var ww=w.clientWidth, tw=t.scrollWidth;
    if(!ww || tw<=ww+2) continue;
    var sp=splitWide(w,t);
    if(sp===true) continue;
    var z=PRINT_AVAIL/tw;
    if(z<MIN_KEEP||sp==='omit'){
      var note=w.nextElementSibling;
      if(!note || !note.className || String(note.className).indexOf('pdf-wide-note')<0){
        note=document.createElement('div');
        note.className='pdf-wide-note';
        w.parentNode.insertBefore(note,w.nextSibling);
      }
      var cols=(t.tHead && t.tHead.rows[0]) ? t.tHead.rows[0].cells.length : 0;
      var rws=t.tBodies.length?t.tBodies[0].rows.length:0;
      note.textContent='（本表共 '+cols+' 列、'+rws+' 行，在 A4 版面上无法排版呈现，PDF 中已省略；完整明细请在网页端横向查看）';
      w.setAttribute('data-pdf-wide','1');
    }else{
      /* html2canvas 不认 zoom，改用固定布局把表压回容器宽 */
      t.setAttribute('data-pdf-fixed','1');
      t.style.tableLayout='fixed';
      t.style.width='100%';
      if(z<0.94){
        var fs=parseFloat(getComputedStyle(t).fontSize)||13;
        t.style.fontSize=Math.max(9,fs*Math.max(0.74,z)).toFixed(1)+'px';
      }
    }
  }
}
/* ================= 导出 PDF 文件（浏览器内直出，不走打印对话框） ================= */
var PAD=8, PW=297-PAD*2, PH=210-PAD*2, STAGE_W=1063, SCALE=2;
var CSS_PAGE_H=Math.floor(STAGE_W*PH/PW)-8;
var LIB_CDN='https://hantong12.github.io/metabase-dashboard/kanban/vendor/';
var SRC=null;
function frame(){ return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); }
function wait(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }

function loadScript(urls){
  return new Promise(function(res,rej){
    var i=0;
    (function next(){
      if(i>=urls.length) return rej(new Error('组件加载失败'));
      var s=document.createElement('script'); s.src=urls[i++]; s.async=false;
      s.onload=function(){ res(); };
      s.onerror=function(){ if(s.parentNode) s.parentNode.removeChild(s); next(); };
      document.head.appendChild(s);
    })();
  });
}
function loadLibs(){
  var jobs=[];
  if(typeof window.html2canvas!=='function') jobs.push(loadScript(['vendor/html2canvas.min.js', LIB_CDN+'html2canvas.min.js']));
  if(!(window.jspdf&&window.jspdf.jsPDF)) jobs.push(loadScript(['vendor/jspdf.umd.min.js', LIB_CDN+'jspdf.umd.min.js']));
  return Promise.all(jobs);
}

/* Chart.js 的画布不会随 cloneNode 复制位图：导出前按 data-cv 存成 dataURL，每页渲染前贴回去 */
var CVIMG={};
function snapCanvas(root){
  var i=0;
  [].forEach.call(root.querySelectorAll('canvas'),function(c){
    var k='c'+(i++);
    c.setAttribute('data-cv',k);
    try{ if(c.width&&c.height) CVIMG[k]=c.toDataURL('image/png'); }catch(e){}
  });
}
function paintCanvas(dst){
  var list=[].slice.call(dst.querySelectorAll('canvas')).filter(function(c){ return CVIMG[c.getAttribute('data-cv')]; });
  if(!list.length) return Promise.resolve();
  return Promise.all(list.map(function(c){
    return new Promise(function(res){
      var img=new Image();
      img.onload=function(){
        try{ c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext('2d').drawImage(img,0,0); }catch(e){}
        res();
      };
      img.onerror=function(){ res(); };
      img.src=CVIMG[c.getAttribute('data-cv')];
    });
  }));
}

/* 只保留「根节点 → 目标节点」这条路径的骨架，路径上各层保留目标之前的兄弟（标题等）；
   skip 里的节点是同一区块的其他分表，不能重复带进来 */
function skeleton(root,target,skip){
  var path=[],n=target;
  while(n&&n!==root){ path.unshift(n); n=n.parentNode; }
  if(n!==root) return null;
  var c=root.cloneNode(false); c.removeAttribute('id');
  var src=root,dst=c;
  for(var i=0;i<path.length;i++){
    var sibs=[].slice.call(src.childNodes);
    for(var j=0;j<sibs.length;j++){
      if(sibs[j]===path[i]) break;
      if(skip&&skip.length&&skip.indexOf(sibs[j])>=0) continue;
      dst.appendChild(sibs[j].cloneNode(true));
    }
    var shell=path[i].cloneNode(false);
    shell.removeAttribute('id');
    if(shell.hasAttribute){
      if(shell.hasAttribute('data-pdf-split')) shell.removeAttribute('data-pdf-split');
      if(shell.hasAttribute('data-pdf-wide')) shell.removeAttribute('data-pdf-wide');
    }
    dst.appendChild(shell); src=path[i]; dst=shell;
  }
  return {root:c,holder:dst};
}
function markCont(root){
  var h=root.querySelector('.section-title')||root.querySelector('h2')||root.querySelector('h3');
  if(!h||/（续）/.test(h.textContent)) return;
  var s=document.createElement('span');
  s.textContent='（续）';
  s.style.cssText='opacity:.5;font-weight:400;font-size:.88em;margin-left:4px';
  h.appendChild(s);
}

/* 量一个区块：高度 + 可切列表（表格按可见分表拆成多段；雷达区按卡片行切） */
function analyze(el){
  var info={h:el.offsetHeight,mb:parseInt(getComputedStyle(el).marginBottom,10)||0,kind:null,parts:[]};
  var rg=el.querySelector('.radar-grid');
  if(rg&&rg.offsetHeight>0){
    var cards=[].slice.call(rg.children).filter(function(c){ return c.offsetHeight>0; });
    if(cards.length>=4){
      var rh=0,i;
      var per=Math.max(1,Math.floor((rg.offsetWidth+12)/250));
      for(i=0;i<Math.min(per,cards.length);i++) rh=Math.max(rh,cards[i].offsetHeight);
      info.kind='grid'; info.holder=rg; info.cards=cards; info.rowH=rh+12; info.perRow=per;
      info.prefixH=Math.max(0,el.offsetHeight-rg.offsetHeight);
      return info;
    }
  }
  var wraps=[].slice.call(el.querySelectorAll('.table-wrap')).filter(function(w){ return w.offsetHeight>0; });
  var tot=0;
  for(var k=0;k<wraps.length;k++){
    var w=wraps[k], tbl=w.querySelector('table');
    if(!tbl||!tbl.tBodies.length) continue;
    var rows=[].slice.call(tbl.tBodies[0].rows);
    if(!rows.length) continue;
    var th=tbl.tHead;
    info.parts.push({
      target:w, tbl:tbl, thead:th, rows:rows,
      theadH:th?th.offsetHeight:0,
      rowH:Math.max(8,tbl.tBodies[0].offsetHeight/Math.max(1,rows.length))
    });
    tot+=w.offsetHeight;
  }
  if(!info.parts.length) return info;
  info.kind='table';
  info.targets=info.parts.map(function(p){ return p.target; });
  info.titleEl=el.querySelector('.section-title')||el.querySelector('h2')||el.querySelector('h3');
  info.prefixH=Math.max(0,el.offsetHeight-tot);
  return info;
}

/* 生成一片：pi=第几段表格 / ri=该段第几行起；forceN 精确指定行数（回退/尾片用）；noTitle 不带区块标题 */
function makePiece(info,pi,ri,capH,first,forceN,noTitle){
  var sk,node,i,n,skip;
  if(info.kind==='table'){
    var part=info.parts[pi];
    var pre=first?info.prefixH:18;
    var avail=capH-pre-part.theadH-info.mb-14;
    n=Math.max(1,Math.min(part.rows.length-ri,Math.floor(avail/part.rowH)));
    if(forceN) n=Math.max(1,Math.min(part.rows.length-ri,forceN));
    skip=info.targets?info.targets.slice():[];
    if(noTitle&&info.titleEl) skip.push(info.titleEl);
    sk=skeleton(info.el,part.target,skip);
    if(!sk) return null;
    var box=part.target.cloneNode(false);
    var t=part.tbl.cloneNode(false);
    if(part.thead) t.appendChild(part.thead.cloneNode(true));
    var tb=document.createElement('tbody');
    for(i=0;i<n;i++) tb.appendChild(part.rows[ri+i].cloneNode(true));
    t.appendChild(tb); box.appendChild(t); sk.holder.appendChild(box);
    node=sk.root;
  }else{
    var capG=capH-(first?info.prefixH:18)-info.mb-14;
    var rowN=Math.max(1,Math.floor(capG/info.rowH));
    n=Math.max(1,Math.min(info.cards.length-ri,rowN*info.perRow));
    if(forceN) n=Math.max(1,Math.min(info.cards.length-ri,forceN));
    sk=skeleton(info.el,info.holder,[]);
    if(!sk) return null;
    var g=info.holder.cloneNode(false);
    for(i=0;i<n;i++) g.appendChild(info.cards[ri+i].cloneNode(true));
    sk.holder.appendChild(g);
    node=sk.root;
  }
  if(!first) markCont(node);
  return {node:node,used:n};
}
function measureOne(node,stage){
  var box=document.createElement('div'); box.className='pdf-page';
  box.appendChild(node);
  stage.innerHTML=''; stage.appendChild(box);
  var cs=getComputedStyle(node);
  var mt=parseInt(cs.marginTop,10)||0, mb=parseInt(cs.marginBottom,10)||0;
  return node.offsetHeight+Math.max(mt,mb);
}
/* 装箱：能整块放就整块放；放不下且可切就按当前页剩余空间切片，切完实测再决定 */
function paginate(units,stage){
  var pages=[],cur=[],used=0,log=[];
  function flush(){ if(cur.length){ pages.push(cur); log.push(used); cur=[]; used=0; } }
  function put(n,h){ cur.push(n); used+=h; }
  for(var i=0;i<units.length;i++){
    var u=units[i], need=u.h+u.mb;
    if(used+need<=CSS_PAGE_H){ put(u.node,need); continue; }
    if(u.kind!=='table'&&u.kind!=='grid'){ flush(); put(u.node,need); continue; }
    /* 雷达区：先用一行卡片实测行高，避免按错误估算一页只放一行 */
    if(u.kind==='grid'&&!u.rowCal){
      var pr=makePiece(u,0,0,CSS_PAGE_H*2,true,Math.min(u.perRow,u.cards.length));
      if(pr&&pr.used){
        var ph=measureOne(pr.node,stage);
        u.rowH=Math.max(90,ph-u.prefixH-u.mb)+12;
      }
      u.rowCal=1;
    }
    var pi=0, ri=0, first=true, guard=0, done=false;
    while(!done&&guard++<900){
      var rest=CSS_PAGE_H-used;
      if(cur.length&&rest<CSS_PAGE_H*0.32){ flush(); rest=CSS_PAGE_H; }
      if(rest<90){ flush(); rest=CSS_PAGE_H; }
      var p=makePiece(u,pi,ri,rest,first,null,pi>0&&cur.length>0);
      if(!p||!p.used) break;
      var h=measureOne(p.node,stage);
      /* 估算行数与实测有偏差时，按实测比例回退行数，避免为了几像素就整页换白 */
      var tries=0;
      while(h>rest+2&&tries++<4&&p.used>1){
        var n2=Math.max(1,Math.floor(p.used*(rest-8)/h));
        if(n2>=p.used) n2=p.used-1;
        var p2=makePiece(u,pi,ri,rest,first,n2,pi>0&&cur.length>0);
        if(!p2||!p2.used) break;
        var h2=measureOne(p2.node,stage);
        if(h2<=rest+2||h2<h){ p=p2; h=h2; } else break;
      }
      if(h>rest+4&&cur.length){
        flush();
        p=makePiece(u,pi,ri,CSS_PAGE_H,first,null,pi>0);
        if(!p||!p.used) break;
        h=measureOne(p.node,stage);
      }
      put(p.node,h); ri+=p.used; first=false;
      if(u.kind==='grid'){
        if(ri>=u.cards.length) done=true;
      }else if(ri>=u.parts[pi].rows.length){
        pi++; ri=0; if(pi>=u.parts.length) done=true;
      }
      if(CSS_PAGE_H-used<12) flush();
    }
    if(CSS_PAGE_H-used<12) flush();
  }
  flush();
  return pages;
}

async function renderPages(pages,pdf,stage){
  for(var i=0;i<pages.length;i++){
    var box=document.createElement('div');
    box.className='pdf-page';
    for(var j=0;j<pages[i].length;j++) box.appendChild(pages[i][j]);
    stage.innerHTML=''; stage.appendChild(box);
    await frame(); await wait(30);
    await paintCanvas(box);
    var cv=await window.html2canvas(box,{
      scale:SCALE, backgroundColor:'#ffffff', useCORS:true, logging:false,
      width:STAGE_W, height:Math.max(1,box.offsetHeight),
      windowWidth:Math.max(1200,STAGE_W), scrollX:0, scrollY:0
    });
    var imgW=PW, imgH=cv.height*PW/cv.width;
    if(imgH>PH){ imgW=imgW*(PH/imgH); imgH=PH; }
    if(i>0) pdf.addPage();
    pdf.addImage(cv.toDataURL('image/jpeg',0.86),'JPEG',PAD,PAD,imgW,imgH);
    label('生成中 '+(i+1)+'/'+pages.length);
    await frame();
  }
}
function pdfName(){
  var name='', period='';
  try{
    var ut=document.querySelector('.header .update-time');
    if(ut){
      var m=/客户[:：]\s*([^\n]+)/.exec(ut.textContent||'');
      if(m) name=m[1].replace(/[（(]?\s*org[._]?id\s*=\s*\d+\s*[）)]?/gi,'').replace(/[（(]\s*[）)]/g,'').replace(/\s+/g,' ').trim();
    }
    var p=document.querySelector('.header p')||document.querySelector('.header h1');
    if(p){
      var pm=/(\d+\s*-\s*\d+\s*月|\d+\s*月)/.exec(p.textContent||'');
      if(pm) period=pm[1].replace(/\s+/g,'');
    }
  }catch(e){}
  if(!name){
    var t=(document.title||'').replace(/^\s*客服表现数据看板\s*-\s*/,'').trim();
    if(t&&t!=='客服表现数据看板') name=t;
  }
  var s='客服表现看板';
  if(name) s+='_'+name;
  if(period) s+='_'+period;
  return s.replace(/[\\/:*?"<>|]/g,'_').slice(0,120)+'.pdf';
}
function tipText(html,ms){
  if(!tip) return;
  tip.innerHTML=html; tip.classList.add('show');
  clearTimeout(tipTimer);
  tipTimer=setTimeout(function(){ tip.classList.remove('show'); }, ms||6000);
}

async function start(){
  if(busy) return;
  busy=true; btn.disabled=true;
  var stage=null, t0=Date.now();
  try{
    label('加载组件…');
    tipText('正在浏览器中生成 <b>PDF 文件</b>，完成后自动下载，请稍候……',15000);
    await loadLibs();
    if(typeof window.html2canvas!=='function'||!(window.jspdf&&window.jspdf.jsPDF)) throw new Error('组件加载失败');

    label('准备图表…');
    var n=(typeof agentData!=='undefined'&&agentData&&agentData.length)?agentData.length:0;
    if(n&&typeof window.__drawRadarOne==='function'){
      for(var k=0;k<n;k++){ try{ window.__drawRadarOne(k); }catch(e){} }
    }
    await frame();

    label('排版中…');
    SRC=document.querySelector('.container');
    snapCanvas(SRC);
    var copy=SRC.cloneNode(true);
    copy.removeAttribute('id');
    stage=document.createElement('div'); stage.id='pdfStage';
    var wrap=document.createElement('div'); wrap.className='container';
    wrap.appendChild(copy); stage.appendChild(wrap);
    document.body.appendChild(stage);
    await frame(); await wait(60);

    try{ fitTables(copy); }catch(e){}
    await frame(); await wait(60);

    label('分页中…');
    var units=[].slice.call(copy.children).map(function(el){
      var info=analyze(el); info.el=el; info.node=el; return info;
    });
    var pages=paginate(units,stage);
    if(!pages.length) throw new Error('页面无内容');

    label('生成中 0/'+pages.length);
    var pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
    await renderPages(pages,pdf,stage);

    pdf.save(pdfName());
    var sec=Math.round((Date.now()-t0)/1000);
    tipText('已生成 <b>'+pages.length+' 页</b> PDF 并开始下载（用时 '+sec+' 秒）。',7000);
  }catch(err){
    tipText('导出失败：'+((err&&err.message)||'未知错误')+'。可用 Ctrl+P 打印另存为 PDF 兜底。',9000);
  }finally{
    if(stage&&stage.parentNode) stage.parentNode.removeChild(stage);
    idle();
  }
}
btn.addEventListener('click',start);
/* Ctrl+P 兜底：账号少就当场补画雷达，避免空白 */
window.addEventListener('beforeprint',function(){
  try{ fitTables(); }catch(e){}
  if(typeof window.__drawRadarOne!=='function' || typeof agentData==='undefined') return;
  if(!agentData || agentData.length>40) return;
  for(var k=0;k<agentData.length;k++){ try{ window.__drawRadarOne(k); }catch(e){} }
});
})();

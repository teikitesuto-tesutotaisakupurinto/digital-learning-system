import {Client,Account} from "https://cdn.jsdelivr.net/npm/appwrite@17.0.0/+esm";
const client=new Client().setEndpoint("https://sgp.cloud.appwrite.io/v1").setProject("6b03d796003d1c4e4943");
const account=new Account(client);
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function token(){const t=await account.createJWT();sessionStorage.setItem("dls_jwt",t.jwt);return t.jwt}
async function api(url,options={}){const jwt=await token();const headers={Authorization:"Bearer "+jwt,...(options.headers||{})};if(options.body&&!(options.body instanceof FormData))headers["Content-Type"]="application/json";const r=await fetch(url,{...options,headers});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"処理に失敗しました。");return data}
function notice(msg,ok=false){const el=$("#notice");if(el){el.textContent=msg;el.className="message "+(ok?"success":"error")}}
function shell(title,links){
 document.body.innerHTML='<header class="topbar"><a class="brand" href="'+(links===teacherLinks?'/teacher/dashboard.html':'/student/dashboard.html')+'">デジタル問題演習</a><div class="topbar-right"><span id="who" class="user-name"></span><details class="user-menu"><summary aria-label="ユーザーメニュー">アカウント</summary><div class="user-menu-panel"><button type="button" id="logout" class="menu-action">ログアウト</button></div></details></div></header><div class="layout"><nav class="sidebar">'+links.filter(([t])=>t!=="ログアウト").map(([t,u])=>'<a href="'+u+'">'+esc(t)+'</a>').join("")+'</nav><main class="content"><div class="page-head"><div><div class="eyebrow">DIGITAL LEARNING PLATFORM</div><h1>'+esc(title)+'</h1></div></div><div id="notice" class="message" role="status"></div><div id="view"></div></main></div><footer>© 2026 デジタル問題演習. All Rights Reserved.</footer>';
 $("#logout").onclick=async()=>{try{await account.deleteSession("current")}catch{}sessionStorage.clear();location.replace("/login.html")};
 api("/api/me").then(d=>$("#who").textContent=d.user.name||d.user.email).catch(()=>location.replace("/login.html"));
}catch(e){notice(e.message)}
}
async function materials(){
 shell("教材ライブラリ",teacherLinks);const v=$("#view");
 try{
  const [fr,mr]=await Promise.all([api("/api/folders"),api("/api/materials")]);
  const folders=fr.folders,materialsList=mr.materials;let current=null,selected=new Set();
  const folderMap=new Map(folders.map(x=>[x.$id,x]));
  const descendants=id=>{const out=new Set([id]);let changed=true;while(changed){changed=false;for(const f of folders){if(f.parentId&&out.has(f.parentId)&&!out.has(f.$id)){out.add(f.$id);changed=true}}}return out};
  const pathFor=id=>{const a=[];let x=folderMap.get(id);while(x){a.unshift(x);x=folderMap.get(x.parentId)}return a};
  const render=()=>{
   const here=folders.filter(x=>(x.parentId||null)===(current||null));
   const files=materialsList.filter(x=>(x.folderId||null)===(current||null));
   const crumbs=pathFor(current);
   v.innerHTML='<div class="library-toolbar"><div class="breadcrumbs"><a href="#" data-root="1">教材ライブラリ</a>'+crumbs.map(x=>' <span>›</span> <a href="#" data-folder="'+x.$id+'">'+esc(x.name)+'</a>').join("")+'</div><div class="toolbar-actions"><button type="button" class="secondary" id="new-folder">新しいフォルダ</button><button type="button" class="secondary" id="upload-toggle">PDFを登録</button></div></div><section class="panel upload-panel hidden" id="upload-panel"><h2>教材PDFの登録</h2><form id="material-form"><div class="form-grid"><label class="field">教材名<input name="title" required></label><label class="field">保存先<input value="'+esc(crumbs.map(x=>x.name).join(" / ")||"教材ライブラリ")+'" disabled><input type="hidden" name="folderId" value="'+esc(current||"")+'"></label><label class="field">教材PDF<input name="file" type="file" accept="application/pdf" required></label><label class="field">解答・解説PDF（先生専用）<input name="answerFile" type="file" accept="application/pdf"></label></div><label class="field">説明<textarea name="description"></textarea></label><button class="primary">登録</button></form></section><div class="library-layout"><section class="panel file-panel"><div class="file-toolbar"><label><input type="checkbox" id="select-visible"> 表示中を選択</label><span id="selected-count">'+selected.size+'件選択</span><button type="button" class="text-action" id="clear-selection">選択解除</button></div><div class="file-list">'+here.map(x=>'<div class="file-row"><input type="checkbox" data-select-folder="'+x.$id+'" '+(selected.has("f:"+x.$id)?"checked":"")+'><span class="file-icon folder-icon">▰</span><a href="#" data-open-folder="'+x.$id+'">'+esc(x.name)+'</a><span class="file-meta">フォルダ</span></div>').join("")+files.map(x=>'<div class="file-row"><input type="checkbox" data-select-material="'+x.$id+'" '+(selected.has("m:"+x.$id)?"checked":"")+'><span class="file-icon pdf-icon">PDF</span><span class="file-name">'+esc(x.title)+'</span><span class="file-meta">'+esc(x.fileName||"PDF")+'</span></div>').join("")+(here.length+files.length?"":"<div class=\"empty-state\">このフォルダには項目がありません。</div>")+'</div><div class="selection-actions"><button type="button" class="secondary" id="bulk-move">選択項目を移動</button><button type="button" class="secondary" id="bulk-delete">選択項目を削除</button><button type="button" class="primary" id="bulk-distribute">選択教材を配信</button></div></section><aside class="panel folder-info"><h2>フォルダ</h2><p class="muted small">フォルダの中にフォルダを作成できます。階層の深さに制限はありません。</p><button type="button" class="secondary" id="create-child">この場所にフォルダを作成</button></aside></div>';
   v.querySelectorAll("[data-root]").forEach(a=>a.onclick=e=>{e.preventDefault();current=null;render()});
   v.querySelectorAll("[data-folder]").forEach(a=>a.onclick=e=>{e.preventDefault();current=a.dataset.folder;render()});
   v.querySelectorAll("[data-open-folder]").forEach(a=>a.onclick=e=>{e.preventDefault();current=a.dataset.openFolder;render()});
   v.querySelectorAll("[data-select-folder]").forEach(el=>el.onchange=()=>{const k="f:"+el.dataset.selectFolder;el.checked?selected.add(k):selected.delete(k);$("#selected-count").textContent=selected.size+"件選択"});
   v.querySelectorAll("[data-select-material]").forEach(el=>el.onchange=()=>{const k="m:"+el.dataset.selectMaterial;el.checked?selected.add(k):selected.delete(k);$("#selected-count").textContent=selected.size+"件選択"});
   $("#select-visible").onchange=e=>{for(const x of here) e.target.checked?selected.add("f:"+x.$id):selected.delete("f:"+x.$id);for(const x of files)e.target.checked?selected.add("m:"+x.$id):selected.delete("m:"+x.$id);render()};
   $("#clear-selection").onclick=()=>{selected.clear();render()};
   const makeFolder=async()=>{const name=prompt("フォルダ名を入力してください。");if(!name?.trim())return;try{await api("/api/folders",{method:"POST",body:JSON.stringify({name:name.trim(),parentId:current})});notice("フォルダを作成しました。",true);materials()}catch(e){notice(e.message)}};
   $("#new-folder").onclick=makeFolder;$("#create-child").onclick=makeFolder;
   $("#upload-toggle").onclick=()=>$("#upload-panel").classList.toggle("hidden");
   $("#material-form").onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector("button");b.disabled=true;try{await api("/api/materials",{method:"POST",body:new FormData(e.currentTarget)});notice("教材を登録しました。",true);materials()}catch(err){notice(err.message);b.disabled=false}};
   $("#bulk-distribute").onclick=()=>{const materialIds=[...selected].filter(x=>x.startsWith("m:")).map(x=>x.slice(2));const folderIds=[...selected].filter(x=>x.startsWith("f:")).map(x=>x.slice(2));if(!materialIds.length&&!folderIds.length){notice("配信するフォルダまたは教材を選択してください。");return}sessionStorage.setItem("dls_distribution_selection",JSON.stringify({materialIds,folderIds}));location.href="/teacher/distribution.html"};
   $("#bulk-move").onclick=async()=>{const ids=[...selected];if(!ids.length){notice("移動する項目を選択してください。");return}notice("フォルダ・教材の移動機能は次の更新で実装します。")};
   $("#bulk-delete").onclick=()=>notice("誤削除防止のため、削除機能は確認付きで別途実装します。");
  };
  render();
 }catch(e){notice(e.message)}
}
async function distribution(){
 shell("教材配信",teacherLinks);const v=$("#view");
 try{
  const [cr,mr,dr,fr]=await Promise.all([api("/api/classes"),api("/api/materials"),api("/api/distributions"),api("/api/folders")]);
  const classes=cr.classes,allMaterials=mr.materials,folders=fr.folders,folderMap=new Map(folders.map(x=>[x.$id,x]));
  const pending=JSON.parse(sessionStorage.getItem("dls_distribution_selection")||"{}");
  let current=null;const chosenMaterials=new Set(pending.materialIds||[]),chosenFolders=new Set(pending.folderIds||[]),targets=new Map();
  const descendants=id=>{const out=new Set([id]);let changed=true;while(changed){changed=false;for(const f of folders){if(f.parentId&&out.has(f.parentId)&&!out.has(f.$id)){out.add(f.$id);changed=true}}}return out};
  const pathFor=id=>{const a=[];let x=folderMap.get(id);while(x){a.unshift(x);x=folderMap.get(x.parentId)}return a};
  const render=async()=>{
   const here=folders.filter(x=>(x.parentId||null)===(current||null)),files=allMaterials.filter(x=>(x.folderId||null)===(current||null)),crumbs=pathFor(current);
   const selectedIds=new Set([...chosenMaterials]);for(const id of chosenFolders)for(const f of descendants(id))for(const m of allMaterials)if(m.folderId===f)selectedIds.add(m.$id);
   const targetRows=[...targets.entries()];
   v.innerHTML='<section class="panel"><h2>配信内容</h2><label class="field">配信タイトル<input id="dist-title" placeholder="例：数学 第1回演習" required></label><label class="field">教材ライブラリから選択</label><div class="breadcrumbs"><a href="#" data-root="1">教材ライブラリ</a>'+crumbs.map(x=>' <span>›</span> <a href="#" data-folder="'+x.$id+'">'+esc(x.name)+'</a>').join("")+'</div><div class="picker-list">'+here.map(x=>'<label class="picker-row"><input type="checkbox" data-folder="'+x.$id+'" '+(chosenFolders.has(x.$id)?"checked":"")+'><span class="file-icon folder-icon">▰</span><a href="#" data-open="'+x.$id+'">'+esc(x.name)+'</a><span class="muted small">フォルダ</span></label>').join("")+files.map(x=>'<label class="picker-row"><input type="checkbox" data-material="'+x.$id+'" '+(chosenMaterials.has(x.$id)?"checked":"")+'><span class="file-icon pdf-icon">PDF</span><span>'+esc(x.title)+'</span></label>').join("")+(here.length+files.length?"":"<div class=\"empty-state\">このフォルダには項目がありません。</div>")+'</div><div class="selection-summary">配信対象教材：'+selectedIds.size+'件（フォルダ内の教材を含む）</div></section><section class="panel"><h2>配信先</h2><div id="target-editor">'+classes.map(cl=>'<div class="target-class"><div class="target-head"><label><input type="checkbox" data-target-class="'+cl.$id+'" '+(targets.has(cl.$id)?"checked":"")+'> <strong>'+esc(cl.name)+'</strong></label><select data-mode="'+cl.$id+'"><option value="all" '+((targets.get(cl.$id)?.mode||"all")==="all"?"selected":"")+'>クラス全体</option><option value="selected" '+((targets.get(cl.$id)?.mode||"all")==="selected"?"selected":"")+'>生徒を個別に選択</option></select></div><div class="student-picker" id="students-'+cl.$id+'"></div></div>').join("")||"先にクラスを作成してください。"}</div></section><section class="panel"><h2>配信設定</h2><div class="form-grid"><label class="field">配信日時（空欄なら即時）<input id="release-at" type="datetime-local"></label><label class="field">提出期限<input id="due-at" type="datetime-local"></label></div><label class="field">説明<textarea id="dist-description"></textarea></label><div class="review-line"><span id="review-count">配信先：未選択</span><button type="button" class="primary" id="publish">配信内容を確認</button></div></section><section class="panel"><h2>配信履歴</h2><div class="list">'+dr.distributions.map(x=>'<div class="list-item"><div><strong>'+esc(x.title)+'</strong><span class="muted small">'+esc(x.status)+'</span></div></div>').join("")+'</div></section>';
   v.querySelectorAll("[data-root]").forEach(a=>a.onclick=e=>{e.preventDefault();current=null;render()});
   v.querySelectorAll("[data-folder]").forEach(a=>a.onclick=e=>{e.preventDefault();current=a.dataset.folder;render()});
   v.querySelectorAll("[data-open]").forEach(a=>a.onclick=e=>{e.preventDefault();current=a.dataset.open;render()});
   v.querySelectorAll("[data-material]").forEach(el=>el.onchange=()=>{el.checked?chosenMaterials.add(el.dataset.material):chosenMaterials.delete(el.dataset.material);render()});
   v.querySelectorAll("[data-folder]").forEach(el=>el.onchange=()=>{el.checked?chosenFolders.add(el.dataset.folder):chosenFolders.delete(el.dataset.folder);render()});
   for(const cl of classes){const classBox=v.querySelector("#students-"+cl.$id);const mode=targets.get(cl.$id)?.mode||"all";const checked=targets.has(cl.$id);if(checked){try{const sr=await api("/api/classes/"+cl.$id+"/students");const picked=new Set(targets.get(cl.$id)?.studentIds||[]);classBox.innerHTML=mode==="selected"?sr.students.map(st=>'<label><input type="checkbox" data-student="'+esc(st.studentId)+'" data-class="'+cl.$id+'" '+(picked.has(st.studentId)?"checked":"")+'> '+esc(st.studentName||st.studentId)+'</label>').join(""):'<span class="muted small">このクラスの在籍生徒全員が対象です（'+sr.students.length+'名）。</span>';}catch(e){classBox.textContent=e.message}}}
   v.querySelectorAll("[data-target-class]").forEach(el=>el.onchange=()=>{if(el.checked)targets.set(el.dataset.targetClass,{mode:"all",studentIds:[]});else targets.delete(el.dataset.targetClass);render()});
   v.querySelectorAll("[data-mode]").forEach(el=>el.onchange=()=>{const id=el.dataset.mode,old=targets.get(id)||{mode:"all",studentIds:[]};targets.set(id,{...old,mode:el.value});render()});
   v.querySelectorAll("[data-student]").forEach(el=>el.onchange=()=>{const id=el.dataset.class,old=targets.get(id)||{mode:"selected",studentIds:[]},set=new Set(old.studentIds);el.checked?set.add(el.dataset.student):set.delete(el.dataset.student);targets.set(id,{mode:"selected",studentIds:[...set]});updateReview()});
   function updateReview(){const n=[...targets.values()].reduce((s,t)=>s+(t.mode==="all"?1:t.studentIds.length),0);$("#review-count").textContent="選択クラス："+targets.size+"件 ／ 配信対象："+n+"（クラス全体は人数確定時に集計）";}
   updateReview();
   $("#publish").onclick=async()=>{const title=$("#dist-title").value.trim();if(!title||!selectedIds.size||!targets.size){notice("配信タイトル・教材・配信先を指定してください。");return}const targetList=[...targets.entries()].map(([classId,t])=>({classId,mode:t.mode,studentIds:t.studentIds||[]}));const release=$("#release-at").value;const due=$("#due-at").value;const body={title,description:$("#dist-description").value,materialIds:[...chosenMaterials],folderIds:[...chosenFolders],targets:targetList,releaseAt:release?new Date(release).toISOString():null,dueAt:due?new Date(due).toISOString():null};const summary=targetList.map(t=>classes.find(c=>c.$id===t.classId)?.name+(t.mode==="all"?"（クラス全体）":"（"+t.studentIds.length+"名）")).join("、");if(!confirm("次の内容で配信します。\n教材："+selectedIds.size+"件\n配信先："+summary+"\nよろしいですか？"))return;const b=$("#publish");b.disabled=true;try{const result=await api("/api/distributions",{method:"POST",body:JSON.stringify(body)});sessionStorage.removeItem("dls_distribution_selection");notice(result.assignedStudents+"名に"+result.materialCount+"教材を配信しました。",true);distribution()}catch(e){notice(e.message);b.disabled=false}};
  };
  await render();
 }catch(e){notice(e.message)}
}
async function progress(){
 shell("クラス別の学習状況",teacherLinks);const v=$("#view");
 try{
  const [c,m]=await Promise.all([api("/api/classes"),api("/api/materials")]);
  const materialNames=new Map(m.materials.map(x=>[x.$id,x.title]));
  v.innerHTML='<section class="panel"><label class="field">クラスを選択<select id="class-select">'+c.classes.map(x=>'<option value="'+esc(x.$id)+'">'+esc(x.name)+'</option>').join("")+'</select></label><div id="progress-list">読み込み中…</div></section>';
  const load=async()=>{
   const d=await api("/api/classes/"+$("#class-select").value+"/progress");
   $("#progress-list").innerHTML=d.students.map(st=>'<section class="panel"><div class="row" style="justify-content:space-between"><strong>'+esc(st.studentName||st.studentId)+'</strong><span class="muted small">'+st.assignments.length+'件</span></div><div class="list">'+st.assignments.map(as=>{
    const sub=as.submission, status=sub?sub.status:as.status;
    const label={locked:"未公開",available:"未開始",in_progress:"演習中",submitted:"提出済み",returned:"差し戻し",passed:"合格"}[status]||status;
    return '<div class="list-item"><div><strong>'+esc(materialNames.get(as.materialId)||"教材")+'</strong><span class="muted small">'+esc(label)+(as.dueAt?' ・ 期限 '+new Date(as.dueAt).toLocaleString("ja-JP"):"")+'</span></div>'+(sub?'<a href="/teacher/grading.html?id='+encodeURIComponent(sub.$id)+'">'+(sub.status==="submitted"?"答案を添削":"答案を確認")+'</a>':(as.status==="locked"?"未公開":"未着手"))+'</div>';
   }).join("")+'</div></section>').join("")||"このクラスに生徒が登録されていません。";
  };
  $("#class-select").onchange=load;if(c.classes.length)await load();else $("#progress-list").textContent="先にクラスを作成してください。";
 }catch(e){notice(e.message)}
}
async function student(){shell("学習ダッシュボード",studentLinks);const v=$("#view");try{const d=await api("/api/assignments");v.innerHTML='<section class="panel"><h2>配信された教材</h2><div class="list">'+d.assignments.map(a=>'<div class="list-item"><div><strong>'+esc(a.material?.title||"教材")+'</strong><span class="muted small">'+esc(a.status)+' ・ '+esc(a.distribution?.title||"")+'</span></div>'+(a.status==="locked"?'<span class="badge">未開放</span>':'<a href="/student/workspace.html?id='+a.$id+'">演習を開く</a>')+'</div>').join("")+'</div></section>'; }catch(e){notice(e.message)}}
async function grading(){
 shell("答案の確認・添削",teacherLinks);
 const v=$("#view"),id=new URLSearchParams(location.search).get("id");
 if(!id){notice("採点する答案を選択してください。");return}
 try{
  const d=await api("/api/grading/"+id);
  v.innerHTML=`
  <section class="panel"><div class="row" style="justify-content:space-between"><div><h2>${esc(d.student?.displayName||"生徒")} / ${esc(d.material.title)}</h2><p class="muted small">提出状況：${esc(d.submission.status)}</p></div><a href="/teacher/progress.html">進捗一覧へ戻る</a></div>
   <div class="toolbar"><button id="teacher-pen" class="primary">添削ペン</button><button id="teacher-eraser" class="secondary">消しゴム</button><input id="teacher-color" type="color" value="#e53935"><input id="teacher-width" type="range" min="1" max="12" value="3"><button id="teacher-prev" class="secondary">前のページ</button><span id="teacher-page">1 / 1</span><button id="teacher-next" class="secondary">次のページ</button><button id="teacher-save" class="primary">添削を保存</button></div>
   <div id="grading-stage" class="pdf-stage">答案を読み込んでいます…</div>
  </section>
  <section class="panel"><h2>採点・返却</h2><form id="grade-form">
   <label class="field">判定<select name="result"><option value="returned">差し戻し（再提出）</option><option value="passed">合格</option></select></label>
   <div class="form-grid"><label class="field">得点<input name="score" type="number" min="0" step="0.5"></label><label class="field">満点<input name="maxScore" type="number" min="0" step="0.5"></label></div>
   <label class="field">先生からのコメント<textarea name="feedback" rows="4"></textarea></label>
   <button class="primary">採点結果を保存して返却</button>
  </form></section>
  <section class="panel"><h2>コメント履歴</h2><div id="comment-list" class="list"></div><form id="comment-form" class="row"><input name="body" placeholder="生徒へのコメント" required><button class="primary">コメント送信</button></form></section>`;
  const stage=$("#grading-stage"),pdfjs=await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
  const jwt=await token(),resp=await fetch(d.material.pageUrl,{headers:{Authorization:"Bearer "+jwt}});
  if(!resp.ok)throw new Error("教材PDFを読み込めません。");
  const pdf=await pdfjs.getDocument({data:await resp.arrayBuffer()}).promise;
  const saved=new Map(d.pages.map(p=>[Number(p.pageNo),{student:JSON.parse(p.studentData||"[]"),teacher:JSON.parse(p.teacherData||"[]")}]));
  let pageNo=1,mode="pen",teacherStrokes=[];
  const drawStrokes=(ctx,items)=>{for(const st of items||[]){if(!st.points?.length)continue;ctx.strokeStyle=st.color||"#2457c5";ctx.lineWidth=Number(st.width)||3;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();st.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke()}};
  async function renderPage(){
   const page=await pdf.getPage(pageNo),vp=page.getViewport({scale:1.25});stage.innerHTML="";
   const wrap=document.createElement("div");wrap.className="page-wrap";wrap.style.width=vp.width+"px";wrap.style.height=vp.height+"px";
   const base=document.createElement("canvas");base.width=vp.width;base.height=vp.height;
   const ink=document.createElement("canvas");ink.className="ink";ink.width=vp.width;ink.height=vp.height;wrap.append(base,ink);stage.append(wrap);
   await page.render({canvasContext:base.getContext("2d"),viewport:vp}).promise;
   const ctx=ink.getContext("2d"),entry=saved.get(pageNo)||{student:[],teacher:[]};teacherStrokes=entry.teacher;
   drawStrokes(ctx,entry.student);drawStrokes(ctx,teacherStrokes);
   $("#teacher-page").textContent=pageNo+" / "+pdf.numPages;
   let drawing=false,current=null;
   const pos=e=>{const r=ink.getBoundingClientRect();return{x:(e.clientX-r.left)*ink.width/r.width,y:(e.clientY-r.top)*ink.height/r.height}};
   ink.onpointerdown=e=>{drawing=true;ink.setPointerCapture(e.pointerId);current={color:mode==="eraser"?"#ffffff":$("#teacher-color").value,width:Number($("#teacher-width").value)*(mode==="eraser"?6:1),points:[pos(e)]};teacherStrokes.push(current);paint()};
   ink.onpointermove=e=>{if(!drawing||!current)return;current.points.push(pos(e));paint()};
   ink.onpointerup=ink.onpointercancel=()=>{drawing=false;current=null};
   function paint(){ctx.clearRect(0,0,ink.width,ink.height);drawStrokes(ctx,entry.student);drawStrokes(ctx,teacherStrokes)}
  }
  const saveTeacher=async()=>{const old=saved.get(pageNo)||{student:[],teacher:[]};await api("/api/submissions/"+d.submission.$id+"/pages/"+pageNo,{method:"PUT",body:JSON.stringify({strokes:teacherStrokes})});saved.set(pageNo,{student:old.student,teacher:teacherStrokes});notice("このページの添削を保存しました。",true)};
  $("#teacher-pen").onclick=()=>mode="pen";$("#teacher-eraser").onclick=()=>mode="eraser";
  $("#teacher-save").onclick=async()=>{try{await saveTeacher()}catch(e){notice(e.message)}};
  $("#teacher-prev").onclick=async()=>{if(pageNo>1){await saveTeacher();pageNo--;await renderPage()}};
  $("#teacher-next").onclick=async()=>{if(pageNo<pdf.numPages){await saveTeacher();pageNo++;await renderPage()}};
  await renderPage();
  const comments=await api("/api/submissions/"+d.submission.$id+"/comments");
  const renderComments=()=>{$("#comment-list").innerHTML=comments.comments.map(x=>`<div class="list-item"><div>${esc(x.body)}<span class="muted small">${esc(x.authorRole)} ・ ${new Date(x.$createdAt).toLocaleString("ja-JP")}</span></div></div>`).join("")||"コメントはありません。"};
  renderComments();
  $("#comment-form").onsubmit=async e=>{e.preventDefault();const body=new FormData(e.currentTarget).get("body");try{await api("/api/submissions/"+d.submission.$id+"/comments",{method:"POST",body:JSON.stringify({body,pageNo})});comments.comments.push({body,authorRole:"teacher",$createdAt:new Date().toISOString()});e.currentTarget.reset();renderComments()}catch(err){notice(err.message)}};
  $("#grade-form").onsubmit=async e=>{e.preventDefault();try{await saveTeacher();const body=Object.fromEntries(new FormData(e.currentTarget));await api("/api/grading/"+id,{method:"POST",body:JSON.stringify(body)});notice("採点結果を保存し、返却しました。",true)}catch(err){notice(err.message)}};
 }catch(e){notice(e.message)}
}
async function workspace(){
 document.body.innerHTML='<header class="topbar"><strong>デジタル問題演習</strong></header><main class="workspace"><div class="workspace-bar"><a href="/student/dashboard.html">← ダッシュボード</a><strong id="work-title">演習</strong><span id="save-state" class="muted small"></span></div><div class="toolbar"><button id="pen" class="primary">ペン</button><button id="eraser" class="secondary">消しゴム</button><input id="color" type="color" value="#1749bd" aria-label="ペン色"><input id="width" type="range" min="1" max="10" value="3" aria-label="線の太さ"><button id="prev" class="secondary">前のページ</button><span id="page-label">1 / 1</span><button id="next" class="secondary">次のページ</button><button id="submit-work" class="primary">提出する</button></div><div id="pdf-stage" class="pdf-stage">PDFを読み込んでいます…</div><section class="panel"><h2>先生からのコメント</h2><div id="student-comments" class="list">読み込み中…</div></section><p class="muted small">書き込みは自動保存されます。先生から返却された添削もこの画面で確認できます。</p></main>';
 const id=new URLSearchParams(location.search).get("id");if(!id){$("#pdf-stage").textContent="課題IDがありません。";return}
 try{
  const d=await api("/api/workspace/"+id);$("#work-title").textContent=d.material.title;const commentData=await api("/api/submissions/"+d.submission.$id+"/comments");$("#student-comments").innerHTML=commentData.comments.map(x=>'<div class="list-item"><div>'+esc(x.body)+'<span class="muted small">'+esc(x.authorRole==="teacher"?"先生":"自分")+' ・ '+new Date(x.$createdAt).toLocaleString("ja-JP")+'</span></div></div>').join("")||"先生からのコメントはまだありません。";
  const jwt=await token(),pdfjs=await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
  const file=await fetch(d.material.pageUrl,{headers:{Authorization:"Bearer "+jwt}});if(!file.ok)throw new Error("PDFを取得できません。");
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  let pageNo=1,strokes=[],mode="pen",scale=1.25;
  const saved=new Map(d.pages.map(p=>[Number(p.pageNo),{student:JSON.parse(p.studentData||"[]"),teacher:JSON.parse(p.teacherData||"[]") }]));
  const locked=["submitted","passed"].includes(d.assignment.status);
  const drawItems=(ctx,items)=>{for(const item of items||[]){if(!item.points?.length)continue;ctx.strokeStyle=item.color||"#1749bd";ctx.lineWidth=Number(item.width)||3;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();item.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke()}};
  const save=async()=>{if(locked)return;$("#save-state").textContent="保存中…";try{await api("/api/submissions/"+d.submission.$id+"/pages/"+pageNo,{method:"PUT",body:JSON.stringify({strokes})});const old=saved.get(pageNo)||{teacher:[]};saved.set(pageNo,{student:strokes,teacher:old.teacher});$("#save-state").textContent="保存済み"}catch(e){$("#save-state").textContent=e.message}};
  const render=async()=>{
   const page=await pdf.getPage(pageNo),vp=page.getViewport({scale}),stage=$("#pdf-stage");stage.innerHTML="";
   const wrap=document.createElement("div");wrap.className="page-wrap";wrap.style.width=vp.width+"px";wrap.style.height=vp.height+"px";
   const base=document.createElement("canvas");base.width=vp.width;base.height=vp.height;
   const ink=document.createElement("canvas");ink.className="ink";ink.width=vp.width;ink.height=vp.height;wrap.append(base,ink);stage.append(wrap);
   await page.render({canvasContext:base.getContext("2d"),viewport:vp}).promise;
   const ctx=ink.getContext("2d"),entry=saved.get(pageNo)||{student:[],teacher:[]};strokes=entry.student;
   const paint=()=>{ctx.clearRect(0,0,ink.width,ink.height);drawItems(ctx,strokes);drawItems(ctx,entry.teacher)};
   paint();$("#page-label").textContent=pageNo+" / "+pdf.numPages;
   let drawing=false,current=null;
   const pos=e=>{const r=ink.getBoundingClientRect();return{x:(e.clientX-r.left)*ink.width/r.width,y:(e.clientY-r.top)*ink.height/r.height}};
   ink.onpointerdown=e=>{if(locked)return;drawing=true;ink.setPointerCapture(e.pointerId);current={color:mode==="eraser"?"#ffffff":$("#color").value,width:Number($("#width").value)*(mode==="eraser"?6:1),points:[pos(e)]};strokes.push(current);paint()};
   ink.onpointermove=e=>{if(!drawing||!current)return;current.points.push(pos(e));paint()};
   ink.onpointerup=ink.onpointercancel=()=>{if(drawing){drawing=false;current=null;save()}};
  };
  $("#pen").onclick=()=>mode="pen";$("#eraser").onclick=()=>mode="eraser";
  $("#prev").onclick=async()=>{if(pageNo>1){await save();pageNo--;await render()}};
  $("#next").onclick=async()=>{if(pageNo<pdf.numPages){await save();pageNo++;await render()}};
  $("#submit-work").onclick=async()=>{if(locked)return;if(!confirm("答案を提出しますか？提出後は編集できません。"))return;try{await save();await api("/api/submissions/"+d.submission.$id+"/submit",{method:"POST"});alert("提出しました。");location.href="/student/dashboard.html"}catch(e){alert(e.message)}};
  if(locked){$("#submit-work").disabled=true;$("#submit-work").textContent="提出済み";$("#pen").disabled=true;$("#eraser").disabled=true}
  await render();setInterval(()=>{if(!locked)save()},20000);
 }catch(e){$("#pdf-stage").textContent=e.message}
}
if(path==="/teacher/dashboard.html")teacher();else if(path==="/teacher/materials.html")materials();else if(path==="/teacher/distribution.html")distribution();else if(path==="/teacher/progress.html")progress();else if(path==="/teacher/grading.html")grading();else if(path==="/student/dashboard.html")student();else if(path==="/student/workspace.html")workspace();else location.href="/login.html";

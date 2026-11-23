import {Client,Account} from "https://cdn.jsdelivr.net/npm/appwrite@17.0.0/+esm";
const client=new Client().setEndpoint("https://sgp.cloud.appwrite.io/v1").setProject("6b03d796003d1c4e4943");
const account=new Account(client);
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function token(){const t=await account.createJWT();sessionStorage.setItem("dls_jwt",t.jwt);return t.jwt}
async function api(url,options={}){const jwt=await token();const headers={Authorization:"Bearer "+jwt,...(options.headers||{})};if(options.body&&!(options.body instanceof FormData))headers["Content-Type"]="application/json";const r=await fetch(url,{...options,headers});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"処理に失敗しました。");return data}
function notice(msg,ok=false){const el=$("#notice");if(el){el.textContent=msg;el.className="message "+(ok?"success":"error")}}
function shell(title,links){document.body.innerHTML='<header class="topbar"><strong>デジタル問題演習</strong></header><div class="layout"><nav class="sidebar">'+links.map(([t,u])=>'<a href="'+u+'">'+esc(t)+'</a>').join("")+'<a href="#" id="logout">ログアウト</a></nav><main class="content"><div class="page-head"><h1>'+esc(title)+'</h1><span id="who" class="muted small"></span></div><div id="notice" class="message"></div><div id="view"></div></main></div><footer>© 2026 デジタル問題演習. All Rights Reserved.</footer>';$("#logout").onclick=async e=>{e.preventDefault();try{await account.deleteSession("current")}catch{}sessionStorage.clear();location.href="/login.html"};api("/api/me").then(d=>$("#who").textContent=d.user.displayName||d.user.email).catch(()=>location.href="/login.html")}
const teacherLinks=[["ダッシュボード","/teacher/dashboard.html"],["教材管理","/teacher/materials.html"],["教材配信","/teacher/distribution.html"],["進捗確認","/teacher/progress.html"],["ログアウト","#"]];
const studentLinks=[["学習ダッシュボード","/student/dashboard.html"],["ログアウト","#"]];
const path=location.pathname;
async function teacher(){
shell("先生ダッシュボード",teacherLinks);
const v=$("#view");
try{
 const [c,m,d,u]=await Promise.all([api("/api/classes"),api("/api/materials"),api("/api/distributions"),api("/api/users?role=student")]);
 v.innerHTML=`
 <div class="grid">
  <div class="stat"><span>クラス</span><strong>${c.classes.length}</strong></div>
  <div class="stat"><span>教材</span><strong>${m.materials.length}</strong></div>
  <div class="stat"><span>配信</span><strong>${d.distributions.length}</strong></div>
  <div class="stat"><span>生徒</span><strong>${u.users.length}</strong></div>
 </div>
 <section class="panel"><h2>クラスを作成</h2><form id="class-form" class="row"><input name="name" placeholder="クラス名" required><input name="description" placeholder="説明（任意）"><button class="primary">作成</button></form></section>
 <section class="panel"><h2>生徒アカウントを作成</h2><form id="student-form" class="form-grid">
  <label class="field">氏名<input name="name" required></label>
  <label class="field">メールアドレス<input name="email" type="email" required></label>
  <label class="field">初期パスワード<input name="password" type="password" minlength="8" required></label>
  <div><button class="primary">生徒を登録</button></div>
 </form><p class="muted small">登録した生徒は、下のクラス管理から所属クラスに追加できます。</p></section>
 <section class="panel"><h2>クラス・生徒管理</h2><label class="field">クラス<select id="enroll-class">${c.classes.map(x=>`<option value="${esc(x.$id)}">${esc(x.name)}</option>`).join("")}</select></label>
 <div class="row"><select id="enroll-student">${u.users.map(x=>`<option value="${esc(x.authUserId)}">${esc(x.displayName)}（${esc(x.email)}）</option>`).join("")}</select><button id="enroll-button" class="primary">このクラスに追加</button></div>
 <div id="class-students" class="list"></div></section>
 <section class="panel"><h2>最近の教材</h2><div class="list">${m.materials.slice(0,6).map(x=>`<div class="list-item"><div><strong>${esc(x.title)}</strong><span class="muted small">${esc(x.fileName||"PDF")}</span></div><span class="badge">登録済み</span></div>`).join("")||"教材はまだ登録されていません。"}</div><p><a href="/teacher/materials.html">教材管理を開く</a></p></section>
 <section class="panel"><h2>最近の配信</h2><div class="list">${d.distributions.slice(0,6).map(x=>`<div class="list-item"><div><strong>${esc(x.title)}</strong><span class="muted small">${esc(x.status)}</span></div></div>`).join("")||"配信履歴はありません。"}</div></section>`;
 $("#class-form").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/api/classes",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});notice("クラスを作成しました。",true);teacher()}catch(err){notice(err.message)}};
 $("#student-form").onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector("button");b.disabled=true;try{const f=new FormData(e.currentTarget);await api("/api/users",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});notice("生徒アカウントを作成しました。",true);teacher()}catch(err){notice(err.message);b.disabled=false}};
 async function loadClassStudents(){const id=$("#enroll-class").value;if(!id){$("#class-students").textContent="先にクラスを作成してください。";return}const x=await api("/api/classes/"+id+"/students");$("#class-students").innerHTML=x.students.map(st=>`<div class="list-item"><strong>${esc(st.studentName||st.studentId)}</strong><span class="badge">在籍中</span></div>`).join("")||"このクラスに登録された生徒はいません。"}
 $("#enroll-class").onchange=loadClassStudents;
 $("#enroll-button").onclick=async()=>{const classId=$("#enroll-class").value,studentId=$("#enroll-student").value;if(!classId||!studentId){notice("クラスと生徒を選択してください。");return}try{await api("/api/classes/"+classId+"/students",{method:"POST",body:JSON.stringify({studentId})});notice("生徒をクラスに追加しました。",true);loadClassStudents()}catch(err){notice(err.message)}};
 await loadClassStudents();
}catch(e){notice(e.message)}
}
async function materials(){shell("教材管理",teacherLinks);const v=$("#view");try{const [f,m]=await Promise.all([api("/api/folders"),api("/api/materials")]);v.innerHTML='<section class="panel"><h2>フォルダー作成</h2><form id="folder-form" class="row"><input name="name" placeholder="フォルダー名" required><select name="parentId"><option value="">最上位フォルダー</option>'+f.folders.map(x=>'<option value="'+x.$id+'">'+esc(x.name)+'</option>').join("")+'</select><button>作成</button></form></section><section class="panel"><h2>PDF教材を登録</h2><form id="material-form"><div class="form-grid"><label class="field">教材名<input name="title" required></label><label class="field">フォルダー<select name="folderId"><option value="">未分類</option>'+f.folders.map(x=>'<option value="'+x.$id+'">'+esc(x.path||x.name)+'</option>').join("")+'</select></label><label class="field">教材PDF<input name="file" type="file" accept="application/pdf" required></label><label class="field">解答PDF（先生専用）<input name="answerFile" type="file" accept="application/pdf"></label></div><label class="field">説明<textarea name="description"></textarea></label><button>教材を登録</button></form></section><section class="panel"><h2>教材ライブラリ</h2><div class="list">'+m.materials.map(x=>'<div class="list-item"><div><strong>'+esc(x.title)+'</strong><span class="muted small">'+esc(x.fileName||"PDF")+'</span></div><span class="badge">登録済み</span></div>').join("")+'</div></section>';
$("#folder-form").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/api/folders",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});notice("フォルダーを作成しました。",true);materials()}catch(e){notice(e.message)}};
$("#material-form").onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector("button");b.disabled=true;try{await api("/api/materials",{method:"POST",body:new FormData(e.currentTarget)});notice("教材を登録しました。",true);materials()}catch(e){notice(e.message);b.disabled=false}}}catch(e){notice(e.message)}}
async function distribution(){shell("教材配信",teacherLinks);const v=$("#view");try{const [c,m,d]=await Promise.all([api("/api/classes"),api("/api/materials"),api("/api/distributions")]);v.innerHTML='<section class="panel"><h2>教材を配信</h2><form id="dist-form"><label class="field">配信タイトル<input name="title" required></label><label class="field">クラス<select name="classId" required>'+c.classes.map(x=>'<option value="'+x.$id+'">'+esc(x.name)+'</option>').join("")+'</select></label><label class="field">教材（複数選択可）<select name="materialIds" multiple size="6" required>'+m.materials.map(x=>'<option value="'+x.$id+'">'+esc(x.title)+'</option>').join("")+'</select></label><label class="field">配信日時（空欄なら即時）<input name="releaseAt" type="datetime-local"></label><label class="field">提出期限<input name="dueAt" type="datetime-local"></label><label class="field">説明<textarea name="description"></textarea></label><button>配信する</button></form></section><section class="panel"><h2>配信履歴</h2><div class="list">'+d.distributions.map(x=>'<div class="list-item"><div><strong>'+esc(x.title)+'</strong><span class="muted small">'+esc(x.status)+'</span></div></div>').join("")+'</div></section>';
$("#dist-form").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const body=Object.fromEntries(f);body.materialIds=f.getAll("materialIds");body.releaseAt=body.releaseAt?new Date(body.releaseAt).toISOString():null;body.dueAt=body.dueAt?new Date(body.dueAt).toISOString():null;try{await api("/api/distributions",{method:"POST",body:JSON.stringify(body)});notice("教材を配信しました。",true);distribution()}catch(e){notice(e.message)}}}catch(e){notice(e.message)}}
async function progress(){shell("クラス別進捗確認",teacherLinks);const v=$("#view");try{const c=await api("/api/classes");v.innerHTML='<section class="panel"><label class="field">クラス<select id="class-select">'+c.classes.map(x=>'<option value="'+x.$id+'">'+esc(x.name)+'</option>').join("")+'</select></label><div id="progress-list"></div></section>';const load=async()=>{const d=await api("/api/classes/"+$("#class-select").value+"/progress");$("#progress-list").innerHTML=d.students.map(s=>'<div class="panel"><strong>'+esc(s.studentName||s.studentId)+'</strong><div class="list">'+s.assignments.map(a=>'<div class="list-item"><div><strong>'+esc(a.materialId)+'</strong><span class="muted small">'+esc(a.status)+'</span></div>'+(a.submission?'<a href="/teacher/grading.html?id='+a.submission.$id+'">答案を確認</a>':"未着手")+'</div>').join("")+'</div></div>').join("")||"生徒が登録されていません。"};$("#class-select").onchange=load;await load()}catch(e){notice(e.message)}}
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
   await page.render({canvas:base,viewport:vp}).promise;
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
async function workspace(){document.body.innerHTML='<header class="topbar"><strong>デジタル問題演習</strong></header><main class="workspace"><div class="workspace-bar"><a href="/student/dashboard.html">← ダッシュボード</a><strong id="work-title">演習</strong><span id="save-state" class="muted small"></span></div><div class="toolbar"><button id="pen">ペン</button><button id="eraser" class="secondary">消しゴム</button><input id="color" type="color" value="#1749bd" aria-label="ペン色"><input id="width" type="range" min="1" max="10" value="3" aria-label="線の太さ"><button id="prev" class="secondary">前のページ</button><span id="page-label">1 / 1</span><button id="next" class="secondary">次のページ</button><button id="submit-work">提出する</button></div><div id="pdf-stage" class="pdf-stage">PDFを読み込んでいます…</div><p class="muted small">書き込みはページごとに自動保存されます。提出後は先生の採点を待ってください。</p></main>';
const id=new URLSearchParams(location.search).get("id");if(!id){$("#pdf-stage").textContent="課題IDがありません。";return}
try{const d=await api("/api/workspace/"+id);$("#work-title").textContent=d.material.title;const jwt=await token();const pdfjs=await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs");pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";const file=await fetch(d.material.pageUrl,{headers:{Authorization:"Bearer "+jwt}});if(!file.ok)throw new Error("PDFを取得できません。");const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;let pageNo=1,strokes=[],mode="pen",scale=1.25;const saved=new Map(d.pages.map(p=>[p.pageNo,JSON.parse(p.studentData||"[]")]));const render=async()=>{const page=await pdf.getPage(pageNo),vp=page.getViewport({scale});const stage=$("#pdf-stage");stage.innerHTML="";const wrap=document.createElement("div");wrap.className="page-wrap";wrap.style.width=vp.width+"px";wrap.style.height=vp.height+"px";const base=document.createElement("canvas");base.width=vp.width;base.height=vp.height;const ink=document.createElement("canvas");ink.className="ink";ink.width=vp.width;ink.height=vp.height;wrap.append(base,ink);stage.append(wrap);await page.render({canvas:base,viewport:vp}).promise;strokes=saved.get(pageNo)||[];draw();$("#page-label").textContent=pageNo+" / "+pdf.numPages;let drawing=false,current=null;const ctx=ink.getContext("2d");const pos=e=>{const r=ink.getBoundingClientRect();return{x:(e.clientX-r.left)*ink.width/r.width,y:(e.clientY-r.top)*ink.height/r.height}};ink.onpointerdown=e=>{if(d.status==="submitted"||d.status==="passed")return;drawing=true;ink.setPointerCapture(e.pointerId);const p=pos(e);current={color:mode==="eraser"?"#ffffff":$("#color").value,width:Number($("#width").value)*(mode==="eraser"?5:1),points:[p]};strokes.push(current);draw()};ink.onpointermove=e=>{if(!drawing||!current)return;current.points.push(pos(e));draw()};ink.onpointerup=ink.onpointercancel=()=>{if(drawing){drawing=false;current=null;save()}};function draw(){ctx.clearRect(0,0,ink.width,ink.height);for(const s of strokes){ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();s.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke()}}};const save=async()=>{if(d.status==="submitted"||d.status==="passed")return;$("#save-state").textContent="保存中…";try{await api("/api/submissions/"+d.submission.$id+"/pages/"+pageNo,{method:"PUT",body:JSON.stringify({strokes})});saved.set(pageNo,strokes);$("#save-state").textContent="保存済み";}catch(e){$("#save-state").textContent=e.message}};$("#pen").onclick=()=>mode="pen";$("#eraser").onclick=()=>mode="eraser";$("#prev").onclick=async()=>{if(pageNo>1){await save();pageNo--;await render()}};$("#next").onclick=async()=>{if(pageNo<pdf.numPages){await save();pageNo++;await render()}};$("#submit-work").onclick=async()=>{if(!confirm("答案を提出しますか？提出後は編集できません。"))return;await save();await api("/api/submissions/"+d.submission.$id+"/submit",{method:"POST"});alert("提出しました。");location.href="/student/dashboard.html"};if(d.assignment.status==="submitted"||d.assignment.status==="passed")$("#submit-work").classList.add("hidden");await render();setInterval(()=>{if(d.assignment.status==="in_progress")save()},20000)}catch(e){$("#pdf-stage").textContent=e.message}}
if(path==="/teacher/dashboard.html")teacher();else if(path==="/teacher/materials.html")materials();else if(path==="/teacher/distribution.html")distribution();else if(path==="/teacher/progress.html")progress();else if(path==="/teacher/grading.html")grading();else if(path==="/student/dashboard.html")student();else if(path==="/student/workspace.html")workspace();else location.href="/login.html";

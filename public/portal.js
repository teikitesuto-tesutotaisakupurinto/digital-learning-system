import {Client,Account} from "https://cdn.jsdelivr.net/npm/appwrite@17.0.0/+esm";
const client=new Client().setEndpoint("https://sgp.cloud.appwrite.io/v1").setProject("6b03d796003d1c4e4943");
const account=new Account(client);
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const teacherLinks=[["ダッシュボード","/teacher/dashboard.html"],["教材ライブラリ","/teacher/materials.html"],["教材配信","/teacher/distribution.html"],["提出状況・添削","/teacher/progress.html"]];
const studentLinks=[["学習ホーム","/student/dashboard.html"]];
const path=location.pathname;
async function token(){const t=await account.createJWT();return t.jwt}
async function api(url,options={}){const jwt=await token();const headers={Authorization:"Bearer "+jwt,...(options.headers||{})};if(options.body&&!(options.body instanceof FormData))headers["Content-Type"]="application/json";const r=await fetch(url,{...options,headers});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"処理に失敗しました。");return data}
function notice(msg,ok=false){const el=$("#notice");if(el){el.textContent=msg;el.className="message "+(ok?"success":"error")}}
function shell(title,links){
 const home=links===teacherLinks?"/teacher/dashboard.html":"/student/dashboard.html";
 document.body.innerHTML='<header class="topbar"><a class="brand" href="'+home+'">デジタル問題演習</a><div class="topbar-right"><span id="who" class="user-name"></span><details class="user-menu"><summary>アカウント</summary><div class="user-menu-panel"><button type="button" id="logout" class="menu-action">ログアウト</button></div></details></div></header><div class="layout"><nav class="sidebar">'+links.map(x=>'<a href="'+x[1]+'">'+esc(x[0])+'</a>').join("")+'</nav><main class="content"><div class="page-head"><div><div class="eyebrow">DIGITAL LEARNING PLATFORM</div><h1>'+esc(title)+'</h1></div></div><div id="notice" class="message" role="status"></div><div id="view"></div></main></div><footer>© 2026 デジタル問題演習. All Rights Reserved.</footer>';
 $("#logout").onclick=async()=>{try{await account.deleteSession("current")}catch{}location.replace("/login.html")};
 api("/api/me").then(d=>$("#who").textContent=d.user.name||d.user.email).catch(()=>location.replace("/login.html"));
}
function pathForFolder(id,map){const result=[];let f=map.get(id);while(f){result.unshift(f);f=map.get(f.parentId)}return result}
function folderDescendants(id,folders){const set=new Set([id]);let changed=true;while(changed){changed=false;for(const f of folders){if(f.parentId&&set.has(f.parentId)&&!set.has(f.$id)){set.add(f.$id);changed=true}}}return set}
async function teacher(){
 shell("先生ダッシュボード",teacherLinks);const v=$("#view");
 try{
  const [cr,mr,dr,ur]=await Promise.all([api("/api/classes"),api("/api/materials"),api("/api/distributions"),api("/api/users?role=student")]);
  const classes=cr.classes,students=ur.users;
  v.innerHTML='<div class="grid"><div class="stat"><span>クラス</span><strong>'+classes.length+'</strong></div><div class="stat"><span>登録教材</span><strong>'+mr.materials.length+'</strong></div><div class="stat"><span>配信</span><strong>'+dr.distributions.length+'</strong></div><div class="stat"><span>生徒</span><strong>'+students.length+'</strong></div></div><section class="panel"><h2>クラス管理</h2><form id="class-form" class="row"><input name="name" placeholder="クラス名" required><input name="description" placeholder="説明（任意）"><button class="primary">クラスを作成</button></form><div class="table-wrap"><table><thead><tr><th>クラス名</th><th>クラスコード</th><th></th></tr></thead><tbody>'+classes.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.code)+'</td><td><button type="button" class="secondary" data-manage="'+x.$id+'">生徒を管理</button></td></tr>').join("")+'</tbody></table></div><div id="class-manage" class="manage-area"></div></section><section class="panel"><h2>アカウント登録</h2><form id="student-form" class="form-grid"><label class="field">氏名<input name="name" required></label><label class="field">メールアドレス<input name="email" type="email" required></label><label class="field">初期パスワード<input name="password" type="password" minlength="8" required></label><label class="field">権限<select name="role"><option value="student">生徒</option><option value="teacher">先生</option></select></label><div><button class="primary">アカウントを登録</button></div></form></section><section class="panel"><h2>最近の配信</h2><div class="list">'+dr.distributions.slice(0,8).map(x=>'<div class="list-item"><div><strong>'+esc(x.title)+'</strong><span class="muted small">'+esc(x.status)+'</span></div></div>').join("")+'</div></section>';
  $("#class-form").onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector("button");b.disabled=true;try{await api("/api/classes",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});notice("クラスを作成しました。",true);teacher()}catch(err){notice(err.message);b.disabled=false}};
  $("#student-form").onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector("button");b.disabled=true;try{await api("/api/users",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});notice("アカウントを作成しました。",true);teacher()}catch(err){notice(err.message);b.disabled=false}};
  const manage=async id=>{const cl=classes.find(x=>x.$id===id),area=$("#class-manage");area.innerHTML='<h3>'+esc(cl.name)+'：在籍生徒</h3><div class="row"><select id="add-student"><option value="">生徒を選択</option>'+students.map(s=>'<option value="'+esc(s.authUserId)+'">'+esc(s.displayName)+'（'+esc(s.email)+'）</option>').join("")+'</select><button id="add-student-btn" class="secondary">追加</button></div><div id="class-students" class="list">読み込み中…</div>';const load=async()=>{const x=await api("/api/classes/"+id+"/students");$("#class-students").innerHTML=x.students.map(s=>'<div class="list-item">'+esc(s.studentName||s.studentId)+'<span class="badge">在籍中</span></div>').join("")||"在籍生徒はいません。"};$("#add-student-btn").onclick=async()=>{const studentId=$("#add-student").value;if(!studentId){notice("生徒を選択してください。");return}try{await api("/api/classes/"+id+"/students",{method:"POST",body:JSON.stringify({studentId})});notice("クラスに追加しました。",true);load()}catch(e){notice(e.message)}};await load()};
  v.querySelectorAll("[data-manage]").forEach(el=>el.onclick=()=>manage(el.dataset.manage));
 }catch(e){notice(e.message)}
}
async function materials(){
 shell("教材ライブラリ",teacherLinks);
 const v=$("#view");
 try{
  const [fr,mr]=await Promise.all([api("/api/folders"),api("/api/materials")]);
  const folders=fr.folders||[],items=mr.materials||[],map=new Map(folders.map(x=>[x.$id,x]));
  let current=null,viewMode="list",sortMode="name",query="";
  const selected=new Set();
  const folderPath=id=>pathForFolder(id,map);
  const descendants=id=>folderDescendants(id,folders);
  const fileFolder=id=>{const f=map.get(id);return f?.parentId||null};
  const openFolder=id=>{current=id;query="";render()};
  const makeFolder=async parentId=>{
   const name=prompt("新しいフォルダ名を入力してください。");
   if(!name?.trim())return;
   try{const r=await api("/api/folders",{method:"POST",body:JSON.stringify({name:name.trim(),parentId})});folders.push(r.folder);map.set(r.folder.$id,r.folder);notice("フォルダを作成しました。",true);render()}
   catch(e){notice(e.message)}
  };
  const rename=async(type,id)=>{
   const item=type==="folder"?map.get(id):items.find(x=>x.$id===id);
   const value=prompt(type==="folder"?"フォルダ名を変更":"教材名を変更",type==="folder"?item.name:item.title);
   if(!value?.trim())return;
   try{
    const r=await api((type==="folder"?"/api/folders/":"/api/materials/")+id,{method:"PATCH",body:JSON.stringify(type==="folder"?{name:value.trim()}:{title:value.trim()})});
    Object.assign(item,type==="folder"?r.folder:r.material);notice("名前を変更しました。",true);render();
   }catch(e){notice(e.message)}
  };
  const moveItems=async(keys,destination)=>{
   for(const key of keys){
    if(key.startsWith("f:")){
     const id=key.slice(2);
     if(destination&&descendants(id).has(destination))throw new Error("フォルダを自分自身または配下へ移動できません。");
     const item=map.get(id),r=await api("/api/folders/"+id,{method:"PATCH",body:JSON.stringify({parentId:destination||null})});
     Object.assign(item,r.folder);
    }else{
     const item=items.find(x=>x.$id===key.slice(2)),r=await api("/api/materials/"+item.$id,{method:"PATCH",body:JSON.stringify({folderId:destination||null})});
     Object.assign(item,r.material);
    }
   }
  };
  const preview=async item=>{
   const jwt=await token(),res=await fetch("/api/materials/"+item.$id+"/file",{headers:{Authorization:"Bearer "+jwt}});
   if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||"PDFを開けませんでした。")}
   const blob=await res.blob(),url=URL.createObjectURL(blob),dialog=$("#preview-dialog"),frame=$("#preview-frame");
   frame.src=url;$("#preview-title").textContent=item.title;dialog.showModal();
   dialog.addEventListener("close",()=>{frame.src="about:blank";URL.revokeObjectURL(url)},{once:true});
  };
  const allRows=()=>{
   const isSearch=!!query.trim(),q=query.trim().toLocaleLowerCase();
   let fs=isSearch?folders.filter(x=>String(x.name||"").toLocaleLowerCase().includes(q)):folders.filter(x=>(x.parentId||null)===(current||null));
   let ms=isSearch?items.filter(x=>(String(x.title||"")+" "+String(x.fileName||"")).toLocaleLowerCase().includes(q)):items.filter(x=>(x.folderId||null)===(current||null));
   const cmp=(a,b)=>sortMode==="newest"?String(b.$createdAt||"").localeCompare(String(a.$createdAt||"")):String(a.name||a.title||"").localeCompare(String(b.name||b.title||""),"ja");
   fs.sort(cmp);ms.sort(cmp);return {fs,ms,isSearch};
  };
  const render=()=>{
   const {fs,ms,isSearch}=allRows(),crumbs=folderPath(current);
   const selectionCount=selected.size;
   const rows=fs.map(f=>{
    const key="f:"+f.$id,active=selected.has(key);
    return '<div class="drive-row folder-row" draggable="true" data-drag-type="folder" data-drag-id="'+f.$id+'" data-drop-folder="'+f.$id+'"><input aria-label="選択 '+esc(f.name)+'" type="checkbox" data-select="'+key+'" '+(active?"checked":"")+'><span class="drive-icon folder-symbol" aria-hidden="true">📁</span><button type="button" class="drive-name" data-open="'+f.$id+'">'+esc(f.name)+'</button><span class="drive-type">フォルダ</span><span class="drive-date">'+esc(f.$updatedAt?new Date(f.$updatedAt).toLocaleDateString("ja-JP"):"—")+'</span><div class="drive-actions"><button type="button" data-rename-folder="'+f.$id+'">名前変更</button><button type="button" data-move-single="'+key+'">移動</button></div></div>';
   }).join("");
   const fileRows=ms.map(m=>{
    const key="m:"+m.$id,active=selected.has(key);
    return '<div class="drive-row file-row-drive" draggable="true" data-drag-type="material" data-drag-id="'+m.$id+'"><input aria-label="選択 '+esc(m.title)+'" type="checkbox" data-select="'+key+'" '+(active?"checked":"")+'><span class="drive-icon pdf-symbol" aria-hidden="true">PDF</span><button type="button" class="drive-name" data-preview="'+m.$id+'">'+esc(m.title)+'</button><span class="drive-type">PDF ドキュメント</span><span class="drive-date">'+esc(m.$updatedAt?new Date(m.$updatedAt).toLocaleDateString("ja-JP"):"—")+'</span><div class="drive-actions"><button type="button" data-preview="'+m.$id+'">プレビュー</button><button type="button" data-rename-material="'+m.$id+'">名前変更</button><button type="button" data-move-single="'+key+'">移動</button></div></div>';
   }).join("");
   const gridRows=fs.map(f=>'<div class="drive-card-wrap" draggable="true" data-drag-type="folder" data-drag-id="'+f.$id+'" data-drop-folder="'+f.$id+'"><input aria-label="選択 '+esc(f.name)+'" type="checkbox" data-select="f:'+f.$id+'" '+(selected.has("f:"+f.$id)?"checked":"") +'><button type="button" class="drive-card" data-open="'+f.$id+'"><span class="drive-card-icon folder-symbol">📁</span><span>'+esc(f.name)+'</span><small>フォルダ</small></button></div>').join("")+ms.map(m=>'<div class="drive-card-wrap"><input aria-label="選択 '+esc(m.title)+'" type="checkbox" data-select="m:'+m.$id+'" '+(selected.has("m:"+m.$id)?"checked":"") +'><button type="button" class="drive-card" data-preview="'+m.$id+'"><span class="drive-card-icon pdf-symbol">PDF</span><span>'+esc(m.title)+'</span><small>PDF ドキュメント</small></button></div>').join("");
   v.innerHTML=
    '<div class="drive-shell">'+
     '<aside class="drive-rail"><button type="button" class="drive-new" id="drive-new">＋ 新規</button><button type="button" class="drive-rail-link active" id="drive-home">▣ マイドライブ</button><div class="drive-rail-note">教材ライブラリ</div><a class="drive-rail-link" href="/teacher/distribution.html">↗ 教材配信</a></aside>'+
     '<section class="drive-main">'+
      '<div class="drive-topline"><div class="drive-search"><span aria-hidden="true">⌕</span><input id="drive-search" type="search" placeholder="ドライブ内を検索" value="'+esc(query)+'"></div><button type="button" class="drive-upload" id="drive-upload">アップロード</button></div>'+
      '<div class="drive-heading"><div><div class="breadcrumbs"><a href="#" data-root>マイドライブ</a>'+(!isSearch?crumbs.map(x=>' <span>›</span> <a href="#" data-crumb="'+x.$id+'">'+esc(x.name)+'</a>').join(""):"")+'</div><h2>'+(isSearch?"検索結果":(crumbs.length?esc(crumbs[crumbs.length-1].name):"マイドライブ"))+'</h2></div><div class="drive-view-tools"><label>並べ替え <select id="drive-sort"><option value="name" '+(sortMode==="name"?"selected":"")+'>名前</option><option value="newest" '+(sortMode==="newest"?"selected":"")+'>更新日時</option></select></label><button type="button" class="'+(viewMode==="list"?"active":"")+'" id="drive-list" aria-label="リスト表示">☷</button><button type="button" class="'+(viewMode==="grid"?"active":"")+'" id="drive-grid" aria-label="グリッド表示">▦</button></div></div>'+
      '<div class="drive-selection '+(selectionCount?"shown":"")+'" id="drive-selection"><span>'+selectionCount+'件を選択中</span><button type="button" id="drive-clear">選択解除</button><button type="button" id="drive-move">移動</button><button type="button" id="drive-distribute">選択項目を配信</button></div>'+
      '<div class="drive-content '+(viewMode==="grid"?"grid-mode":"list-mode")+'" id="drive-content">'+(viewMode==="grid"?'<div class="drive-grid">'+(gridRows||'<div class="drive-empty">この場所には項目がありません。</div>')+'</div>':'<div class="drive-list-head"><label><input type="checkbox" id="drive-select-all"> 名前</label><span>種類</span><span>更新日時</span><span>操作</span></div><div class="drive-list">'+(rows+fileRows||'<div class="drive-empty">この場所には項目がありません。</div>')+'</div>')+'</div>'+
      '<div class="drive-drop-hint">フォルダをここへドラッグすると移動できます。</div>'+
     '</section>'+
    '</div>'+
    '<section class="drive-upload-panel hidden" id="drive-upload-panel"><div class="panel"><div class="drive-panel-head"><h2>PDF教材をアップロード</h2><button type="button" id="drive-upload-close">閉じる</button></div><form id="material-form"><div class="form-grid"><label class="field">教材名<input name="title" required></label><label class="field">保存先<input value="'+esc(crumbs.map(x=>x.name).join(" / ")||"マイドライブ")+'" disabled><input type="hidden" name="folderId" value="'+esc(current||"")+'"></label><label class="field">教材PDF<input name="file" type="file" accept="application/pdf" required></label><label class="field">解答・解説PDF（先生専用）<input name="answerFile" type="file" accept="application/pdf"></label></div><label class="field">説明<textarea name="description"></textarea></label><div class="drive-form-actions"><button type="submit" class="primary">アップロードして保存</button></div></form></div></section>'+
    '<dialog id="drive-new-dialog" class="app-dialog"><form method="dialog"><h2>新規作成</h2><button type="button" id="drive-create-folder" class="drive-dialog-action">新しいフォルダ</button><button type="button" id="drive-create-upload" class="drive-dialog-action">ファイルをアップロード</button><div class="dialog-actions"><button value="cancel" class="secondary">閉じる</button></div></form></dialog>'+
    '<dialog id="drive-move-dialog" class="app-dialog"><form method="dialog"><h2>移動先を選択</h2><label class="field">フォルダ<select id="drive-destination"><option value="">マイドライブ（最上位）</option>'+folders.map(f=>'<option value="'+f.$id+'">'+esc(f.path||f.name)+'</option>').join("")+'</select></label><div class="dialog-actions"><button value="cancel" class="secondary">キャンセル</button><button type="button" id="drive-move-confirm" class="primary">ここに移動</button></div></form></dialog>'+
    '<dialog id="preview-dialog" class="drive-preview-dialog"><div class="drive-preview-head"><strong id="preview-title">PDFプレビュー</strong><button type="button" id="preview-close">閉じる</button></div><iframe id="preview-frame" title="PDFプレビュー"></iframe></dialog>';
   v.querySelectorAll("[data-root]").forEach(a=>a.onclick=e=>{e.preventDefault();current=null;query="";render()});
   v.querySelectorAll("[data-crumb]").forEach(a=>a.onclick=e=>{e.preventDefault();openFolder(a.dataset.crumb)});
   v.querySelectorAll("[data-open]").forEach(a=>a.onclick=()=>openFolder(a.dataset.open));
   v.querySelectorAll("[data-preview]").forEach(a=>a.onclick=()=>{const m=items.find(x=>x.$id===a.dataset.preview);preview(m).catch(e=>notice(e.message))});
   v.querySelectorAll("[data-select]").forEach(el=>el.onchange=()=>{el.checked?selected.add(el.dataset.select):selected.delete(el.dataset.select);renderSelection()});
   v.querySelectorAll("[data-rename-folder]").forEach(el=>el.onclick=()=>rename("folder",el.dataset.renameFolder));
   v.querySelectorAll("[data-rename-material]").forEach(el=>el.onclick=()=>rename("material",el.dataset.renameMaterial));
   v.querySelectorAll("[data-move-single]").forEach(el=>el.onclick=()=>{selected.clear();selected.add(el.dataset.moveSingle);$("#drive-move-dialog").showModal()});
   const renderSelection=()=>{const box=$("#drive-selection");box.classList.toggle("shown",selected.size>0);box.querySelector("span").textContent=selected.size+"件を選択中"};
   const selectAll=$("#drive-select-all");
   if(selectAll)selectAll.onchange=()=>{const {fs,ms}=allRows();for(const f of fs)selectAll.checked?selected.add("f:"+f.$id):selected.delete("f:"+f.$id);for(const m of ms)selectAll.checked?selected.add("m:"+m.$id):selected.delete("m:"+m.$id);render()};
   $("#drive-clear").onclick=()=>{selected.clear();render()};
   $("#drive-list").onclick=()=>{viewMode="list";render()};
   $("#drive-grid").onclick=()=>{viewMode="grid";render()};
   $("#drive-sort").onchange=e=>{sortMode=e.target.value;render()};
   $("#drive-search").oninput=e=>{query=e.target.value;const pos=e.target.selectionStart;render();const input=$("#drive-search");input.focus();input.setSelectionRange(pos,pos)};
   $("#drive-home").onclick=()=>{current=null;query="";render()};
   $("#drive-new").onclick=()=>$("#drive-new-dialog").showModal();
   $("#drive-create-folder").onclick=()=>{$("#drive-new-dialog").close();makeFolder(current)};
   $("#drive-create-upload").onclick=()=>{$("#drive-new-dialog").close();$("#drive-upload-panel").classList.remove("hidden")};
   $("#drive-upload").onclick=()=>$("#drive-upload-panel").classList.toggle("hidden");
   $("#drive-upload-close").onclick=()=>$("#drive-upload-panel").classList.add("hidden");
   $("#material-form").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;try{const r=await api("/api/materials",{method:"POST",body:new FormData(form)});items.push(r.material);notice("PDF教材をアップロードしました。",true);render()}catch(err){notice(err.message);button.disabled=false}};
   $("#drive-move").onclick=()=>{if(!selected.size)return;$("#drive-move-dialog").showModal()};
   $("#drive-move-confirm").onclick=async()=>{const destination=$("#drive-destination").value||null;const button=$("#drive-move-confirm");button.disabled=true;try{await moveItems([...selected],destination);selected.clear();$("#drive-move-dialog").close();notice("選択した項目を移動しました。",true);render()}catch(e){notice(e.message)}finally{button.disabled=false}};
   $("#drive-distribute").onclick=()=>{if(!selected.size){notice("配信する項目を選択してください。");return}const materialIds=[...selected].filter(x=>x.startsWith("m:")).map(x=>x.slice(2)),folderIds=[...selected].filter(x=>x.startsWith("f:")).map(x=>x.slice(2));sessionStorage.setItem("dls_distribution_selection",JSON.stringify({materialIds,folderIds}));location.href="/teacher/distribution.html"};
   const newDialog=$("#drive-new-dialog");newDialog.addEventListener("click",e=>{if(e.target===newDialog)newDialog.close()});
   $("#preview-close").onclick=()=>$("#preview-dialog").close();
   const previewDialog=$("#preview-dialog");previewDialog.addEventListener("click",e=>{if(e.target===previewDialog)previewDialog.close()});
   v.querySelectorAll("[data-drop-folder]").forEach(el=>{
    el.ondragover=e=>{e.preventDefault();el.classList.add("drop-target")};
    el.ondragleave=()=>el.classList.remove("drop-target");
    el.ondrop=async e=>{e.preventDefault();el.classList.remove("drop-target");const key=e.dataTransfer.getData("text/plain");if(!key)return;try{await moveItems([key],el.dataset.dropFolder);notice("フォルダへ移動しました。",true);render()}catch(err){notice(err.message)}};
   });
   v.querySelectorAll("[draggable=true]").forEach(el=>el.ondragstart=e=>{const key=(el.dataset.dragType==="folder"?"f:":"m:")+el.dataset.dragId;e.dataTransfer.setData("text/plain",key);e.dataTransfer.effectAllowed="move"});
  };
  render();
 }catch(e){notice(e.message)}
}
async function distribution(){
 shell("教材配信",teacherLinks);const v=$("#view");
 try{
  const [cr,mr,dr,fr]=await Promise.all([api("/api/classes"),api("/api/materials"),api("/api/distributions"),api("/api/folders")]);
  const classes=cr.classes,allMaterials=mr.materials,folders=fr.folders,map=new Map(folders.map(x=>[x.$id,x]));
  const pending=JSON.parse(sessionStorage.getItem("dls_distribution_selection")||"{}");
  let current=null;const chosenMaterials=new Set(pending.materialIds||[]),chosenFolders=new Set(pending.folderIds||[]),targets=new Map();
  const render=async()=>{
   const here=folders.filter(x=>(x.parentId||null)===(current||null)),files=allMaterials.filter(x=>(x.folderId||null)===(current||null)),crumbs=pathForFolder(current,map);
   const ids=new Set(chosenMaterials);for(const id of chosenFolders){const ds=folderDescendants(id,folders);for(const m of allMaterials)if(m.folderId&&ds.has(m.folderId))ids.add(m.$id)}
   const classHtml=classes.map(cl=>'<div class="target-class"><div class="target-head"><label><input type="checkbox" data-target="'+cl.$id+'" '+(targets.has(cl.$id)?"checked":"")+'> <strong>'+esc(cl.name)+'</strong></label><select data-mode="'+cl.$id+'"><option value="all" '+((targets.get(cl.$id)?.mode||"all")==="all"?"selected":"")+'>クラス全体</option><option value="selected" '+((targets.get(cl.$id)?.mode||"all")==="selected"?"selected":"")+'>生徒を個別に選択</option></select></div><div class="student-picker" id="students-'+cl.$id+'"></div></div>').join("")||"先にクラスを作成してください。";
   v.innerHTML='<section class="panel"><h2>配信内容</h2><label class="field">配信タイトル<input id="dist-title" placeholder="例：数学 第1回演習" required></label><h3>教材ライブラリ</h3><div class="breadcrumbs"><a href="#" data-root>教材ライブラリ</a>'+crumbs.map(x=>' › <a href="#" data-crumb="'+x.$id+'">'+esc(x.name)+'</a>').join("")+'</div><div class="picker-list">'+here.map(x=>'<div class="picker-row"><input type="checkbox" data-folder="'+x.$id+'" '+(chosenFolders.has(x.$id)?"checked":"")+'><span class="file-icon folder-icon">▰</span><a href="#" data-open="'+x.$id+'">'+esc(x.name)+'</a><span class="muted small">フォルダ</span></div>').join("")+files.map(x=>'<label class="picker-row"><input type="checkbox" data-material="'+x.$id+'" '+(chosenMaterials.has(x.$id)?"checked":"")+'><span class="file-icon pdf-icon">PDF</span>'+esc(x.title)+'</label>').join("")+(here.length+files.length?"":"<div class=\"empty-state\">このフォルダには項目がありません。</div>")+'</div><div class="selection-summary">選択教材：'+ids.size+'件（フォルダ内の教材を含む）</div></section><section class="panel"><h2>配信先</h2>'+classHtml+'</section><section class="panel"><h2>配信設定</h2><div class="form-grid"><label class="field">配信日時（空欄なら即時）<input id="release-at" type="datetime-local"></label><label class="field">提出期限<input id="due-at" type="datetime-local"></label></div><label class="field">説明<textarea id="dist-description"></textarea></label><div class="review-line"><span id="review-count">配信先：未選択</span><button type="button" class="primary" id="publish">配信内容を確認</button></div></section><section class="panel"><h2>配信履歴</h2><div class="list">'+dr.distributions.map(x=>'<div class="list-item"><strong>'+esc(x.title)+'</strong><span class="badge">'+esc(x.status)+'</span></div>').join("")+'</div></section>';
   v.querySelectorAll("[data-root]").forEach(a=>a.onclick=e=>{e.preventDefault();current=null;render()});v.querySelectorAll("[data-crumb]").forEach(a=>a.onclick=e=>{e.preventDefault();current=a.dataset.crumb;render()});v.querySelectorAll("[data-open]").forEach(a=>a.onclick=e=>{e.preventDefault();current=a.dataset.open;render()});
   v.querySelectorAll("[data-folder]").forEach(el=>el.onchange=()=>{el.checked?chosenFolders.add(el.dataset.folder):chosenFolders.delete(el.dataset.folder);render()});v.querySelectorAll("[data-material]").forEach(el=>el.onchange=()=>{el.checked?chosenMaterials.add(el.dataset.material):chosenMaterials.delete(el.dataset.material);render()});
   for(const cl of classes){const target=targets.get(cl.$id);if(target){const sr=await api("/api/classes/"+cl.$id+"/students"),box=$("#students-"+cl.$id);if(target.mode==="selected"){const picked=new Set(target.studentIds||[]);box.innerHTML=sr.students.map(st=>'<label><input type="checkbox" data-student="'+esc(st.studentId)+'" data-class="'+cl.$id+'" '+(picked.has(st.studentId)?"checked":"")+'> '+esc(st.studentName||st.studentId)+'</label>').join("")}else{box.textContent="在籍生徒全員が対象です（"+sr.students.length+"名）。"}}}
   v.querySelectorAll("[data-target]").forEach(el=>el.onchange=()=>{if(el.checked)targets.set(el.dataset.target,{mode:"all",studentIds:[]});else targets.delete(el.dataset.target);render()});
   v.querySelectorAll("[data-mode]").forEach(el=>el.onchange=()=>{const old=targets.get(el.dataset.mode)||{mode:"all",studentIds:[]};targets.set(el.dataset.mode,{mode:el.value,studentIds:old.studentIds||[]});render()});
   v.querySelectorAll("[data-student]").forEach(el=>el.onchange=()=>{const old=targets.get(el.dataset.class),set=new Set(old.studentIds||[]);el.checked?set.add(el.dataset.student):set.delete(el.dataset.student);targets.set(el.dataset.class,{mode:"selected",studentIds:[...set]});$("#review-count").textContent="選択クラス："+targets.size+"件"});
   const count=[...targets.values()].reduce((n,t)=>n+(t.mode==="selected"?t.studentIds.length:1),0);$("#review-count").textContent="配信先："+targets.size+"クラス／個別指定 "+count+"枠";
   $("#publish").onclick=async()=>{const title=$("#dist-title").value.trim();if(!title||!ids.size||!targets.size){notice("配信タイトル・教材・配信先を指定してください。");return}const targetList=[...targets.entries()].map(([classId,t])=>({classId,mode:t.mode,studentIds:t.studentIds||[]}));const release=$("#release-at").value,due=$("#due-at").value;const body={title,description:$("#dist-description").value,materialIds:[...chosenMaterials],folderIds:[...chosenFolders],targets:targetList,releaseAt:release?new Date(release).toISOString():null,dueAt:due?new Date(due).toISOString():null};const summary=targetList.map(t=>classes.find(x=>x.$id===t.classId).name+(t.mode==="all"?"（クラス全体）":"（個別"+t.studentIds.length+"名）")).join("、");if(!confirm("配信内容を確認してください。\\n教材："+ids.size+"件\\n対象："+summary+"\\n配信してよろしいですか？"))return;const b=$("#publish");b.disabled=true;try{const result=await api("/api/distributions",{method:"POST",body:JSON.stringify(body)});sessionStorage.removeItem("dls_distribution_selection");notice(result.assignedStudents+"名に"+result.materialCount+"教材を配信しました。",true);distribution()}catch(e){notice(e.message);b.disabled=false}};
  };
  await render();
 }catch(e){notice(e.message)}
}
async function progress(){
 shell("提出状況・添削",teacherLinks);const v=$("#view");
 try{
  const [cr,mr]=await Promise.all([api("/api/classes"),api("/api/materials")]),names=new Map(mr.materials.map(x=>[x.$id,x.title]));
  v.innerHTML='<section class="panel"><label class="field">クラス<select id="class-select">'+cr.classes.map(x=>'<option value="'+x.$id+'">'+esc(x.name)+'</option>').join("")+'</select></label><div id="progress-list"></div></section>';
  const load=async()=>{const d=await api("/api/classes/"+$("#class-select").value+"/progress");$("#progress-list").innerHTML=d.students.map(st=>'<section class="progress-student"><h3>'+esc(st.studentName||st.studentId)+'</h3><div class="table-wrap"><table><thead><tr><th>教材</th><th>状態</th><th>提出日時</th><th></th></tr></thead><tbody>'+st.assignments.map(a=>{const sub=a.submission,status=sub?sub.status:a.status,label={locked:"配信前",available:"未着手",in_progress:"学習中",submitted:"提出済み",returned:"再提出",passed:"確認済み"}[status]||status;return '<tr><td>'+esc(names.get(a.materialId)||"教材")+'</td><td>'+label+'</td><td>'+(sub?.submittedAt?new Date(sub.submittedAt).toLocaleString("ja-JP"):"—")+'</td><td>'+(sub?'<a href="/teacher/grading.html?id='+encodeURIComponent(sub.$id)+'">答案を開く</a>':"—")+'</td></tr>'}).join("")+'</tbody></table></div></section>').join("")||"在籍生徒はいません。"};
  $("#class-select").onchange=load;if(cr.classes.length)await load();else $("#progress-list").textContent="先にクラスを作成してください。";
 }catch(e){notice(e.message)}
}
async function student(){
 shell("学習ホーム",studentLinks);const v=$("#view");
 try{
  const d=await api("/api/assignments"),labels={locked:"配信前",available:"未着手",in_progress:"学習中",submitted:"提出済み",returned:"再提出",passed:"確認済み"};
  v.innerHTML='<section class="panel"><h2>配信された教材</h2><div class="table-wrap"><table><thead><tr><th>教材名</th><th>配信名</th><th>期限</th><th>状態</th><th></th></tr></thead><tbody>'+d.assignments.map(a=>'<tr><td><strong>'+esc(a.material?.title||"教材")+'</strong></td><td>'+esc(a.distribution?.title||"")+'</td><td>'+(a.dueAt?new Date(a.dueAt).toLocaleString("ja-JP"):"—")+'</td><td><span class="badge">'+esc(labels[a.status]||a.status)+'</span></td><td>'+(a.status==="locked"?"公開待ち":'<a href="/student/workspace.html?id='+encodeURIComponent(a.$id)+'">教材を開く</a>')+'</td></tr>').join("")+'</tbody></table></div></section>';
 }catch(e){notice(e.message)}
}
function drawStrokes(ctx,items){for(const st of items||[]){if(!st.points?.length)continue;ctx.strokeStyle=st.color||"#2457c5";ctx.lineWidth=Number(st.width)||3;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();st.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke()}}
function eraseAt(strokes,point,radius){let changed=false;for(let i=strokes.length-1;i>=0;i--){const pts=strokes[i].points||[];let hit=pts.some(p=>Math.hypot(p.x-point.x,p.y-point.y)<=radius);for(let j=1;!hit&&j<pts.length;j++){const a=pts[j-1],b=pts[j],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/len)):0;hit=Math.hypot(point.x-(a.x+t*dx),point.y-(a.y+t*dy))<=radius}if(hit){strokes.splice(i,1);changed=true}}return changed}
async function loadPdfEditor(stage,sourceUrl,submission,pages,role,locked){
 const jwt=await token(),resp=await fetch(sourceUrl,{headers:{Authorization:"Bearer "+jwt}});if(!resp.ok)throw new Error("PDF教材を読み込めません。");
 const pdfjs=await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs");pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
 const pdf=await pdfjs.getDocument({data:await resp.arrayBuffer()}).promise;
 const saved=new Map(pages.map(p=>[Number(p.pageNo),{student:JSON.parse(p.studentData||"[]"),teacher:JSON.parse(p.teacherData||"[]")}]));
 let pageNo=1,mode="pen",color=role==="teacher"?"#d13b32":"#1749bd",width=3,strokes=[],drawing=false,current=null,undoStack=[];
 const save=async()=>{if(role==="student"&&locked)return;const body={strokes};await api("/api/submissions/"+submission.$id+"/pages/"+pageNo,{method:"PUT",body:JSON.stringify(body)});const old=saved.get(pageNo)||{student:[],teacher:[]};saved.set(pageNo,role==="teacher"?{student:old.student,teacher:strokes}:{student:strokes,teacher:old.teacher});};
 const render=async()=>{const page=await pdf.getPage(pageNo),vp=page.getViewport({scale:1.25});stage.replaceChildren();stage.classList.add("pdf-stage-ready");const wrap=document.createElement("div");wrap.className="page-wrap";wrap.style.width=vp.width+"px";wrap.style.height=vp.height+"px";const base=document.createElement("canvas");base.className="pdf-base-canvas";base.setAttribute("aria-label","変更されないPDF教材の原本");base.width=vp.width;base.height=vp.height;const ink=document.createElement("canvas");ink.className="ink annotation-canvas";ink.setAttribute("aria-label","書き込みレイヤー");ink.width=vp.width;ink.height=vp.height;wrap.append(base,ink);stage.append(wrap);const baseCtx=base.getContext("2d");if(!baseCtx)throw new Error("PDF表示用Canvasを作成できません。");await page.render({canvasContext:baseCtx,viewport:vp}).promise;const ctx=ink.getContext("2d"),entry=saved.get(pageNo)||{student:[],teacher:[]};strokes=role==="teacher"?entry.teacher:entry.student;const other=role==="teacher"?entry.student:entry.teacher;const paint=()=>{ctx.clearRect(0,0,ink.width,ink.height);drawStrokes(ctx,other);drawStrokes(ctx,strokes)};paint();const label=$("#page-label");if(label)label.textContent=pageNo+" / "+pdf.numPages;const pos=e=>{const r=ink.getBoundingClientRect();return{x:(e.clientX-r.left)*ink.width/r.width,y:(e.clientY-r.top)*ink.height/r.height}};ink.onpointerdown=e=>{if(locked&&role==="student")return;drawing=true;ink.setPointerCapture(e.pointerId);const p=pos(e);if(mode==="eraser"){undoStack.push(JSON.stringify(strokes));eraseAt(strokes,p,width*5);paint();return}undoStack.push(JSON.stringify(strokes));current={color,width,points:[p]};strokes.push(current);paint()};ink.onpointermove=e=>{if(!drawing)return;const p=pos(e);if(mode==="eraser"){if(eraseAt(strokes,p,width*5))paint();return}if(current){current.points.push(p);paint()}};ink.onpointerup=ink.onpointercancel=async()=>{if(!drawing)return;drawing=false;current=null;try{await save();const state=$("#save-state");if(state)state.textContent="保存済み"}catch(err){const state=$("#save-state");if(state)state.textContent=err.message}};};
 const saveCurrent=save;await render();
 return {pdf,get pageNo(){return pageNo},setMode:m=>{mode=m},setColor:c=>{color=c},setWidth:w=>{width=w},async move(delta){const n=pageNo+delta;if(n<1||n>pdf.numPages)return;await saveCurrent();pageNo=n;await render()},async save(){await saveCurrent()},async undo(){if(!undoStack.length)return;strokes=JSON.parse(undoStack.pop());await saveCurrent();await render()}};
}
async function grading(){
 shell("答案の確認・添削",teacherLinks);const v=$("#view"),id=new URLSearchParams(location.search).get("id");if(!id){notice("答案を選択してください。");return}
 try{
  const d=await api("/api/grading/"+id);
  v.innerHTML='<div class="grading-layout"><section class="grading-main"><div class="panel grading-heading"><div><h2>'+esc(d.student?.displayName||"生徒")+' ／ '+esc(d.material.title)+'</h2><p class="muted small">提出状況：'+esc(d.submission.status)+'</p></div><a href="/teacher/progress.html">一覧に戻る</a></div><div class="toolbar"><button id="teacher-pen" aria-pressed="true">添削ペン</button><button id="teacher-eraser" class="secondary" aria-pressed="false">消しゴム</button><button id="teacher-undo" class="secondary">元に戻す</button><input id="teacher-color" type="color" value="#d13b32"><input id="teacher-width" type="range" min="1" max="12" value="3"><button id="teacher-prev" class="secondary">前ページ</button><span id="page-label">1 / 1</span><button id="teacher-next" class="secondary">次ページ</button><span id="save-state" class="muted small"></span></div><div id="grading-stage" class="pdf-stage">答案を読み込んでいます…</div></section><aside class="grading-side"><section class="panel"><h2>採点・返却</h2><form id="grade-form"><label class="field">判定<select name="result"><option value="returned">差し戻し・再提出</option><option value="passed">合格</option></select></label><div class="form-grid"><label class="field">得点<input name="score" type="number" min="0" step="0.5"></label><label class="field">満点<input name="maxScore" type="number" min="0" step="0.5"></label></div><label class="field">先生からのコメント<textarea name="feedback" rows="5"></textarea></label><button class="primary">採点結果を保存して返却</button></form></section><section class="panel"><h2>コメント履歴</h2><div id="comment-list" class="list"></div><form id="comment-form"><label class="field">コメント<input name="body" required></label><button class="secondary">コメントを追加</button></form></section></aside></div>';
  const editor=await loadPdfEditor($("#grading-stage"),d.material.pageUrl,d.submission,d.pages,"teacher",false);
  $("#teacher-pen").onclick=()=>{editor.setMode("pen");$("#teacher-pen").setAttribute("aria-pressed","true");$("#teacher-eraser").setAttribute("aria-pressed","false")};$("#teacher-eraser").onclick=()=>{editor.setMode("eraser");$("#teacher-pen").setAttribute("aria-pressed","false");$("#teacher-eraser").setAttribute("aria-pressed","true")};$("#teacher-color").oninput=e=>editor.setColor(e.target.value);$("#teacher-width").oninput=e=>editor.setWidth(Number(e.target.value));$("#teacher-undo").onclick=()=>editor.undo().catch(e=>notice(e.message));$("#teacher-prev").onclick=()=>editor.move(-1).catch(e=>notice(e.message));$("#teacher-next").onclick=()=>editor.move(1).catch(e=>notice(e.message));
  const cr=await api("/api/submissions/"+id+"/comments");const renderComments=()=>{$("#comment-list").innerHTML=cr.comments.map(x=>'<div class="list-item"><span>'+esc(x.body)+'</span><span class="muted small">'+esc(x.authorRole)+'</span></div>').join("")||"コメントはありません。"};renderComments();
  $("#comment-form").onsubmit=async e=>{e.preventDefault();const body=new FormData(e.currentTarget).get("body");try{await api("/api/submissions/"+id+"/comments",{method:"POST",body:JSON.stringify({body,pageNo:editor.pageNo})});cr.comments.push({body,authorRole:"teacher"});renderComments();e.currentTarget.reset()}catch(err){notice(err.message)}};
  $("#grade-form").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;const gradeData=Object.fromEntries(new FormData(form));const submitButton=form.querySelector("button[type=submit],button:not([type])");if(submitButton)submitButton.disabled=true;try{await editor.save();await api("/api/grading/"+id,{method:"POST",body:JSON.stringify(gradeData)});notice("採点結果を保存して返却しました。",true)}catch(err){notice(err.message);if(submitButton)submitButton.disabled=false}};
 }catch(e){notice(e.message)}
}
async function workspace(){
 const id=new URLSearchParams(location.search).get("id");document.body.innerHTML='<header class="topbar"><a class="brand" href="/student/dashboard.html">デジタル問題演習</a><div class="topbar-right"><span id="who" class="user-name"></span><details class="user-menu"><summary>アカウント</summary><div class="user-menu-panel"><button id="logout" class="menu-action">ログアウト</button></div></details></div></header><main class="workspace"><div class="workspace-bar"><a href="/student/dashboard.html">学習ホームへ戻る</a><strong id="work-title">教材演習</strong><span id="save-state" class="muted small"></span></div><div class="toolbar"><button id="pen" aria-pressed="true">ペン</button><button id="eraser" class="secondary" aria-pressed="false">消しゴム</button><button id="undo" class="secondary">元に戻す</button><input id="color" type="color" value="#1749bd"><input id="width" type="range" min="1" max="12" value="3"><button id="prev" class="secondary">前ページ</button><span id="page-label">1 / 1</span><button id="next" class="secondary">次ページ</button><button id="submit-work" class="primary">提出する</button></div><div id="pdf-stage" class="pdf-stage">教材を読み込んでいます…</div><section class="panel"><h2>先生からのコメント</h2><div id="student-comments" class="list"></div></section></main>';
 $("#logout").onclick=async()=>{try{await account.deleteSession("current")}catch{}location.replace("/login.html")};
 try{
  const d=await api("/api/workspace/"+id);api("/api/me").then(x=>$("#who").textContent=x.user.name||x.user.email).catch(()=>{});$("#work-title").textContent=d.material.title;const cr=await api("/api/submissions/"+d.submission.$id+"/comments");$("#student-comments").innerHTML=cr.comments.map(x=>'<div class="list-item">'+esc(x.body)+'</div>').join("")||"先生からのコメントはまだありません。";
  const locked=["submitted","passed"].includes(d.assignment.status),editor=await loadPdfEditor($("#pdf-stage"),d.material.pageUrl,d.submission,d.pages,"student",locked);
  $("#pen").onclick=()=>{editor.setMode("pen");$("#pen").setAttribute("aria-pressed","true");$("#eraser").setAttribute("aria-pressed","false")};$("#eraser").onclick=()=>{editor.setMode("eraser");$("#pen").setAttribute("aria-pressed","false");$("#eraser").setAttribute("aria-pressed","true")};$("#color").oninput=e=>editor.setColor(e.target.value);$("#width").oninput=e=>editor.setWidth(Number(e.target.value));$("#undo").onclick=()=>editor.undo().catch(e=>notice(e.message));$("#prev").onclick=()=>editor.move(-1).catch(e=>notice(e.message));$("#next").onclick=()=>editor.move(1).catch(e=>notice(e.message));
  $("#submit-work").onclick=async()=>{if(locked)return;if(!confirm("答案を提出しますか？提出後は編集できません。"))return;try{await editor.save();await api("/api/submissions/"+d.submission.$id+"/submit",{method:"POST"});location.replace("/student/dashboard.html")}catch(e){notice(e.message)}};
  if(locked){$("#submit-work").disabled=true;$("#submit-work").textContent="提出済み";$("#pen").disabled=true;$("#eraser").disabled=true}
  setInterval(()=>{if(!locked)editor.save().then(()=>$("#save-state").textContent="自動保存済み").catch(e=>$("#save-state").textContent=e.message)},20000);
 }catch(e){$("#pdf-stage").textContent=e.message}
}
if(path==="/teacher/dashboard.html")teacher();else if(path==="/teacher/materials.html")materials();else if(path==="/teacher/distribution.html")distribution();else if(path==="/teacher/progress.html")progress();else if(path==="/teacher/grading.html")grading();else if(path==="/student/dashboard.html")student();else if(path==="/student/workspace.html")workspace();else location.replace("/login.html");

"use strict";

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const multer = require("multer");
const sdk = require("node-appwrite");
const { InputFile } = require("node-appwrite/file");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "digital-learning-db";
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID || "6b03de94002aa948380c";

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error("APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY are required.");
  process.exit(1);
}

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","SAMEORIGIN");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy","same-origin");
  if(req.path.startsWith("/api/")) res.setHeader("Cache-Control","private, no-store");
  next();
});
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true, limit: "3mb" }));

const adminClient = new sdk.Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const tablesDB = new sdk.TablesDB(adminClient);
const storage = new sdk.Storage(adminClient);
const users = new sdk.Users(adminClient);
const ID = sdk.ID;
const Query = sdk.Query;
const tenantContext = new AsyncLocalStorage();
let DEFAULT_SCHOOL_ID = null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 2 }
});

const schemas = {
  schools: {
    name: "Schools",
    columns: [
      ["name", "varchar", 255, true],
      ["status", "enum", ["active", "suspended"], true],
      ["createdBy", "varchar", 36, false],
      ["plan", "varchar", 40, false]
    ]
  },
  users: {
    name: "Users",
    columns: [
      ["authUserId", "varchar", 36, true],
      ["email", "varchar", 320, true],
      ["displayName", "varchar", 255, true],
      ["role", "enum", ["teacher", "student"], true],
      ["status", "enum", ["active", "suspended"], true]
    ]
  },
  classes: {
    name: "Classes",
    columns: [
      ["name", "varchar", 255, true],
      ["code", "varchar", 64, true],
      ["description", "text", null, false],
      ["createdBy", "varchar", 36, true],
      ["status", "enum", ["active", "archived"], true]
    ]
  },
  enrollments: {
    name: "Enrollments",
    columns: [
      ["classId", "varchar", 36, true],
      ["studentId", "varchar", 36, true],
      ["studentName", "varchar", 255, false],
      ["status", "enum", ["active", "removed"], true]
    ]
  },
  folders: {
    name: "Folders",
    columns: [
      ["name", "varchar", 255, true],
      ["parentId", "varchar", 36, false],
      ["path", "text", null, false],
      ["createdBy", "varchar", 36, true],
      ["isStarred", "boolean", null, false],
      ["isTrashed", "boolean", null, false],
      ["trashedAt", "datetime", null, false]
    ]
  },
  materials: {
    name: "Materials",
    columns: [
      ["title", "varchar", 255, true],
      ["description", "text", null, false],
      ["folderId", "varchar", 36, false],
      ["storageFileId", "varchar", 36, true],
      ["answerFileId", "varchar", 36, false],
      ["fileName", "varchar", 255, true],
      ["createdBy", "varchar", 36, true],
      ["isStarred", "boolean", null, false],
      ["isTrashed", "boolean", null, false],
      ["trashedAt", "datetime", null, false]
    ]
  },
  distributions: {
    name: "Distributions",
    columns: [
      ["title", "varchar", 255, true],
      ["classId", "varchar", 36, true],
      ["description", "text", null, false],
      ["status", "enum", ["draft", "scheduled", "published", "closed"], true],
      ["releaseAt", "datetime", null, false],
      ["dueAt", "datetime", null, false],
      ["createdBy", "varchar", 36, true]
    ]
  },
  distribution_items: {
    name: "Distribution Items",
    columns: [
      ["distributionId", "varchar", 36, true],
      ["materialId", "varchar", 36, true],
      ["orderNo", "integer", null, true]
    ]
  },
  assignments: {
    name: "Assignments",
    columns: [
      ["distributionId", "varchar", 36, true],
      ["materialId", "varchar", 36, true],
      ["classId", "varchar", 36, true],
      ["studentId", "varchar", 36, true],
      ["orderNo", "integer", null, true],
      ["status", "enum", ["locked", "available", "in_progress", "submitted", "returned", "passed"], true],
      ["dueAt", "datetime", null, false],
      ["passedAt", "datetime", null, false]
    ]
  },
  submissions: {
    name: "Submissions",
    columns: [
      ["assignmentId", "varchar", 36, true],
      ["studentId", "varchar", 36, true],
      ["status", "enum", ["draft", "submitted", "returned", "passed"], true],
      ["pageCount", "integer", null, false],
      ["submittedAt", "datetime", null, false]
    ]
  },
  submission_pages: {
    name: "Submission Pages",
    columns: [
      ["submissionId", "varchar", 36, true],
      ["pageNo", "integer", null, true],
      ["studentData", "longtext", null, false],
      ["teacherData", "longtext", null, false]
    ]
  },
  study_sessions: {
    name: "Study Sessions",
    columns: [
      ["assignmentId", "varchar", 36, true],
      ["submissionId", "varchar", 36, true],
      ["studentId", "varchar", 36, true],
      ["startedAt", "datetime", null, true],
      ["lastHeartbeatAt", "datetime", null, true],
      ["durationSeconds", "integer", null, true],
      ["activePageNo", "integer", null, false],
      ["isDrawing", "boolean", null, false],
      ["endedAt", "datetime", null, false]
    ]
  },
  grading_records: {
    name: "Grading Records",
    columns: [
      ["submissionId", "varchar", 36, true],
      ["teacherId", "varchar", 36, true],
      ["result", "enum", ["passed", "returned"], true],
      ["score", "float", null, false],
      ["maxScore", "float", null, false],
      ["feedback", "text", null, false]
    ]
  },
  comments: {
    name: "Comments",
    columns: [
      ["submissionId", "varchar", 36, true],
      ["pageNo", "integer", null, false],
      ["authorId", "varchar", 36, true],
      ["authorRole", "enum", ["teacher", "student"], true],
      ["body", "text", null, true]
    ]
  },
  audit_logs: {
    name: "Audit Logs",
    columns: [
      ["action", "varchar", 255, true],
      ["actorId", "varchar", 36, true],
      ["httpMethod", "varchar", 12, true],
      ["route", "varchar", 512, true],
      ["statusCode", "integer", null, true]
    ]
  },
  system_settings: {
    name: "System Settings",
    columns: [
      ["settingKey", "varchar", 128, true],
      ["settingValue", "mediumtext", null, false]
    ]
  }
};

// Every operational table is scoped to a school. schoolId is optional during
// migration so existing installations can be upgraded without deleting rows.
const TENANT_TABLES = new Set(Object.keys(schemas).filter(tableId => tableId !== "schools"));
for (const tableId of TENANT_TABLES) {
  if (!schemas[tableId].columns.some(column => column[0] === "schoolId")) {
    schemas[tableId].columns.push(["schoolId", "varchar", 36, false]);
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isNotFound(error) {
  return error && (error.code === 404 || error.status === 404);
}

async function ensureColumn(tableId, column) {
  const [key, type, option, required] = column;
  let exists = false;

  try {
    await tablesDB.getColumn({ databaseId: DATABASE_ID, tableId, key });
    exists = true;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  if (exists) return;

  const method = "create" + type.charAt(0).toUpperCase() + type.slice(1) + "Column";
  if (typeof tablesDB[method] !== "function") {
    throw new Error("Unsupported Appwrite column type: " + type);
  }

  const args = {
    databaseId: DATABASE_ID,
    tableId,
    key,
    required: Boolean(required)
  };
  if (type === "varchar") args.size = option;
  if (type === "enum") args.elements = option;

  await tablesDB[method](args);

  for (let i = 0; i < 30; i++) {
    try {
      const current = await tablesDB.getColumn({ databaseId: DATABASE_ID, tableId, key });
      if (!current.status || current.status === "available") return;
      if (current.status === "failed") {
        throw new Error("Column creation failed: " + tableId + "." + key);
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await sleep(500);
  }
  throw new Error("Timed out while creating column " + tableId + "." + key);
}

async function ensureSchema() {
  for (const [tableId, schema] of Object.entries(schemas)) {
    let exists = true;
    try {
      await tablesDB.getTable({ databaseId: DATABASE_ID, tableId });
    } catch (error) {
      if (!isNotFound(error)) throw error;
      exists = false;
    }

    if (!exists) {
      await tablesDB.createTable({
        databaseId: DATABASE_ID,
        tableId,
        name: schema.name,
        permissions: [],
        rowSecurity: false
      });
      await sleep(700);
    }

    for (const column of schema.columns) {
      await ensureColumn(tableId, column);
    }
    console.log("Schema ready: " + tableId);
  }
}

function listRows(tableId, queries = [], limit = 100) {
  const schoolId=tenantContext.getStore();
  const scoped=TENANT_TABLES.has(tableId)&&schoolId
    ? [...queries,Query.equal("schoolId",schoolId)]
    : queries;
  return tablesDB.listRows({databaseId:DATABASE_ID,tableId,queries:[...scoped,Query.limit(Math.min(1000,Math.max(1,limit)))]});
}

async function getRow(tableId,rowId) {
  const row=await tablesDB.getRow({databaseId:DATABASE_ID,tableId,rowId});
  const schoolId=tenantContext.getStore();
  if(TENANT_TABLES.has(tableId)&&schoolId&&row.schoolId!==schoolId) {
    const error=new Error("Resource not found");error.code=404;throw error;
  }
  return row;
}

function createRow(tableId,data) {
  const schoolId=tenantContext.getStore()||DEFAULT_SCHOOL_ID;
  const scopedData=TENANT_TABLES.has(tableId)&&schoolId?{...data,schoolId}:data;
  return tablesDB.createRow({databaseId:DATABASE_ID,tableId,rowId:ID.unique(),data:scopedData,permissions:[]});
}

async function updateRow(tableId,rowId,data) {
  await getRow(tableId,rowId);
  return tablesDB.updateRow({databaseId:DATABASE_ID,tableId,rowId,data});
}

// Create the initial school and attach all pre-existing records to it.
// This migration is additive: no existing user, class, material or submission is deleted.
async function ensureDefaultSchool() {
  const found=await tablesDB.listRows({databaseId:DATABASE_ID,tableId:"schools",queries:[Query.limit(1)]});
  let school=found.rows[0];
  if(!school) {
    school=await tablesDB.createRow({
      databaseId:DATABASE_ID,tableId:"schools",rowId:ID.unique(),
      data:{name:String(process.env.SCHOOL_NAME||"導入校").trim().slice(0,255),status:"active",createdBy:"system",plan:"standard"},
      permissions:[]
    });
  }
  DEFAULT_SCHOOL_ID=school.$id;
  for(const tableId of TENANT_TABLES) {
    let cursor=null;
    for(let page=0;page<100;page++) {
      const queries=[Query.limit(100)];
      if(cursor)queries.push(Query.cursorAfter(cursor));
      const result=await tablesDB.listRows({databaseId:DATABASE_ID,tableId,queries});
      for(const row of result.rows) {
        if(!row.schoolId) {
          await tablesDB.updateRow({databaseId:DATABASE_ID,tableId,rowId:row.$id,data:{schoolId:DEFAULT_SCHOOL_ID}});
        }
      }
      if(result.rows.length<100)break;
      cursor=result.rows[result.rows.length-1].$id;
    }
  }
  console.log("School tenant ready: "+DEFAULT_SCHOOL_ID);
}

// The first authenticated account is registered as the initial teacher.
// This runs only while the application users table is completely empty.
// One-time first-account bootstrap: the first registered application user becomes a teacher.
let bootstrapTeacherPromise = null;

async function getProfile(authUser) {
  const found = await listRows("users", [Query.equal("authUserId", authUser.$id)], 1);
  if (found.rows.length) {
    const profile=found.rows[0];
    if(!profile.schoolId&&DEFAULT_SCHOOL_ID) {
      const migrated=await tablesDB.updateRow({databaseId:DATABASE_ID,tableId:"users",rowId:profile.$id,data:{schoolId:DEFAULT_SCHOOL_ID}});
      return migrated;
    }
    if(profile.role==="admin")return updateRow("users",profile.$id,{role:"teacher"});
    return profile;
  }

  if (!bootstrapTeacherPromise) {
    bootstrapTeacherPromise = (async () => {
      const existingProfiles = await listRows("users", [], 1);
      if (existingProfiles.rows.length) return null;
      return createRow("users", {
        authUserId: authUser.$id,
        email: authUser.email,
        displayName: authUser.name || authUser.email,
        role: "teacher",
        status: "active",
        schoolId: DEFAULT_SCHOOL_ID
      });
    })().finally(() => { bootstrapTeacherPromise = null; });
  }

  const created = await bootstrapTeacherPromise;
  if (created && created.authUserId === authUser.$id) {
    console.log("Initial teacher profile created for: " + authUser.email);
    return created;
  }
  const after = await listRows("users", [Query.equal("authUserId", authUser.$id)], 1);
  return after.rows[0] || null;
}

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "ログインしてください。" });

    const userClient = new sdk.Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setJWT(token);
    const account = new sdk.Account(userClient);
    const authUser = await account.get();
    const profile=await getProfile(authUser);

    if(!profile){
      return res.status(403).json({
        error: "このアカウントには利用権限がありません。管理者に登録を依頼してください。"
      });
    }
    if(profile.status!=="active")return res.status(403).json({error:"このアカウントは停止されています。"});
    if(profile.schoolId){
      const school=await getRow("schools",profile.schoolId).catch(()=>null);
      if(!school||school.status!=="active")return res.status(403).json({error:"この学校のサービス利用は停止されています。"});
    }

    req.authUser=authUser;
    req.profile=profile;
    if(!profile.schoolId)return res.status(403).json({error:"所属校舎が設定されていません。管理者にお問い合わせください。"});
    res.on("finish",()=>{
      if(["GET","HEAD","OPTIONS"].includes(req.method))return;
      tenantContext.run(profile.schoolId,()=>{
        createRow("audit_logs",{
          action:req.method+" "+req.path,
          actorId:authUser.$id,
          httpMethod:req.method,
          route:String(req.path).slice(0,512),
          statusCode:res.statusCode
        }).catch(error=>console.error("Audit log write failed:",error.message));
      });
    });
    tenantContext.run(profile.schoolId,()=>next());
  } catch (error) {
    console.error("Authentication failed:", error.message);
    res.status(401).json({ error: "認証の有効期限が切れました。再ログインしてください。" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.role)) {
      return res.status(403).json({ error: "この操作を行う権限がありません。" });
    }
    next();
  };
}
// Tenant authorization is enforced centrally by AsyncLocalStorage-backed schoolId scoping.
 // Teachers within one school can collaborate; records from other schools are invisible.
async function teacherOwnsClass(req,classId) {
  if(req.profile.role!=="teacher")return false;
  return Boolean(await getRow("classes",classId).catch(()=>null));
}
async function teacherOwnsAssignment(req,assignment) {
  return Boolean(assignment && await teacherOwnsClass(req,assignment.classId));
}
async function teacherOwnsSubmission(req,submission) {
  if(!submission) return false;
  const assignment=await getRow("assignments",submission.assignmentId).catch(()=>null);
  return teacherOwnsAssignment(req,assignment);
}
async function teacherOwnsMaterial(req,material) {
  if(req.profile.role!=="teacher"||!material)return false;
  return Boolean(await getRow("materials",material.$id).catch(()=>null));
}

async function findMaterial(materialId) {
  return getRow("materials", materialId);
}

async function findLatestSubmission(assignmentId, studentId) {
  const result = await listRows("submissions", [
    Query.equal("assignmentId", assignmentId),
    Query.equal("studentId", studentId),
    Query.orderDesc("$createdAt")
  ], 20);
  return result.rows[0] || null;
}

async function fetchRowsByIds(tableId,field,ids,extraQueries=[],order=[],limit=1000) {
  if(!ids.length)return [];
  const chunks=[];
  for(let i=0;i<ids.length;i+=40)chunks.push(ids.slice(i,i+40));
  const pages=await Promise.all(chunks.map(chunk=>listRows(tableId,[
    Query.equal(field,chunk),...extraQueries,...order
  ],limit)));
  return pages.flatMap(page=>page.rows||[]);
}

async function ensureSubmission(assignment) {
  let submission = await findLatestSubmission(assignment.$id, assignment.studentId);
  if (!submission) {
    submission = await createRow("submissions", {
      assignmentId: assignment.$id,
      studentId: assignment.studentId,
      status: "draft",
      pageCount: 0
    });
  }
  return submission;
}

async function canReadAssignment(req, assignment) {
  if (req.profile.role === "teacher") return true;
  return assignment.studentId === req.authUser.$id;
}

async function unlockNextAssignment(assignment) {
  const rows = await listRows("assignments", [
    Query.equal("distributionId", assignment.distributionId),
    Query.equal("studentId", assignment.studentId)
  ], 100);
  const ordered = rows.rows.sort((a, b) => Number(a.orderNo) - Number(b.orderNo));
  const currentIndex = ordered.findIndex(row => row.$id === assignment.$id);
  const next = ordered[currentIndex + 1];
  if (next && next.status === "locked") {
    await updateRow("assignments", next.$id, { status: "available" });
  }
}

async function refreshScheduledAssignments(studentId) {
  const result = await listRows("assignments", [
    Query.equal("studentId", studentId),
    Query.equal("status", "locked")
  ], 100);
  const now = Date.now();

  for (const assignment of result.rows) {
    const distribution = await getRow("distributions", assignment.distributionId);
    if (distribution.status === "scheduled" && distribution.releaseAt &&
        new Date(distribution.releaseAt).getTime() <= now &&
        Number(assignment.orderNo) === 1) {
      await updateRow("assignments", assignment.$id, { status: "available" });
      await updateRow("distributions", distribution.$id, { status: "published" });
    }
  }
}

async function getSystemSetting(key) {
  const result = await listRows("system_settings", [Query.equal("settingKey", key)], 1);
  return result.rows[0] || null;
}

/* Health */
app.get("/api/health",(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  res.json({success:true,service:"digital-learning-system",status:"ok",timestamp:new Date().toISOString()});
});

app.get("/api/school",authenticate,requireRole("teacher"),async(req,res)=>{
  try{
    const school=await getRow("schools",req.profile.schoolId);
    res.json({success:true,school:{id:school.$id,name:school.name,status:school.status,plan:school.plan||"standard"}});
  }catch(error){res.status(404).json({error:"所属校舎情報を取得できませんでした。"});}
});
app.patch("/api/school",authenticate,requireRole("teacher"),async(req,res)=>{
  const name=String(req.body.name||"").trim();
  if(!name||name.length>255)return res.status(400).json({error:"校舎名は1〜255文字で入力してください。"});
  try{
    const school=await getRow("schools",req.profile.schoolId);
    const updated=await tablesDB.updateRow({databaseId:DATABASE_ID,tableId:"schools",rowId:school.$id,data:{name}});
    res.json({success:true,school:{id:updated.$id,name:updated.name,status:updated.status,plan:updated.plan||"standard"}});
  }catch(error){res.status(500).json({error:"校舎情報を更新できませんでした。"});}
});

function requirePlatformAdmin(req,res,next){
  const allowlist=String(process.env.PLATFORM_ADMIN_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!allowlist.includes(String(req.authUser?.email||"").toLowerCase()))return res.status(403).json({error:"プラットフォーム管理者のみ実行できます。"});
  next();
}
app.get("/api/platform/schools",authenticate,requirePlatformAdmin,async(req,res)=>{
  try{
    const result=await listRows("schools",[],500);
    res.json({success:true,schools:result.rows.map(row=>({id:row.$id,name:row.name,status:row.status,plan:row.plan||"standard"}))});
  }catch(error){res.status(500).json({error:"学校一覧を取得できませんでした。"});}
});
app.patch("/api/platform/schools/:id/status",authenticate,requirePlatformAdmin,async(req,res)=>{
  const status=String(req.body.status||"");
  if(!["active","suspended"].includes(status))return res.status(400).json({error:"学校ステータスが不正です。"});
  try{
    const school=await getRow("schools",req.params.id);
    const updated=await tablesDB.updateRow({databaseId:DATABASE_ID,tableId:"schools",rowId:school.$id,data:{status}});
    res.json({success:true,school:{id:updated.$id,name:updated.name,status:updated.status}});
  }catch(error){res.status(404).json({error:"学校が見つかりません。"});}
});
app.post("/api/platform/schools",authenticate,requirePlatformAdmin,async(req,res)=>{
  const schoolName=String(req.body.schoolName||"").trim();
  const email=String(req.body.email||"").trim().toLowerCase();
  const name=String(req.body.name||"").trim();
  const password=String(req.body.password||"");
  if(!schoolName||schoolName.length>255||!email||!name||password.length<12){
    return res.status(400).json({error:"学校名・管理者名・メールアドレス・12文字以上の初期パスワードを指定してください。"});
  }
  let school=null,authUser=null;
  try{
    school=await tablesDB.createRow({databaseId:DATABASE_ID,tableId:"schools",rowId:ID.unique(),data:{name:schoolName,status:"active",createdBy:req.authUser.$id,plan:"standard"},permissions:[]});
    authUser=await users.create({userId:ID.unique(),email,password,name});
    const profile=await tenantContext.run(school.$id,()=>createRow("users",{
      authUserId:authUser.$id,email,displayName:name,role:"teacher",status:"active"
    }));
    res.status(201).json({success:true,school:{id:school.$id,name:school.name},owner:{id:profile.authUserId,email:profile.email,name:profile.displayName}});
  }catch(error){
    if(authUser)await users.delete({userId:authUser.$id}).catch(()=>{});
    if(school)await tablesDB.deleteRow({databaseId:DATABASE_ID,tableId:"schools",rowId:school.$id}).catch(()=>{});
    const message=error.code===409?"このメールアドレスは既に登録されています。":"学校アカウントを作成できませんでした。";
    res.status(400).json({error:message});
  }
});

app.get("/api/me",authenticate,async(req,res)=>{
  const allowlist=String(process.env.PLATFORM_ADMIN_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  const school=await getRow("schools",req.profile.schoolId).catch(()=>null);
  res.json({
    success:true,
    user:{
      id:req.authUser.$id,
      email:req.authUser.email,
      name:req.profile.displayName,
      role:req.profile.role,
      schoolName:school?.name||"",
      platformAdmin:allowlist.includes(String(req.authUser.email||"").toLowerCase())
    }
  });
});

app.get("/api/dashboard/summary",authenticate,requireRole("teacher"),async(req,res)=>{
  try{
    const [classes,materials,distributions,students]=await Promise.all([
      listRows("classes",[Query.equal("status","active")],500),
      listRows("materials",[],1000),
      listRows("distributions",[],500),
      listRows("users",[Query.equal("role","student"),Query.equal("status","active")],1000)
    ]);
    res.json({
      success:true,
      classes:classes.rows,
      materialCount:materials.rows.length,
      distributions:distributions.rows,
      students:students.rows
    });
  }catch(error){console.error("Dashboard summary failed:",error);res.status(500).json({error:"ダッシュボード情報を取得できませんでした。"});}
});

app.get("/api/material-library",authenticate,requireRole("teacher"),async(req,res)=>{
  try{
    const [folders,materials]=await Promise.all([
      listRows("folders",[],1000),
      listRows("materials",[],1000)
    ]);
    res.json({success:true,folders:folders.rows,materials:materials.rows});
  }catch(error){console.error("Material library load failed:",error);res.status(500).json({error:"教材ライブラリを取得できませんでした。"});}
});

/* Users */
app.get("/api/users", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const role=req.query.role;
    if(role && !["teacher","student"].includes(role)) return res.status(400).json({error:"指定されたユーザー種別は無効です。"});
    const result=await listRows("users",role?[Query.equal("role",role)]:[],500);
    res.json({success:true,users:result.rows});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "ユーザー一覧を取得できませんでした。" });
  }
});

app.post("/api/users", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "student");

    if (!email || !name || password.length < 8) {
      return res.status(400).json({ error: "メール・氏名・8文字以上のパスワードを入力してください。" });
    }
    if (!["teacher", "student"].includes(role)) {
      return res.status(400).json({ error: "権限は先生または生徒を選択してください。" });
    }

    const authUser = await users.create({
      userId: ID.unique(),
      email,
      password,
      name
    });
    const profile = await createRow("users", {
      authUserId: authUser.$id,
      email,
      displayName: name,
      role,
      status: "active"
    });
    res.status(201).json({ success: true, user: profile });
  } catch (error) {
    console.error("User creation failed:", error.message);
    const msg = error.code === 409 ? "このメールアドレスは既に登録されています。" :
      "アカウントを作成できませんでした。Appwrite API KeyのUsers権限を確認してください。";
    res.status(400).json({ error: msg });
  }
});

app.patch("/api/users/:id/status", authenticate, requireRole("teacher"), async (req, res) => {
  const status = req.body.status;
  if (!["active", "suspended"].includes(status)) {
    return res.status(400).json({ error: "statusが不正です。" });
  }
  try {
    const updated = await updateRow("users", req.params.id, { status });
    res.json({ success: true, user: updated });
  } catch (error) {
    res.status(500).json({ error: "ユーザー状態を更新できませんでした。" });
  }
});

/* Classes and enrollment */
app.get("/api/classes", authenticate, async (req, res) => {
  try {
    if (req.profile.role === "student") {
      const enrollments = await listRows("enrollments", [
        Query.equal("studentId", req.authUser.$id),
        Query.equal("status", "active")
      ], 100);
      const ids = [...new Set(enrollments.rows.map(x => x.classId))];
      const classes = await Promise.all(ids.map(id => getRow("classes", id).catch(() => null)));
      return res.json({ success: true, classes: classes.filter(Boolean) });
    }
    const result=await listRows("classes",[Query.equal("status","active")],500);
    res.json({success:true,classes:result.rows});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "クラス一覧を取得できませんでした。" });
  }
});

app.post("/api/classes", authenticate, requireRole("teacher"), async (req, res) => {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim();
  if (!name) return res.status(400).json({ error: "クラス名を入力してください。" });
  try {
    const row = await createRow("classes", {
      name,
      code: crypto.randomBytes(4).toString("hex").toUpperCase(),
      description,
      createdBy: req.authUser.$id,
      status: "active"
    });
    res.status(201).json({ success: true, class: row });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "クラスを作成できませんでした。" });
  }
});

app.get("/api/classes/:id/students", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    if(!(await teacherOwnsClass(req,req.params.id))) return res.status(404).json({error:"クラスが見つからないか、閲覧権限がありません。"});
    const rows = await listRows("enrollments", [
      Query.equal("classId", req.params.id),
      Query.equal("status", "active")
    ], 100);
    res.json({ success: true, students: rows.rows });
  } catch (error) {
    res.status(500).json({ error: "生徒一覧を取得できませんでした。" });
  }
});

app.post("/api/classes/:id/students", authenticate, requireRole("teacher"), async (req, res) => {
  const studentId = String(req.body.studentId || "").trim();
  if (!studentId) return res.status(400).json({ error: "生徒を選択してください。" });
  try {
    if(!(await teacherOwnsClass(req,req.params.id))) return res.status(404).json({error:"クラスが見つからないか、編集権限がありません。"});
    const studentResult = await listRows("users", [
      Query.equal("authUserId", studentId),
      Query.equal("role", "student")
    ], 1);
    if (!studentResult.rows[0]) return res.status(404).json({ error: "生徒アカウントが見つかりません。" });
    const existing = await listRows("enrollments", [
      Query.equal("classId", req.params.id),
      Query.equal("studentId", studentId),
      Query.equal("status", "active")
    ], 1);
    if (existing.rows.length) return res.status(409).json({ error: "この生徒は既に登録されています。" });

    const row = await createRow("enrollments", {
      classId: req.params.id,
      studentId,
      studentName: studentResult.rows[0].displayName,
      status: "active"
    });
    res.status(201).json({ success: true, enrollment: row });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "クラスへの登録に失敗しました。" });
  }
});

/* Material folders */
app.get("/api/folders", authenticate, requireRole("teacher"), async (req, res) => {
  const rows=await listRows("folders",[],500);
  res.json({success:true,folders:rows.rows});
});

app.post("/api/folders", authenticate, requireRole("teacher"), async (req, res) => {
  const name = String(req.body.name || "").trim();
  const parentId = String(req.body.parentId || "").trim() || null;
  if (!name) return res.status(400).json({ error: "フォルダー名を入力してください。" });
  try {
    const parent=parentId?await getRow("folders",parentId):null;
    if(parentId&&!parent)return res.status(404).json({error:"親フォルダが見つかりません。"});
    const folder = await createRow("folders", {
      name,
      parentId,
      path: parent ? [parent.path || parent.name, name].filter(Boolean).join("/") : name,
      createdBy: req.authUser.$id,
      isStarred: false,
      isTrashed: false,
      trashedAt: null
    });
    res.status(201).json({ success: true, folder });
  } catch (error) {
    res.status(500).json({ error: "フォルダーを作成できませんでした。" });
  }
});

app.patch("/api/folders/:id", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const folders=(await listRows("folders",[],1000)).rows;
    const current=folders.find(x=>x.$id===req.params.id);
    if (!current) return res.status(404).json({ error: "フォルダが見つかりません。" });
    const nextName = String(req.body.name ?? current.name).trim();
    const nextParentId = req.body.parentId === undefined ? (current.parentId || null) : (String(req.body.parentId || "").trim() || null);
    if (!nextName) return res.status(400).json({ error: "フォルダ名を入力してください。" });
    const descendants = new Set([current.$id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (folder.parentId && descendants.has(folder.parentId) && !descendants.has(folder.$id)) {
          descendants.add(folder.$id);
          changed = true;
        }
      }
    }
    if (nextParentId && descendants.has(nextParentId)) {
      return res.status(400).json({ error: "自分自身または配下のフォルダには移動できません。" });
    }
    const parent = nextParentId ? folders.find(x => x.$id === nextParentId) : null;
    if (nextParentId && !parent) return res.status(404).json({ error: "移動先フォルダが見つかりません。" });
    const nextPath = [parent ? (parent.path || parent.name) : "", nextName].filter(Boolean).join("/");
    const folderData = { name: nextName, parentId: nextParentId, path: nextPath };
    if (req.body.isStarred !== undefined) folderData.isStarred = Boolean(req.body.isStarred);
    if (req.body.isTrashed !== undefined) {
      folderData.isTrashed = Boolean(req.body.isTrashed);
      folderData.trashedAt = folderData.isTrashed ? new Date().toISOString() : null;
    }
    const updated = await updateRow("folders", current.$id, folderData);
    const byId = new Map(folders.map(x => [x.$id, x]));
    byId.set(current.$id, updated);
    const refresh = async folderId => {
      const parentFolder = byId.get(folderId);
      for (const child of folders.filter(x => x.parentId === folderId)) {
        const childPath = [parentFolder.path, child.name].filter(Boolean).join("/");
        const childData = { path: childPath };
        if (req.body.isTrashed !== undefined) {
          childData.isTrashed = Boolean(req.body.isTrashed);
          childData.trashedAt = childData.isTrashed ? new Date().toISOString() : null;
        }
        if (req.body.isStarred !== undefined) childData.isStarred = Boolean(req.body.isStarred);
        const childUpdated = await updateRow("folders", child.$id, childData);
        byId.set(child.$id, childUpdated);
        await refresh(child.$id);
      }
    };
    await refresh(current.$id);
    if (req.body.isTrashed !== undefined) {
      const affectedMaterials=await listRows("materials",[],1000);
      for (const material of affectedMaterials.rows) {
        if (material.folderId && descendants.has(material.folderId)) {
          await updateRow("materials", material.$id, {
            isTrashed: Boolean(req.body.isTrashed),
            trashedAt: req.body.isTrashed ? new Date().toISOString() : null
          });
        }
      }
    }
    res.json({ success: true, folder: updated });
  } catch (error) {
    console.error("Folder update failed:", error);
    res.status(500).json({ error: "フォルダを更新できませんでした。" });
  }
});

/* PDF material library */
app.patch("/api/materials/:id", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const material=await getRow("materials",req.params.id);
    if(!(await teacherOwnsMaterial(req,material))) return res.status(404).json({error:"教材が見つからないか、編集権限がありません。"});
    const data = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title || "").trim();
      if (!title) return res.status(400).json({ error: "教材名を入力してください。" });
      data.title = title;
    }
    if (req.body.folderId !== undefined) {
      const folderId = String(req.body.folderId || "").trim() || null;
      if(folderId)await getRow("folders",folderId);
      data.folderId = folderId;
    }
    if (req.body.isStarred !== undefined) data.isStarred = Boolean(req.body.isStarred);
    if (req.body.isTrashed !== undefined) {
      data.isTrashed = Boolean(req.body.isTrashed);
      data.trashedAt = data.isTrashed ? new Date().toISOString() : null;
    }
    const updated = await updateRow("materials", material.$id, data);
    res.json({ success: true, material: updated });
  } catch (error) {
    res.status(500).json({ error: "教材を更新できませんでした。" });
  }
});

app.get("/api/materials", authenticate, requireRole("teacher"), async (req, res) => {
  const result=await listRows("materials",[],500);
  res.json({success:true,materials:result.rows});
});

app.post("/api/materials", authenticate, requireRole("teacher"), upload.fields([
  { name: "file", maxCount: 1 },
  { name: "answerFile", maxCount: 1 }
]), async (req, res) => {
  try {
    const file = req.files && req.files.file && req.files.file[0];
    const answerFile = req.files && req.files.answerFile && req.files.answerFile[0];
    const title = String(req.body.title || "").trim();
    const folderId = String(req.body.folderId || "").trim() || null;
    const description = String(req.body.description || "").trim();

    if(!file||!title)return res.status(400).json({error:"教材名とPDFファイルを指定してください。"});
    if(title.length>255||description.length>5000)return res.status(400).json({error:"教材名は255文字以内、説明は5000文字以内で入力してください。"});
    if(folderId)await getRow("folders",folderId);
    if(answerFile&&(answerFile.mimetype!=="application/pdf"||answerFile.buffer.subarray(0,5).toString()!=="%PDF-"))return res.status(400).json({error:"解答ファイルもPDFを指定してください。"});
    if (file.mimetype !== "application/pdf" || file.buffer.subarray(0, 5).toString() !== "%PDF-") {
      return res.status(400).json({ error: "PDFファイルのみ登録できます。" });
    }

    const stored = await storage.createFile({
      bucketId: BUCKET_ID,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(file.buffer, file.originalname),
      permissions: []
    });

    let storedAnswer = null;
    if (answerFile) {
      if (answerFile.mimetype !== "application/pdf" || answerFile.buffer.subarray(0, 5).toString() !== "%PDF-") {
        return res.status(400).json({ error: "解答ファイルもPDFを指定してください。" });
      }
      storedAnswer = await storage.createFile({
        bucketId: BUCKET_ID,
        fileId: ID.unique(),
        file: InputFile.fromBuffer(answerFile.buffer, answerFile.originalname),
        permissions: []
      });
    }

    const material = await createRow("materials", {
      title,
      description,
      folderId,
      storageFileId: stored.$id,
      answerFileId: storedAnswer ? storedAnswer.$id : null,
      fileName: file.originalname,
      createdBy: req.authUser.$id,
      isStarred: false,
      isTrashed: false,
      trashedAt: null
    });
    res.status(201).json({ success: true, material });
  } catch (error) {
    console.error("Material upload failed:", error);
    res.status(500).json({ error: "教材を登録できませんでした。Storage設定とファイル容量を確認してください。" });
  }
});

app.get("/api/materials/:id/file", authenticate, async (req, res) => {
  try {
    const material = await findMaterial(req.params.id);
    let fileId = material.storageFileId;

    if(req.query.answer==="1"){
      if(req.profile.role!=="teacher"||!(await teacherOwnsMaterial(req,material)))return res.status(403).json({error:"解答ファイルを閲覧する権限がありません。"});
      fileId=material.answerFileId;
    } else if(req.profile.role==="teacher"&&!(await teacherOwnsMaterial(req,material))){
      return res.status(404).json({error:"教材が見つかりません。"});
    } else if (req.profile.role === "student") {
      const assigned=await listRows("assignments",[
        Query.equal("studentId",req.authUser.$id),Query.equal("materialId",material.$id)
      ],100);
      const released=assigned.rows.some(item=>["available","in_progress","submitted","returned","passed"].includes(item.status));
      if(!released)return res.status(403).json({error:"この教材はまだ利用できません。"});
    }

    if (!fileId) return res.status(404).json({ error: "ファイルがありません。" });
    const response = await fetch(
      ENDPOINT + "/storage/buckets/" + BUCKET_ID + "/files/" + fileId + "/view",
      { headers: { "X-Appwrite-Project": PROJECT_ID, "X-Appwrite-Key": API_KEY } }
    );
    if (!response.ok) throw new Error("Storage returned " + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"material.pdf\"");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(bytes);
  } catch (error) {
    console.error(error);
    res.status(404).json({ error: "PDFを表示できませんでした。" });
  }
});

/* Distribution and assignments */
app.get("/api/distributions", authenticate, requireRole("teacher"), async (req, res) => {
  const result=await listRows("distributions",[],500);
  res.json({success:true,distributions:result.rows});
});

app.post("/api/distributions", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const releaseAt = req.body.releaseAt ? new Date(req.body.releaseAt).toISOString() : null;
    const dueAt = req.body.dueAt ? new Date(req.body.dueAt).toISOString() : null;
    const targets = Array.isArray(req.body.targets) ? req.body.targets : [];
    const explicitMaterialIds = Array.isArray(req.body.materialIds) ? req.body.materialIds : [];
    const selectedFolderIds = Array.isArray(req.body.folderIds) ? req.body.folderIds : [];
    if (!title || !targets.length || (!explicitMaterialIds.length && !selectedFolderIds.length)) {
      return res.status(400).json({ error: "配信名・配信先・教材を指定してください。" });
    }

    const allFolders=(await listRows("folders",[],1000)).rows;
    const allMaterials=(await listRows("materials",[Query.equal("isTrashed",false)],1000)).rows;
    const folderSet = new Set(selectedFolderIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of allFolders) {
        if (folder.parentId && folderSet.has(folder.parentId) && !folderSet.has(folder.$id)) {
          folderSet.add(folder.$id);
          changed = true;
        }
      }
    }
    const materialIds = [...new Set([
      ...explicitMaterialIds,
      ...allMaterials.filter(item => item.folderId && folderSet.has(item.folderId)).map(item => item.$id)
    ])];
    if (!materialIds.length) return res.status(400).json({ error: "選択したフォルダに配信できる教材がありません。" });

    const materialMap = new Map(allMaterials.map(item => [item.$id, item]));
    const materials = materialIds.map(id => materialMap.get(id)).filter(Boolean);
    if (materials.length !== materialIds.length) {
      return res.status(400).json({ error: "存在しない教材が選択されています。" });
    }

    const scheduled = releaseAt && new Date(releaseAt).getTime() > Date.now();
    const status = scheduled ? "scheduled" : "published";
    const results = [];
    const alreadyAssigned = new Set();
    let assignedStudents = 0;

    for (const target of targets) {
      const classId = String(target.classId || "");
      const classRow=await getRow("classes",classId);
      if(!(await teacherOwnsClass(req,classId)))return res.status(404).json({error:"配信先クラスが見つかりません。"});
      const enrollments = await listRows("enrollments", [
        Query.equal("classId", classId),
        Query.equal("status", "active")
      ], 500);
      const mode = target.mode === "selected" ? "selected" : "all";
      const requested = mode === "selected"
        ? [...new Set(Array.isArray(target.studentIds) ? target.studentIds : [])]
        : enrollments.rows.map(row => row.studentId);
      if (mode === "selected" && !requested.length) {
        return res.status(400).json({ error: classRow.name + " の配信対象生徒を選択してください。" });
      }
      const enrollmentMap = new Map(enrollments.rows.map(row => [row.studentId, row]));
      const selectedEnrollments = requested.map(id => enrollmentMap.get(id)).filter(Boolean);
      if (selectedEnrollments.length !== requested.length) {
        return res.status(400).json({ error: classRow.name + " に在籍していない生徒が含まれています。" });
      }
      if (!selectedEnrollments.length) {
        return res.status(400).json({ error: classRow.name + " に配信対象の生徒がいません。" });
      }
      const freshEnrollments = selectedEnrollments.filter(enrollment => !alreadyAssigned.has(enrollment.studentId));
      if (!freshEnrollments.length) continue;

      const distribution = await createRow("distributions", {
        title, classId, description, status, releaseAt, dueAt,
        createdBy: req.authUser.$id
      });
      for (let index = 0; index < materials.length; index++) {
        await createRow("distribution_items", {
          distributionId: distribution.$id,
          materialId: materials[index].$id,
          orderNo: index + 1
        });
      }
      let classAssigned = 0;
      for (const enrollment of freshEnrollments) {
        alreadyAssigned.add(enrollment.studentId);
        classAssigned++;
        for (let index = 0; index < materials.length; index++) {
          await createRow("assignments", {
            distributionId: distribution.$id,
            materialId: materials[index].$id,
            classId: classRow.$id,
            studentId: enrollment.studentId,
            orderNo: index + 1,
            status: scheduled || index > 0 ? "locked" : "available",
            dueAt
          });
        }
      }
      assignedStudents += classAssigned;
      results.push({ distributionId: distribution.$id, classId, className: classRow.name, students: classAssigned });
    }

    res.status(201).json({ success: true, distributions: results, assignedStudents, materialCount: materials.length });
  } catch (error) {
    console.error("Distribution failed:", error);
    res.status(500).json({ error: "教材を配信できませんでした。" });
  }
});

app.get("/api/assignments",authenticate,async(req,res)=>{
  try{
    if(req.profile.role==="student"){
      await refreshScheduledAssignments(req.authUser.$id);
      const result=await listRows("assignments",[Query.equal("studentId",req.authUser.$id),Query.orderDesc("$createdAt")],500);
      const rows=result.rows;
      const assignmentIds=rows.map(item=>item.$id);
      const materialIds=[...new Set(rows.map(item=>item.materialId).filter(Boolean))];
      const distributionIds=[...new Set(rows.map(item=>item.distributionId).filter(Boolean))];
      const [materials,distributions,sessions,submissions]=await Promise.all([
        fetchRowsByIds("materials","$id",materialIds),
        fetchRowsByIds("distributions","$id",distributionIds),
        fetchRowsByIds("study_sessions","assignmentId",assignmentIds,[Query.equal("studentId",req.authUser.$id)]),
        fetchRowsByIds("submissions","assignmentId",assignmentIds,[Query.equal("studentId",req.authUser.$id)],[Query.orderDesc("$createdAt")])
      ]);
      const materialById=new Map(materials.map(row=>[row.$id,row]));
      const distributionById=new Map(distributions.map(row=>[row.$id,row]));
      const submissionByAssignment=new Map();
      for(const row of submissions)if(!submissionByAssignment.has(row.assignmentId))submissionByAssignment.set(row.assignmentId,row);
      const secondsByAssignment=new Map();
      for(const session of sessions)secondsByAssignment.set(session.assignmentId,(secondsByAssignment.get(session.assignmentId)||0)+Math.max(0,Number(session.durationSeconds)||0));
      const submissionIds=[...new Set(submissions.map(row=>row.$id))];
      const grades=await fetchRowsByIds("grading_records","submissionId",submissionIds,[],[Query.orderDesc("$createdAt")]);
      const gradeBySubmission=new Map();
      for(const grade of grades)if(!gradeBySubmission.has(grade.submissionId))gradeBySubmission.set(grade.submissionId,grade);
      const assignments=rows.map(item=>{
        const submission=submissionByAssignment.get(item.$id)||null;
        return {...item,material:materialById.get(item.materialId)||null,distribution:distributionById.get(item.distributionId)||null,studySeconds:secondsByAssignment.get(item.$id)||0,latestGrade:submission?gradeBySubmission.get(submission.$id)||null:null};
      });
      return res.json({success:true,assignments});
    }
    const classes=await listRows("classes",[],500);
    const grouped=await Promise.all(classes.rows.map(row=>listRows("assignments",[Query.equal("classId",row.$id)],1000)));
    res.json({success:true,assignments:grouped.flatMap(item=>item.rows)});
  }catch(error){
    console.error("Assignment list failed:",error);
    res.status(500).json({error:"課題一覧を取得できませんでした。"});
  }
});

/* Student workspace and autosave */
app.get("/api/workspace/:assignmentId", authenticate, async (req, res) => {
  try {
    let assignment = await getRow("assignments", req.params.assignmentId);
    if(req.profile.role==="teacher"&&!(await teacherOwnsAssignment(req,assignment)))return res.status(404).json({error:"課題が見つかりません。"});
    if (!(await canReadAssignment(req, assignment))) {
      return res.status(403).json({ error: "この課題を開く権限がありません。" });
    }
    if (assignment.status === "locked") {
      await refreshScheduledAssignments(assignment.studentId);
      assignment = await getRow("assignments", assignment.$id);
      if (assignment.status === "locked") return res.status(403).json({ error: "この教材はまだ開放されていません。" });
    }
    if (req.profile.role === "student" && ["passed", "submitted"].includes(assignment.status)) {
      // Submitted work remains viewable; editing is blocked in the client.
    }

    const material = await getRow("materials", assignment.materialId);
    const submission = await ensureSubmission(assignment);
    const pages = await listRows("submission_pages", [
      Query.equal("submissionId", submission.$id)
    ], 200);

    if (req.profile.role === "student" && assignment.status === "available") {
      assignment = await updateRow("assignments", assignment.$id, { status: "in_progress" });
    }

    res.json({
      success: true,
      assignment,
      material: {
        id: material.$id,
        title: material.title,
        pageUrl: "/api/materials/" + material.$id + "/file"
      },
      submission,
      pages: pages.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "演習画面を開けませんでした。" });
  }
});

/* Study time tracking */
app.post("/api/study-sessions/start", authenticate, requireRole("student"), async (req, res) => {
  try {
    const assignment = await getRow("assignments", String(req.body.assignmentId || ""));
    const submission = await getRow("submissions", String(req.body.submissionId || ""));
    if (assignment.studentId !== req.authUser.$id || submission.studentId !== req.authUser.$id ||
        submission.assignmentId !== assignment.$id) {
      return res.status(403).json({ error: "この学習記録を開始する権限がありません。" });
    }
    if (["submitted", "passed"].includes(assignment.status)) {
      return res.status(409).json({ error: "提出済みの教材では学習時間を記録できません。" });
    }
    const now = new Date().toISOString();
    const session = await createRow("study_sessions", {
      assignmentId: assignment.$id,
      submissionId: submission.$id,
      studentId: req.authUser.$id,
      startedAt: now,
      lastHeartbeatAt: now,
      durationSeconds: 0,
      activePageNo: 1,
      isDrawing: false,
      endedAt: null
    });
    res.status(201).json({ success: true, session });
  } catch (error) {
    console.error("Study session start failed:", error);
    res.status(500).json({ error: "学習時間の記録を開始できませんでした。" });
  }
});

async function updateStudySession(req, res, endSession) {
  try {
    const session = await getRow("study_sessions", req.params.id);
    if (session.studentId !== req.authUser.$id || req.profile.role !== "student") {
      return res.status(403).json({ error: "この学習記録を更新する権限がありません。" });
    }
    if (session.endedAt) return res.json({ success: true, session });
    const now = Date.now();
    const last = new Date(session.lastHeartbeatAt).getTime();
    const elapsed = Math.max(0, Math.min(90, Math.floor((now - last) / 1000)));
    const data = {
      durationSeconds: Math.max(0, Number(session.durationSeconds) || 0) + elapsed,
      lastHeartbeatAt: new Date(now).toISOString(),
      activePageNo: Math.max(1, Number(req.body.pageNo) || Number(session.activePageNo) || 1),
      isDrawing: endSession ? false : Boolean(req.body.isDrawing)
    };
    if (endSession) data.endedAt = new Date(now).toISOString();
    const updated = await updateRow("study_sessions", session.$id, data);
    await notifyAssignmentLive(session.assignmentId);
    res.json({ success: true, session: updated });
  } catch (error) {
    console.error("Study session update failed:", error);
    res.status(500).json({ error: "学習時間を保存できませんでした。" });
  }
}

app.post("/api/study-sessions/:id/heartbeat", authenticate, (req, res) =>
  updateStudySession(req, res, false)
);
app.post("/api/study-sessions/:id/stop", authenticate, (req, res) =>
  updateStudySession(req, res, true)
);

app.put("/api/submissions/:id/pages/:pageNo", authenticate, async (req, res) => {
  try {
    const submission = await getRow("submissions", req.params.id);
    if(req.profile.role==="student"&&submission.studentId!==req.authUser.$id)return res.status(403).json({error:"他の生徒の答案は編集できません。"});
    const assignment=await getRow("assignments",submission.assignmentId);
    if(req.profile.role==="teacher"&&!(await teacherOwnsAssignment(req,assignment)))return res.status(404).json({error:"答案が見つかりません。"});
    if(req.profile.role==="student"&&["submitted","passed"].includes(assignment.status))return res.status(409).json({error:"提出済みの答案は編集できません。"});
    if(!["teacher","student"].includes(req.profile.role))return res.status(403).json({error:"答案の編集権限がありません。"});
    const pageNo=Math.max(1,Math.min(500,Number(req.params.pageNo)||1));
    if(!Array.isArray(req.body.strokes))return res.status(400).json({error:"答案データの形式が正しくありません。"});
    const dataKey=req.profile.role==="teacher"?"teacherData":"studentData";
    const json=JSON.stringify(req.body.strokes);
    if (json.length > 1500000) return res.status(413).json({ error: "このページの書き込み量が上限を超えています。" });

    const current = await listRows("submission_pages", [
      Query.equal("submissionId", submission.$id),
      Query.equal("pageNo", pageNo)
    ], 1);
    let row;
    if (current.rows[0]) {
      row = await updateRow("submission_pages", current.rows[0].$id, { [dataKey]: json });
    } else {
      row = await createRow("submission_pages", {
        submissionId: submission.$id,
        pageNo,
        studentData: dataKey === "studentData" ? json : "[]",
        teacherData: dataKey === "teacherData" ? json : "[]"
      });
    }
    if(req.profile.role==="student"){
      if(assignment.studentId!==req.authUser.$id)return res.status(403).json({error:"答案の更新権限がありません。"});
    }
    await notifyAssignmentLive(assignment.$id);
    res.json({ success: true, page: row });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "答案を保存できませんでした。" });
  }
});

app.post("/api/submissions/:id/submit", authenticate, async (req, res) => {
  try {
    const submission = await getRow("submissions", req.params.id);
    if (submission.studentId !== req.authUser.$id || req.profile.role !== "student") {
      return res.status(403).json({ error: "提出権限がありません。" });
    }
    const assignment=await getRow("assignments",submission.assignmentId);
    if(assignment.studentId!==req.authUser.$id)return res.status(403).json({error:"提出権限がありません。"});
    if(["submitted","passed"].includes(assignment.status))return res.status(409).json({error:"この教材はすでに提出済みです。"});
    const updated=await updateRow("submissions",submission.$id,{
      status:"submitted",submittedAt:new Date().toISOString()
    });
    await updateRow("assignments", assignment.$id, { status: "submitted" });
    await notifyAssignmentLive(assignment.$id);
    res.json({ success: true, submission: updated });
  } catch (error) {
    res.status(500).json({ error: "提出できませんでした。" });
  }
});

/* Teacher progress and grading */
const liveStreams = new Map();
function emitLiveEvent(key, eventName = "refresh") {
  const clients = liveStreams.get(key);
  if (!clients) return;
  for (const response of clients) {
    try { response.write("event: " + eventName + "\ndata: {}\n\n"); } catch {}
  }
}
function addLiveClient(key, response) {
  if (!liveStreams.has(key)) liveStreams.set(key, new Set());
  liveStreams.get(key).add(response);
  response.on("close", () => {
    const clients = liveStreams.get(key);
    if (!clients) return;
    clients.delete(response);
    if (!clients.size) liveStreams.delete(key);
  });
}
async function authenticateStream(req, res) {
  try {
    const jwt = String(req.query.token || "");
    if (!jwt) { res.status(401).end(); return null; }
    const userClient = new sdk.Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
    const authUser = await new sdk.Account(userClient).get();
    const profile = await getProfile(authUser);
    if (!profile || profile.status !== "active" || profile.role !== "teacher") {
      res.status(403).end(); return null;
    }
    return { authUser, profile };
  } catch {
    res.status(401).end(); return null;
  }
}
function beginEventStream(req, res, key) {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders?.();
  res.write("event: connected\ndata: {}\n\n");
  addLiveClient(key, res);
}
app.get("/api/teacher/live-stream/:assignmentId",async(req,res)=>{
  const auth=await authenticateStream(req,res);
  if(!auth)return;
  try{
    const assignment=await getRow("assignments",req.params.assignmentId);
    const cls=await getRow("classes",assignment.classId);
    if(cls.schoolId!==auth.profile.schoolId)return res.status(404).end();
    beginEventStream(req,res,"assignment:"+req.params.assignmentId);
  }catch{res.status(404).end();}
});
app.get("/api/teacher/class-stream/:classId",async(req,res)=>{
  const auth=await authenticateStream(req,res);
  if(!auth)return;
  try{
    const cls=await getRow("classes",req.params.classId);
    if(cls.schoolId!==auth.profile.schoolId)return res.status(404).end();
    beginEventStream(req,res,"class:"+req.params.classId);
  }catch{res.status(404).end();}
});
async function notifyAssignmentLive(assignmentId) {
  emitLiveEvent("assignment:" + assignmentId);
  try {
    const assignment = await getRow("assignments", assignmentId);
    emitLiveEvent("class:" + assignment.classId);
  } catch {}
}

app.get("/api/teacher/live/:assignmentId", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const assignment=await getRow("assignments",req.params.assignmentId);
    if(!(await teacherOwnsAssignment(req,assignment)))return res.status(404).json({error:"課題が見つかりません。"});
    const submission = await findLatestSubmission(assignment.$id, assignment.studentId);
    if (!submission) return res.status(404).json({ error: "答案データがまだありません。" });
    const [material, pages, student, sessions] = await Promise.all([
      getRow("materials", assignment.materialId),
      listRows("submission_pages", [Query.equal("submissionId", submission.$id)], 200),
      listRows("users", [Query.equal("authUserId", assignment.studentId)], 1),
      listRows("study_sessions", [
        Query.equal("assignmentId", assignment.$id),
        Query.equal("studentId", assignment.studentId)
      ], 100)
    ]);
    const latestSession = sessions.rows.sort((a, b) =>
      new Date(b.lastHeartbeatAt).getTime() - new Date(a.lastHeartbeatAt).getTime())[0] || null;
    const heartbeatAge = latestSession ? Date.now() - new Date(latestSession.lastHeartbeatAt).getTime() : Infinity;
    const active = Boolean(latestSession && !latestSession.endedAt && heartbeatAge <= 20000);
    res.json({
      success: true,
      active,
      isDrawing: active && Boolean(latestSession.isDrawing),
      activePageNo: active ? Math.max(1, Number(latestSession.activePageNo) || 1) : null,
      lastSeenAt: latestSession?.lastHeartbeatAt || null,
      assignment,
      submission,
      material: { id: material.$id, title: material.title, pageUrl: "/api/materials/" + material.$id + "/file" },
      student: student.rows[0] || null,
      pages: pages.rows
    });
  } catch (error) {
    console.error("Live workspace fetch failed:", error);
    res.status(500).json({ error: "リアルタイム答案を取得できませんでした。" });
  }
});

app.get("/api/classes/:id/progress", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    if(!(await teacherOwnsClass(req,req.params.id)))return res.status(404).json({error:"クラスが見つかりません。"});
    const [enrollmentResult, assignmentResult] = await Promise.all([
      listRows("enrollments", [
        Query.equal("classId", req.params.id),
        Query.equal("status", "active")
      ], 100),
      listRows("assignments", [
        Query.equal("classId", req.params.id)
      ], 1000)
    ]);

    const enrollments = enrollmentResult.rows;
    const assignments = assignmentResult.rows;
    const assignmentIds = [...new Set(assignments.map(row => row.$id))];
    const materialIds = [...new Set(assignments.map(row => row.materialId).filter(Boolean))];

    // Avoid one database request per student/material/session. Fetch related data in batches.
    const fetchByIds = async (tableId, field, ids, order = []) => {
      if (!ids.length) return [];
      const chunks = [];
      for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
      const results = await Promise.all(chunks.map(chunk =>
        listRows(tableId, [Query.equal(field, chunk), ...order], 1000)
      ));
      return results.flatMap(result => result.rows || []);
    };

    const [submissions, sessions, materials] = await Promise.all([
      fetchByIds("submissions", "assignmentId", assignmentIds, [Query.orderDesc("$createdAt")]),
      fetchByIds("study_sessions", "assignmentId", assignmentIds),
      fetchByIds("materials", "$id", materialIds)
    ]);

    const latestSubmissionByAssignment = new Map();
    for (const submission of submissions) {
      const key = submission.assignmentId + ":" + submission.studentId;
      if (!latestSubmissionByAssignment.has(key)) latestSubmissionByAssignment.set(key, submission);
    }
    const studySecondsByAssignment = new Map();
    for (const session of sessions) {
      const key = session.assignmentId + ":" + session.studentId;
      studySecondsByAssignment.set(key,
        (studySecondsByAssignment.get(key) || 0) + Math.max(0, Number(session.durationSeconds) || 0));
    }
    const materialById = new Map(materials.map(material => [material.$id, material]));
    const assignmentsByStudent = new Map();
    for (const assignment of assignments) {
      if (!assignmentsByStudent.has(assignment.studentId)) assignmentsByStudent.set(assignment.studentId, []);
      assignmentsByStudent.get(assignment.studentId).push(assignment);
    }

    const students = enrollments.map(enrollment => ({
      studentId: enrollment.studentId,
      studentName: enrollment.studentName,
      assignments: (assignmentsByStudent.get(enrollment.studentId) || []).map(assignment => {
        const key = assignment.$id + ":" + assignment.studentId;
        return {
          ...assignment,
          materialTitle: materialById.get(assignment.materialId)?.title || "教材",
          submission: latestSubmissionByAssignment.get(key) || null,
          studySeconds: studySecondsByAssignment.get(key) || 0
        };
      })
    }));

    res.json({ success: true, students });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "進捗を取得できませんでした。" });
  }
});

app.get("/api/grading/:submissionId", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const submission = await getRow("submissions", req.params.submissionId);
    const assignment=await getRow("assignments",submission.assignmentId);
    if(!(await teacherOwnsAssignment(req,assignment)))return res.status(404).json({error:"採点対象が見つかりません。"});
    const material = await getRow("materials", assignment.materialId);
    const pages = await listRows("submission_pages", [
      Query.equal("submissionId", submission.$id)
    ], 200);
    const student = await listRows("users", [
      Query.equal("authUserId", submission.studentId)
    ], 1);
    res.json({
      success: true,
      submission,
      assignment,
      material: { id: material.$id, title: material.title, pageUrl: "/api/materials/" + material.$id + "/file" },
      student: student.rows[0] || null,
      pages: pages.rows
    });
  } catch (error) {
    res.status(404).json({ error: "採点対象が見つかりません。" });
  }
});

app.post("/api/grading/:submissionId", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const submission = await getRow("submissions", req.params.submissionId);
    const assignment=await getRow("assignments",submission.assignmentId);
    if(!(await teacherOwnsAssignment(req,assignment)))return res.status(404).json({error:"採点対象が見つかりません。"});
    const result = req.body.result === "passed" ? "passed" : "returned";
    const score = req.body.score === "" || req.body.score == null ? null : Number(req.body.score);
    const maxScore = req.body.maxScore === "" || req.body.maxScore == null ? null : Number(req.body.maxScore);
    const feedback=String(req.body.feedback||"").trim();
    if((score!==null&&(!Number.isFinite(score)||score<0))||(maxScore!==null&&(!Number.isFinite(maxScore)||maxScore<=0))||(score!==null&&maxScore!==null&&score>maxScore)||feedback.length>10000)return res.status(400).json({error:"点数または講評の入力内容を確認してください。"});

    await createRow("grading_records", {
      submissionId: submission.$id,
      teacherId: req.authUser.$id,
      result,
      score,
      maxScore,
      feedback
    });
    const updated = await updateRow("submissions", submission.$id, { status: result });
    await updateRow("assignments", assignment.$id, {
      status: result,
      passedAt: result === "passed" ? new Date().toISOString() : null
    });
    if (result === "passed") await unlockNextAssignment(assignment);
    await notifyAssignmentLive(assignment.$id);

    res.json({ success: true, submission: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "採点結果を保存できませんでした。" });
  }
});

/* Comments */
app.get("/api/submissions/:id/comments", authenticate, async (req, res) => {
  const submission = await getRow("submissions", req.params.id);
  if (req.profile.role === "student" && submission.studentId !== req.authUser.$id) {
    return res.status(403).json({ error: "閲覧権限がありません。" });
  }
  if(req.profile.role==="teacher"&&!(await teacherOwnsSubmission(req,submission)))return res.status(404).json({error:"答案が見つかりません。"});
  const result=await listRows("comments",[Query.equal("submissionId",submission.$id)],100);
  res.json({success:true,comments:result.rows});
});

app.post("/api/submissions/:id/comments", authenticate, async (req, res) => {
  const submission = await getRow("submissions", req.params.id);
  if(req.profile.role==="student"&&submission.studentId!==req.authUser.$id)return res.status(403).json({error:"投稿権限がありません。"});
  if(req.profile.role==="teacher"&&!(await teacherOwnsSubmission(req,submission)))return res.status(404).json({error:"答案が見つかりません。"});
  if(!["student","teacher"].includes(req.profile.role)){
    return res.status(403).json({ error: "投稿権限がありません。" });
  }
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "コメントを入力してください。" });
  const row = await createRow("comments", {
    submissionId: submission.$id,
    pageNo: Number(req.body.pageNo) || 1,
    authorId: req.authUser.$id,
    authorRole: req.profile.role,
    body
  });
  res.status(201).json({ success: true, comment: row });
});

/* Static files and explicit entry routes */
const PUBLIC_DIR = path.join(__dirname, "public");
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "login.html"), error => {
    if (error && !res.headersSent) res.status(404).type("text").send("Login page file is missing from the deployed public directory.");
  });
});
app.get("/", (req, res) => res.redirect(302, "/login.html"));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"], index: false }));

app.use("/api", (req, res) => res.status(404).json({ error: "API endpoint not found." }));

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "サーバー内部でエラーが発生しました。" });
});

async function start() {
  try {
    await ensureSchema();
    await ensureDefaultSchool();
    app.listen(PORT, "0.0.0.0", () => {
      console.log("Digital Learning System running on port " + PORT);
      console.log("Appwrite database schema is ready.");
    });
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
}

start();

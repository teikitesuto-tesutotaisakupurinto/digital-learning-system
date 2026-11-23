"use strict";

const express = require("express");
const path = require("path");
const crypto = require("crypto");
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 2 }
});

const schemas = {
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
      ["createdBy", "varchar", 36, true]
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
      ["createdBy", "varchar", 36, true]
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
  system_settings: {
    name: "System Settings",
    columns: [
      ["settingKey", "varchar", 128, true],
      ["settingValue", "mediumtext", null, false]
    ]
  }
};

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
  return tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId,
    queries: [...queries, Query.limit(limit)]
  });
}

function getRow(tableId, rowId) {
  return tablesDB.getRow({ databaseId: DATABASE_ID, tableId, rowId });
}

function createRow(tableId, data) {
  return tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId,
    rowId: ID.unique(),
    data,
    permissions: []
  });
}

function updateRow(tableId, rowId, data) {
  return tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId,
    rowId,
    data
  });
}

// The first authenticated account is registered as the initial teacher.
// This runs only while the application users table is completely empty.
// One-time first-account bootstrap: the first registered application user becomes a teacher.
let bootstrapTeacherPromise = null;

async function getProfile(authUser) {
  const found = await listRows("users", [Query.equal("authUserId", authUser.$id)], 1);
  if (found.rows.length) {
    const profile = found.rows[0];
    if (profile.role === "admin") return updateRow("users", profile.$id, { role: "teacher" });
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
        status: "active"
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
    const profile = await getProfile(authUser);

    if (!profile) {
      return res.status(403).json({
        error: "このアカウントには利用権限がありません。管理者に登録を依頼してください。"
      });
    }
    if (profile.status !== "active") {
      return res.status(403).json({ error: "このアカウントは停止されています。" });
    }

    req.authUser = authUser;
    req.profile = profile;
    next();
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
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "digital-learning-system",
    database: DATABASE_ID,
    storage: BUCKET_ID
  });
});

app.get("/api/me", authenticate, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.authUser.$id,
      email: req.authUser.email,
      name: req.profile.displayName,
      role: req.profile.role
    }
  });
});

/* Users */
app.get("/api/users", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const role = req.query.role;
    const queries = [];
    if (role && ["teacher", "teacher", "student"].includes(role)) queries.push(Query.equal("role", role));
    const result = await listRows("users", queries, 100);
    res.json({ success: true, users: result.rows });
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
    const result = await listRows("classes", [Query.equal("status", "active")], 100);
    res.json({ success: true, classes: result.rows });
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
  const rows = await listRows("folders", [], 100);
  res.json({ success: true, folders: rows.rows });
});

app.post("/api/folders", authenticate, requireRole("teacher"), async (req, res) => {
  const name = String(req.body.name || "").trim();
  const parentId = String(req.body.parentId || "").trim() || null;
  if (!name) return res.status(400).json({ error: "フォルダー名を入力してください。" });
  try {
    const parent = parentId ? await getRow("folders", parentId) : null;
    const folder = await createRow("folders", {
      name,
      parentId,
      path: parent ? [parent.path || parent.name, name].filter(Boolean).join("/") : name,
      createdBy: req.authUser.$id
    });
    res.status(201).json({ success: true, folder });
  } catch (error) {
    res.status(500).json({ error: "フォルダーを作成できませんでした。" });
  }
});

/* PDF material library */
app.get("/api/materials", authenticate, requireRole("teacher"), async (req, res) => {
  const result = await listRows("materials", [], 100);
  res.json({ success: true, materials: result.rows });
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

    if (!file || !title) return res.status(400).json({ error: "教材名とPDFファイルを指定してください。" });
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
      createdBy: req.authUser.$id
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

    if (req.query.answer === "1") {
      if (req.profile.role !== "teacher") {
        return res.status(403).json({ error: "解答ファイルを閲覧する権限がありません。" });
      }
      fileId = material.answerFileId;
    } else if (req.profile.role === "student") {
      const assigned = await listRows("assignments", [
        Query.equal("studentId", req.authUser.$id),
        Query.equal("materialId", material.$id)
      ], 100);
      if (!assigned.rows.length) return res.status(403).json({ error: "この教材は配信されていません。" });
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
  const result = await listRows("distributions", [], 100);
  res.json({ success: true, distributions: result.rows });
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

    const allFolders = (await listRows("folders", [], 500)).rows;
    const allMaterials = (await listRows("materials", [], 500)).rows;
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
    let assignedStudents = 0;

    for (const target of targets) {
      const classId = String(target.classId || "");
      const classRow = await getRow("classes", classId);
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
      for (const enrollment of selectedEnrollments) {
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
      assignedStudents += selectedEnrollments.length;
      results.push({ distributionId: distribution.$id, classId, className: classRow.name, students: selectedEnrollments.length });
    }

    res.status(201).json({ success: true, distributions: results, assignedStudents, materialCount: materials.length });
  } catch (error) {
    console.error("Distribution failed:", error);
    res.status(500).json({ error: "教材を配信できませんでした。" });
  }
});

app.get("/api/assignments", authenticate, async (req, res) => {
  try {
    if (req.profile.role === "student") {
      await refreshScheduledAssignments(req.authUser.$id);
      const result = await listRows("assignments", [
        Query.equal("studentId", req.authUser.$id)
      ], 100);
      const assignments = await Promise.all(result.rows.map(async item => {
        const material = await getRow("materials", item.materialId).catch(() => null);
        const distribution = await getRow("distributions", item.distributionId).catch(() => null);
        return { ...item, material, distribution };
      }));
      return res.json({ success: true, assignments });
    }
    const result = await listRows("assignments", [], 100);
    res.json({ success: true, assignments: result.rows });
  } catch (error) {
    res.status(500).json({ error: "課題一覧を取得できませんでした。" });
  }
});

/* Student workspace and autosave */
app.get("/api/workspace/:assignmentId", authenticate, async (req, res) => {
  try {
    let assignment = await getRow("assignments", req.params.assignmentId);
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

app.put("/api/submissions/:id/pages/:pageNo", authenticate, async (req, res) => {
  try {
    const submission = await getRow("submissions", req.params.id);
    if (req.profile.role === "student" && submission.studentId !== req.authUser.$id) {
      return res.status(403).json({ error: "他の生徒の答案は編集できません。" });
    }
    const pageNo = Math.max(1, Number(req.params.pageNo) || 1);
    const dataKey = req.profile.role === "teacher" ? "teacherData" : "studentData";
    const json = JSON.stringify(req.body.strokes || []);
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
    const updated = await updateRow("submissions", submission.$id, {
      status: "submitted",
      submittedAt: new Date().toISOString()
    });
    const assignment = await getRow("assignments", submission.assignmentId);
    await updateRow("assignments", assignment.$id, { status: "submitted" });
    res.json({ success: true, submission: updated });
  } catch (error) {
    res.status(500).json({ error: "提出できませんでした。" });
  }
});

/* Teacher progress and grading */
app.get("/api/classes/:id/progress", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const enrollments = await listRows("enrollments", [
      Query.equal("classId", req.params.id),
      Query.equal("status", "active")
    ], 100);
    const assignments = await listRows("assignments", [
      Query.equal("classId", req.params.id)
    ], 1000);

    const students = await Promise.all(enrollments.rows.map(async enrollment => {
      const studentAssignments = assignments.rows.filter(a => a.studentId === enrollment.studentId);
      const results = await Promise.all(studentAssignments.map(async assignment => {
        const submission = await findLatestSubmission(assignment.$id, assignment.studentId);
        return { ...assignment, submission };
      }));
      return {
        studentId: enrollment.studentId,
        studentName: enrollment.studentName,
        assignments: results
      };
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
    const assignment = await getRow("assignments", submission.assignmentId);
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
    const assignment = await getRow("assignments", submission.assignmentId);
    const result = req.body.result === "passed" ? "passed" : "returned";
    const score = req.body.score === "" || req.body.score == null ? null : Number(req.body.score);
    const maxScore = req.body.maxScore === "" || req.body.maxScore == null ? null : Number(req.body.maxScore);
    const feedback = String(req.body.feedback || "").trim();

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
  const result = await listRows("comments", [
    Query.equal("submissionId", submission.$id)
  ], 100);
  res.json({ success: true, comments: result.rows });
});

app.post("/api/submissions/:id/comments", authenticate, async (req, res) => {
  const submission = await getRow("submissions", req.params.id);
  if (req.profile.role === "student" && submission.studentId !== req.authUser.$id) {
    return res.status(403).json({ error: "投稿権限がありません。" });
  }
  if (!["student", "teacher", "teacher"].includes(req.profile.role)) {
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

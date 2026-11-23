
"use strict";

const express = require("express");
const path = require("path");
const { Client, Account, TablesDB, Storage } = require("node-appwrite");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Appwrite server connection
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const tablesDB = new TablesDB(client);
const storage = new Storage(client);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "digital-learning-system",
    appwriteConfigured: Boolean(
      process.env.APPWRITE_ENDPOINT &&
      process.env.APPWRITE_PROJECT_ID &&
      process.env.APPWRITE_API_KEY
    )
  });
});

// Appwrite connection check
app.get("/api/appwrite/check", async (req, res) => {
  try {
    const result = await tablesDB.list();
    res.json({
      connected: true,
      databases: result.total
    });
  } catch (error) {
    console.error("Appwrite check failed:", error.message);
    res.status(500).json({
      connected: false,
      message: "Appwrite connection failed"
    });
  }
});

// API not found
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found"
  });
});

// Page routing
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Error handler
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: "Internal server error"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Digital Learning System running on port ${PORT}`);
});

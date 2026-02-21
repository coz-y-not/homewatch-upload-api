const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Use memory storage (we upload directly to R2, no local disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ✅ Env vars from Render
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL; // https://pub-....r2.dev

if (!R2_ENDPOINT || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_BASE_URL) {
  console.warn("⚠️ Missing one or more R2 env vars. Check Render Environment.");
}

// ✅ R2 client (S3-compatible)
const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Upload route
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Create unique filename
    const ext = path.extname(req.file.originalname || "").toLowerCase() || ".jpg";
    const key = `uploads/${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;

    // Upload to R2
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || "application/octet-stream",
      })
    );

    // Public URL (via your R2 public dev URL)
    const publicUrl = `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;

    return res.json({ url: publicUrl });
  } catch (err) {
    console.error("❌ Upload failed:", err);
    return res.status(500).json({ error: "Upload failed", details: String(err?.message || err) });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("Upload API is running (R2)");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on port", PORT));
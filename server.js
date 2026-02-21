const express = require("express");
const multer = require("multer");
const cors = require("cors");
const crypto = require("crypto");

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Multer memory storage (no local /uploads folder needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// ✅ Cloudflare R2 client (S3-compatible)
const R2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // https://<accountid>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Upload route (uploads to R2)
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) return res.status(500).json({ error: "Missing R2_BUCKET_NAME" });

    // Create a safe unique object key
    const orig = req.file.originalname || "file";
    const ext = (orig.includes(".") ? orig.split(".").pop() : "jpg").toLowerCase();
    const key = `uploads/${Date.now()}_${crypto.randomBytes(8).toString("hex")}.${ext}`;

    // Upload to R2
    await R2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || "application/octet-stream",
      })
    );

    /**
     * ✅ Public URL
     * You must set R2_PUBLIC_BASE_URL in Render.
     * Example:
     *   https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
     * then final URL becomes:
     *   https://pub-...r2.dev/uploads/123_abc.jpg
     */
    const base = process.env.R2_PUBLIC_BASE_URL;
    if (!base) {
      // still return the key so you can debug
      return res.status(200).json({
        url: key,
        warning: "R2_PUBLIC_BASE_URL is not set yet. Enable public access and set it.",
      });
    }

    const url = `${base.replace(/\/$/, "")}/${key}`;
    res.json({ url });
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("Upload API is running (R2 enabled)");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
// index.js (combined)
import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import Transcription from "./models/Transcription.js";
import authRoutes from "./routes/auth.js";
import { authenticateToken } from "./middleware/auth.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());

// MongoDB connect
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true, 
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => {
  console.error("❌ MongoDB error:", err.message);
  process.exit(1);
});

// Multer setup (with validation)
const SUPPORTED_EXTENSIONS = [".wav", ".mp3", ".mp4", ".aac", ".ogg", ".webm", ".flac", ".m4a"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MIN_FILE_SIZE = 1000;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `audio-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    const isValid = SUPPORTED_EXTENSIONS.some(ext => file.originalname.toLowerCase().endsWith(ext));
    if (!isValid) {
      const error = new Error(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
      error.code = "UNSUPPORTED_FILE_TYPE";
      return cb(error);
    }
    cb(null, true);
  }
});

// Helpers
const cleanupFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted local file: ${filePath}`);
    }
  } catch (err) {
    console.error("⚠️ Cleanup failed:", err.message);
  }
};

// AssemblyAI transcription
const transcribeWithAssemblyAI = async (filePath, originalName) => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("AssemblyAI API key missing");

  console.log(`📤 Uploading ${originalName} to AssemblyAI...`);

  // Upload
  const uploadRes = await axios.post(
    "https://api.assemblyai.com/v2/upload",
    fs.createReadStream(filePath),
    {
      headers: { authorization: apiKey, "transfer-encoding": "chunked" },
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE
    }
  );
  const uploadUrl = uploadRes.data?.upload_url;
  if (!uploadUrl) throw new Error("AssemblyAI upload failed");

  // Start transcription
  const transcriptRes = await axios.post(
    "https://api.assemblyai.com/v2/transcript",
    { audio_url: uploadUrl, punctuate: true, format_text: true, language_detection: true },
    { headers: { authorization: apiKey } }
  );
  const transcriptId = transcriptRes.data?.id;
  if (!transcriptId) throw new Error("Failed to start transcription");

  // Polling
  let transcription = "Processing...";
  for (let i = 0; i < 60; i++) {
    const checkRes = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      { headers: { authorization: apiKey } }
    );

    if (checkRes.data.status === "completed") {
      transcription = checkRes.data.text || "No speech detected";
      break;
    } else if (checkRes.data.status === "error") {
      throw new Error(`Transcription failed: ${checkRes.data.error}`);
    }
    await new Promise(r => setTimeout(r, 3000)); // wait 3s
  }
  return transcription;
};

// Routes
app.use("/auth", authRoutes);

// Upload (protected)
app.post("/upload", authenticateToken, upload.single("audio"), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });
    if (req.file.size < MIN_FILE_SIZE) return res.status(400).json({ success: false, error: "File too small" });

    console.log(`📥 Upload from ${req.user.email}: ${req.file.originalname}`);

    // Transcribe
    const transcription = await transcribeWithAssemblyAI(filePath, req.file.originalname);

    // Save DB
    const newTranscription = new Transcription({
      userId: req.user._id,
      filename: req.file.originalname,
      filepath: filePath,
      transcription,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });
    await newTranscription.save();

    cleanupFile(filePath);

    res.json({ success: true, file: newTranscription });
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    if (filePath) cleanupFile(filePath);
    res.status(500).json({ success: false, error: err.message });
  }
});

// History (protected)
app.get("/history", authenticateToken, async (req, res) => {
  try {
    const transcriptions = await Transcription.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: transcriptions });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error fetching history" });
  }
});

// Delete (protected)
app.delete("/history/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const transcription = await Transcription.findOne({ _id: id, userId: req.user._id });
    if (!transcription) return res.status(404).json({ success: false, error: "Not found" });

    if (transcription.filepath) cleanupFile(transcription.filepath);
    await Transcription.findByIdAndDelete(id);

    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error deleting transcription" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ success: true, status: "healthy", timestamp: new Date() });
});

// 404
app.use((req, res) => res.status(404).json({ success: false, error: "Not found" }));

// Start
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

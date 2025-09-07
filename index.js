import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import Transcription from "./models/Transcription.js";
import path from "path";


dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Multer setup (for file uploads)
const upload = multer({ dest: "uploads/" });

// Connect to MongoDB
connectDB();

// Upload endpoint
app.post("/upload", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const filePath = req.file.path;

    // Step 1: Upload file to AssemblyAI
    const uploadRes = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      fs.createReadStream(filePath),
      {
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
          "transfer-encoding": "chunked",
        },
      }
    );

    // Step 2: Request transcription
    const transcriptRes = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: uploadRes.data.upload_url },
      {
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
          "content-type": "application/json",
        },
      }
    );

    // Step 3: Polling until transcription is done
    let transcription = "Processing...";
    let completed = false;
    let retries = 0;
    const maxRetries = 20; // ~60 seconds (20 * 3s)

    while (!completed && retries < maxRetries) {
      const checkRes = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptRes.data.id}`,
        {
          headers: { authorization: process.env.ASSEMBLYAI_API_KEY },
        }
      );

      if (checkRes.data.status === "completed") {
        transcription = checkRes.data.text;
        completed = true;
      } else if (checkRes.data.status === "error") {
        transcription = "Transcription failed.";
        completed = true;
      } else {
        retries++;
        await new Promise((resolve) => setTimeout(resolve, 3000)); // wait 3s
      }
    }

    // Step 4: Save to DB
    const newTranscription = new Transcription({
      filename: req.file.originalname,
      filepath: req.file.path,
      transcription,
    });

    await newTranscription.save();


    
    // Step 5: Delete local file
    fs.unlink(filePath, (err) => {
      if (err) console.error("⚠️ Failed to delete file:", err);
    });

    res.json({ success: true, file: newTranscription });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ✅ Delete transcription by ID + remove file
app.delete("/history/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("DELETE request for ID:", id);

    const deleted = await Transcription.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Transcription not found" });
    }

    // Delete audio file if exists
    if (deleted.filepath) {
      const fullPath = path.join(process.cwd(), deleted.filepath);
      fs.unlink(fullPath, (err) => {
        if (err) {
          console.error("⚠️ Error deleting file:", err);
        } else {
          console.log("🗑️ File deleted:", fullPath);
        }
      });
    }

    res.json({ success: true, message: "Transcription deleted" });
  } catch (err) {
    console.error("Error deleting transcription:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});
// Fetch all transcriptions (latest first)
app.get("/history", async (req, res) => {
  try {
    const transcriptions = await Transcription.find().sort({ createdAt: -1 });
    res.json({ success: true, data: transcriptions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error fetching history" });
  }
});


app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);

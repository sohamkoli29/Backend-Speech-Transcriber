import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
import Transcription  from "./models/Transcription.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Multer setup (for file uploads)
const upload = multer({ dest: "uploads/" });

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// Upload endpoint
app.post("/upload", upload.single("audio"), async (req, res) => {
  try {
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

    while (!completed) {
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
          res.json({ success: true, file: newTranscription });

  } catch (err) {
    console.error(err);
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


app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

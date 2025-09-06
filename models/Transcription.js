import mongoose from "mongoose";

const transcriptionSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  filepath: { type: String, required: true },
  transcription: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Transcription", transcriptionSchema);

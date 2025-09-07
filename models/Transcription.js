// models/Transcription.js
import mongoose from "mongoose";

const transcriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  filename: {
    type: String,
    required: true,
    trim: true
  },
  filepath: {
    type: String,
    required: true
  },
  transcription: {
    type: String,
    default: "" // fallback if empty or failed
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0
  },
  mimeType: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'completed'
  },
  errorMessage: {
    type: String,
    default: null
  },
  processingTime: {
    type: Number, // in milliseconds
    default: null
  }
}, {
  timestamps: true, // createdAt + updatedAt
  toJSON: {
    transform: function (doc, ret) {
      // hide sensitive / internal fields
      delete ret.filepath;
      delete ret.__v;
      return ret;
    }
  }
});

// 🔍 Indexes for better query performance
transcriptionSchema.index({ userId: 1, createdAt: -1 });
transcriptionSchema.index({ filename: 1 });
transcriptionSchema.index({ status: 1 });

const Transcription = mongoose.model("Transcription", transcriptionSchema);

export default Transcription;

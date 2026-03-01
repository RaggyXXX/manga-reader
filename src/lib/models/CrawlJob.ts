import mongoose, { Document, Model, Schema } from "mongoose";

export type CrawlJobType = "discover" | "chapters";
export type CrawlJobStatus = "queued" | "running" | "completed" | "failed";

export interface ICrawlJob extends Document {
  _id: mongoose.Types.ObjectId;
  seriesId: mongoose.Types.ObjectId;
  type: CrawlJobType;
  status: CrawlJobStatus;
  progress: number;
  total: number;
  completed: number;
  currentBatch: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

const CrawlJobSchema = new Schema<ICrawlJob>(
  {
    seriesId: { type: Schema.Types.ObjectId, ref: "Series", required: true },
    type: { type: String, enum: ["discover", "chapters"], required: true },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
    },
    progress: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    currentBatch: { type: Number, default: 1 },
    errorMessage: { type: String, default: undefined },
    startedAt: { type: Date, default: undefined },
    completedAt: { type: Date, default: undefined },
  },
  { timestamps: true, versionKey: false, collection: "crawl_jobs" }
);

CrawlJobSchema.index({ seriesId: 1, type: 1, status: 1 });

const CrawlJob: Model<ICrawlJob> =
  mongoose.models.CrawlJob ?? mongoose.model<ICrawlJob>("CrawlJob", CrawlJobSchema);

export default CrawlJob;

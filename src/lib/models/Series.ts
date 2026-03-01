import mongoose, { Document, Model, Schema } from "mongoose";

export type SeriesStatus = "discovering" | "partial" | "complete";

export interface ISeries extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  sourceUrl: string;
  coverUrl?: string;
  totalChapters: number;
  crawledChapters: number;
  status: SeriesStatus;
  lastSynced?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SeriesSchema = new Schema<ISeries>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sourceUrl: { type: String, required: true, unique: true },
    coverUrl: { type: String, default: undefined },
    totalChapters: { type: Number, default: 0 },
    crawledChapters: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["discovering", "partial", "complete"],
      default: "discovering",
    },
    lastSynced: { type: Date, default: undefined },
  },
  { timestamps: true, versionKey: false, collection: "series" }
);

SeriesSchema.index({ slug: 1 }, { unique: true });
SeriesSchema.index({ sourceUrl: 1 }, { unique: true });

const Series: Model<ISeries> =
  mongoose.models.Series ?? mongoose.model<ISeries>("Series", SeriesSchema);

export default Series;

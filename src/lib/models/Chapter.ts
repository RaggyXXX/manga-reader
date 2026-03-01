import mongoose, { Document, Model, Schema } from "mongoose";

export type ChapterStatus = "pending" | "crawled" | "error";

export interface IChapter extends Document {
  _id: mongoose.Types.ObjectId;
  seriesId: mongoose.Types.ObjectId;
  number: number;
  title: string;
  sourceUrl: string;
  imageUrls: string[];
  pageCount: number;
  status: ChapterStatus;
  errorMessage?: string;
  crawledAt?: Date;
}

const ChapterSchema = new Schema<IChapter>(
  {
    seriesId: { type: Schema.Types.ObjectId, ref: "Series", required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    sourceUrl: { type: String, required: true },
    imageUrls: { type: [String], default: [] },
    pageCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "crawled", "error"],
      default: "pending",
    },
    errorMessage: { type: String, default: undefined },
    crawledAt: { type: Date, default: undefined },
  },
  { timestamps: true, versionKey: false, collection: "chapters" }
);

ChapterSchema.index({ seriesId: 1, number: 1 }, { unique: true });
ChapterSchema.index({ seriesId: 1, status: 1 });

const Chapter: Model<IChapter> =
  mongoose.models.Chapter ?? mongoose.model<IChapter>("Chapter", ChapterSchema);

export default Chapter;

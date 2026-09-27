import mongoose, { Schema, type Model } from "mongoose";

export type StaticHtmlRecord = {
  _id: string;
  html: string;
  originalName: string;
  size: number;
  uploadedBy: string;
  includeSiteHeader: boolean;
  createdAt: Date;
};

const schema = new Schema<StaticHtmlRecord>({
  // MongoDB's built-in unique _id index also prevents concurrent slug collisions.
  _id: { type: String, required: true },
  html: { type: String, required: true, select: false },
  originalName: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedBy: { type: String, required: true },
  includeSiteHeader: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const cached = mongoose.models.StaticHtml as Model<StaticHtmlRecord> | undefined;
if (cached && cached.schema !== schema) mongoose.deleteModel("StaticHtml");
export const StaticHtml = mongoose.model<StaticHtmlRecord>("StaticHtml", schema);

import mongoose, { Schema, type Model } from "mongoose";

export type StaticHtmlRecord = {
  _id: string;
  html: string;
  originalName: string;
  size: number;
  uploadedBy: string;
  createdAt: Date;
};

const schema = new Schema<StaticHtmlRecord>({
  // MongoDB's built-in unique _id index also prevents concurrent slug collisions.
  _id: { type: String, required: true },
  html: { type: String, required: true, select: false },
  originalName: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const StaticHtml = (mongoose.models.StaticHtml as Model<StaticHtmlRecord> | undefined)
  ?? mongoose.model<StaticHtmlRecord>("StaticHtml", schema);

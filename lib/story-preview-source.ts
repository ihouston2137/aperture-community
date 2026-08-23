import { connectDB } from "./db";
import { Story } from "./models";
import { toStoryView } from "./stories";
import type { StoryOption } from "@/app/admin/story-templates/story-template-builder";

/**
 * The stories offered in the template builder's preview picker, plus the first
 * one already rendered so the canvas has real content on load rather than
 * flashing placeholders.
 */
export async function loadStoryPreviewSource() {
  await connectDB();

  const docs = await Story.find()
    .select("headline status publishDate")
    .sort({ publishDate: -1 })
    .limit(100)
    .lean<any[]>();

  const stories: StoryOption[] = docs.map((doc) => ({
    _id: String(doc._id),
    label: doc.headline || "Untitled",
  }));

  if (docs.length === 0) return { stories, initialStory: null };

  const first = await Story.findById(docs[0]._id).lean<any>();
  return {
    stories,
    initialStory: first
      ? { id: String(first._id), view: await toStoryView(first) }
      : null,
  };
}

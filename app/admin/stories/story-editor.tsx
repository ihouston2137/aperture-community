"use client";

import Link from "next/link";
import { useState } from "react";

import { MediaDetailsDialog } from "@/app/admin/media/media-details-dialog";
import { MediaField, MediaPicker } from "@/app/admin/media/media-picker";
import { RichTextEditor } from "@/components/rich-text-editor";
import { isPersonBio } from "@/lib/bio-types";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import {
  MEDIA_CLICK_ACTIONS,
  MEDIA_CLICK_ACTION_LABELS,
  STORY_IMAGE_ALIGNMENTS,
  STORY_IMAGE_ALIGN_LABELS,
  STORY_IMAGE_SIZES,
  STORY_IMAGE_SIZE_LABELS,
  countStoryParagraphs,
  type MediaClickSettings,
  type StoryImage,
} from "@/lib/story-media";

import { saveStoryAction } from "./actions";

/** Alt text, captions and credits live on the file, so only ids are stored here. */
export type MediaMeta = { alt: string; caption: string; title: string };

export type StoryRecord = {
  _id?: string;
  headline: string;
  slug: string;
  subHeadline: string;
  category: string;
  location: string;
  author: string;
  authorBioId: string;
  publishDate: string;
  status: string;
  featureMediaId: string;
  featureMediaUrl: string;
  featureMediaType: string;
  featureClick: MediaClickSettings;
  templateId: string;
  content: string;
  storyImages: StoryImage[];
};

type Option = { _id: string; label: string };

/** Profiles carry their type so the author picker can offer people only. */
type BioOption = Option & { type: string };

/* ------------------------------------------------------------- Click actions */

function ClickActionFields({
  value,
  onChange,
}: {
  value: MediaClickSettings;
  onChange: (next: MediaClickSettings) => void;
}) {
  return (
    <>
      <div className="field">
        <label>On click</label>
        <select
          value={value.clickAction}
          onChange={(event) =>
            onChange({ ...value, clickAction: event.target.value as MediaClickSettings["clickAction"] })
          }
        >
          {MEDIA_CLICK_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {MEDIA_CLICK_ACTION_LABELS[action]}
            </option>
          ))}
        </select>
      </div>

      {value.clickAction === "link" ? (
        <>
          <div className="field">
            <label>Link address</label>
            <input
              type="text"
              value={value.linkHref}
              placeholder="https://…"
              onChange={(event) => onChange({ ...value, linkHref: event.target.value })}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={value.linkNewTab}
              onChange={(event) => onChange({ ...value, linkNewTab: event.target.checked })}
            />
            Open in a new tab
          </label>
        </>
      ) : null}
    </>
  );
}

/** What the file itself says, so the editor can see what will render. */
function MetaSummary({
  meta,
  onEdit,
  canEdit,
}: {
  meta: MediaMeta | undefined;
  onEdit: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="media-meta-summary">
      <div>
        <span className="help-text">
          {meta?.alt || meta?.title ? (
            <>
              <strong>Alt:</strong> {meta.alt || meta.title}
            </>
          ) : (
            "No alt text on this file."
          )}
        </span>
        <br />
        <span className="help-text">
          {meta?.caption ? (
            <>
              <strong>Caption:</strong> {meta.caption}
            </>
          ) : (
            "No caption on this file."
          )}
        </span>
      </div>
      {canEdit ? (
        <button type="button" className="btn btn-sm" onClick={onEdit}>
          Edit file details
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- Editor */

export function StoryEditor({
  story,
  templates,
  bios,
  fonts,
  mediaMeta: initialMediaMeta,
  canEditMedia,
}: {
  story: StoryRecord;
  templates: Option[];
  bios: BioOption[];
  fonts: string[];
  /** Keyed by media id and, for older rows, by url. */
  mediaMeta: Record<string, MediaMeta>;
  canEditMedia: boolean;
}) {
  const [content, setContent] = useState(story.content);
  const [featureUrl, setFeatureUrl] = useState(story.featureMediaUrl);
  const [featureId, setFeatureId] = useState(story.featureMediaId);
  const [featureType, setFeatureType] = useState(story.featureMediaType);
  const [featureClick, setFeatureClick] = useState(story.featureClick);
  const [images, setImages] = useState<StoryImage[]>(story.storyImages);
  const [mediaMeta, setMediaMeta] = useState(initialMediaMeta);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // Recomputed as the prose changes, with the same splitter the renderer uses.
  const paragraphCount = countStoryParagraphs(content);

  function metaFor(ref: { mediaId: string; url: string }): MediaMeta | undefined {
    return mediaMeta[ref.mediaId] ?? mediaMeta[ref.url];
  }

  function updateImage(index: number, patch: Partial<StoryImage>) {
    setImages((current) =>
      current.map((image, position) => (position === index ? { ...image, ...patch } : image))
    );
  }

  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next.map((image, position) => ({ ...image, order: position })));
  }

  const anchorOptions = Array.from({ length: paragraphCount + 1 }, (_, index) => ({
    value: index,
    label: index === 0 ? "Before the first paragraph" : `After paragraph ${index}`,
  }));

  return (
    <form action={saveStoryAction}>
      {story._id ? <input type="hidden" name="id" value={story._id} /> : null}
      <input type="hidden" name="content" value={content} />
      <input type="hidden" name="featureMediaUrl" value={featureUrl} />
      <input type="hidden" name="featureMediaId" value={featureId} />
      <input type="hidden" name="featureMediaType" value={featureType} />
      <input type="hidden" name="featureClickAction" value={featureClick.clickAction} />
      <input type="hidden" name="featureLinkHref" value={featureClick.linkHref} />
      <input
        type="hidden"
        name="featureLinkNewTab"
        value={featureClick.linkNewTab ? "true" : "false"}
      />
      <input type="hidden" name="storyImages" value={JSON.stringify(images)} />

      <div className="story-editor-grid">
        <div className="story-editor-column">
          <section className="panel">
            <h2 className="panel-title">Story details</h2>
            <div className="field-grid">
              <div className="field">
                <label>Headline</label>
                <input type="text" name="headline" defaultValue={story.headline} required />
              </div>
              <div className="field">
                <label>Slug</label>
                <input type="text" name="slug" defaultValue={story.slug} />
                <span className="help-text">Leave blank to generate from the headline.</span>
              </div>
              <div className="field">
                <label>Sub headline</label>
                <input type="text" name="subHeadline" defaultValue={story.subHeadline} />
              </div>
              <div className="field">
                <label>Category</label>
                <input type="text" name="category" defaultValue={story.category} />
              </div>
              <div className="field">
                <label>Location</label>
                <input type="text" name="location" defaultValue={story.location} />
              </div>
              <div className="field">
                <label>Author name</label>
                <input type="text" name="author" defaultValue={story.author} />
              </div>
              <div className="field">
                <label>Author profile</label>
                {/* A story is written by a person, so subjects are not offered. */}
                <select name="authorBioId" defaultValue={story.authorBioId}>
                  <option value="">None</option>
                  {bios.filter(isPersonBio).map((bio) => (
                    <option key={bio._id} value={bio._id}>
                      {bio.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Publish date</label>
                <input
                  type="date"
                  name="publishDate"
                  defaultValue={story.publishDate.slice(0, 10)}
                />
              </div>
              <div className="field">
                <label>Status</label>
                <select name="status" defaultValue={story.status}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div className="field">
                <label>Template</label>
                <select name="templateId" defaultValue={story.templateId}>
                  <option value="">Use the default template</option>
                  {templates.map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.label}
                    </option>
                  ))}
                </select>
                <span className="help-text">
                  The template decides what is shown, in what order and in what type.
                </span>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Content</h2>
            <RichTextEditor
              value={content}
              onChange={setContent}
              fonts={fonts}
              minHeight={24}
            />
          </section>
        </div>

        <div className="story-editor-column">
          <section className="panel">
            <h2 className="panel-title">Feature media</h2>
            <div className="field-grid">
              <MediaField
                label="Feature image or video"
                value={featureUrl}
                mediaType={featureType === "video" ? "video" : "image"}
                onChange={(url, asset) => {
                  setFeatureUrl(url);
                  setFeatureId(asset?._id ?? "");
                  if (asset?.mediaType) setFeatureType(asset.mediaType);
                  if (asset) {
                    setMediaMeta((current) => ({
                      ...current,
                      [asset._id]: {
                        alt: asset.alt ?? "",
                        caption: asset.caption ?? "",
                        title: asset.title ?? "",
                      },
                    }));
                  }
                }}
              />
              <div className="field">
                <label>Media type</label>
                <select
                  value={featureType}
                  onChange={(event) => setFeatureType(event.target.value)}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>
              {featureType === "video" ? null : (
                <ClickActionFields value={featureClick} onChange={setFeatureClick} />
              )}
            </div>

            {featureUrl ? (
              <MetaSummary
                meta={metaFor({ mediaId: featureId, url: featureUrl })}
                canEdit={canEditMedia && Boolean(featureId)}
                onEdit={() => setDetailsId(featureId)}
              />
            ) : null}
          </section>

          <section className="panel">
            <h2 className="panel-title">Story images</h2>
            <p className="help-text" style={{ marginTop: 0 }}>
              Each image is placed between the paragraphs of the content on the left.
              Left and right alignment lets the text wrap beside it.
            </p>

            <ul className="story-image-list">
              {images.map((image, index) => {
                const meta = metaFor(image);
                return (
                  <li key={`${image.url}-${index}`} className="story-image-row">
                    <div className="story-image-head">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={protectedMediaUrl(image.url)} alt="" loading="lazy" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <MetaSummary
                          meta={meta}
                          canEdit={canEditMedia && Boolean(image.mediaId)}
                          onEdit={() => setDetailsId(image.mediaId)}
                        />
                      </div>
                      <div className="admin-list-actions">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => moveImage(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => moveImage(index, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() =>
                            setImages((current) =>
                              current.filter((_, position) => position !== index)
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="field-grid">
                      <div className="field">
                        <label>Size</label>
                        <select
                          value={image.size}
                          onChange={(event) =>
                            updateImage(index, { size: event.target.value as StoryImage["size"] })
                          }
                        >
                          {STORY_IMAGE_SIZES.map((size) => (
                            <option key={size} value={size}>
                              {STORY_IMAGE_SIZE_LABELS[size]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Alignment</label>
                        <select
                          value={image.align}
                          onChange={(event) =>
                            updateImage(index, {
                              align: event.target.value as StoryImage["align"],
                            })
                          }
                        >
                          {STORY_IMAGE_ALIGNMENTS.map((align) => (
                            <option key={align} value={align}>
                              {STORY_IMAGE_ALIGN_LABELS[align]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Position</label>
                        <select
                          value={Math.min(image.afterParagraph, paragraphCount)}
                          onChange={(event) =>
                            updateImage(index, { afterParagraph: Number(event.target.value) })
                          }
                        >
                          {anchorOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <ClickActionFields
                        value={image}
                        onChange={(next) => updateImage(index, next)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {images.length === 0 ? (
              <p className="admin-subtitle">No images placed in this story yet.</p>
            ) : null}

            <button type="button" className="btn btn-sm" onClick={() => setPickerOpen(true)}>
              Add image
            </button>
            <MediaPicker
              open={pickerOpen}
              mediaType="image"
              onClose={() => setPickerOpen(false)}
              onSelect={(asset) => {
                setMediaMeta((current) => ({
                  ...current,
                  [asset._id]: {
                    alt: asset.alt ?? "",
                    caption: asset.caption ?? "",
                    title: asset.title ?? "",
                  },
                }));
                setImages((current) => [
                  ...current,
                  {
                    mediaId: asset._id,
                    url: asset.url,
                    size: "medium",
                    align: "center",
                    // New images land at the end of what is written so far.
                    afterParagraph: paragraphCount,
                    clickAction: "none",
                    linkHref: "",
                    linkNewTab: false,
                    order: current.length,
                  },
                ]);
              }}
            />
          </section>
        </div>
      </div>

      <div className="admin-actions">
        <button type="submit" className="btn btn-primary">
          Save story
        </button>
        {story._id ? (
          <Link
            className="btn"
            href={`/stories/${story.slug}?previewId=${story._id}`}
            target="_blank"
          >
            Preview
          </Link>
        ) : null}
      </div>

      <MediaDetailsDialog
        mediaId={detailsId}
        onClose={() => setDetailsId(null)}
        onSaved={(asset) =>
          setMediaMeta((current) => ({
            ...current,
            [asset._id]: {
              alt: asset.alt ?? "",
              caption: asset.caption ?? "",
              title: asset.title ?? "",
            },
          }))
        }
      />
    </form>
  );
}

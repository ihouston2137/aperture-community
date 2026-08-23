import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

import { checkPermission } from "@/lib/access";
import { getSession } from "@/lib/session";

/**
 * Encodes an MP4 from frames rendered in the browser (via `html-to-image`) plus
 * an optional audio track. Encoding is delegated to `ffmpeg` on the host — the
 * route reports a clear error when it is not available rather than failing
 * silently, since no JavaScript encoder ships with the app.
 */

const MAX_FRAMES = 600;
const MAX_FRAME_BYTES = 12 * 1024 * 1024;

function decodeDataUrl(value: string): Buffer | null {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(value);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  return buffer.length > 0 && buffer.length <= MAX_FRAME_BYTES ? buffer : null;
}

function runFfmpeg(args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("ffmpeg", args);
    } catch {
      return resolve({ ok: false, stderr: "spawn-failed" });
    }

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => resolve({ ok: false, stderr: "spawn-failed" }));
    child.on("close", (code) => resolve({ ok: code === 0, stderr }));
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "publications.manage"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const frames: unknown = body?.frames;

  if (!Array.isArray(frames) || frames.length === 0) {
    return Response.json({ error: "No frames were supplied." }, { status: 400 });
  }
  if (frames.length > MAX_FRAMES) {
    return Response.json(
      { error: `Too many frames — the limit is ${MAX_FRAMES}.` },
      { status: 400 }
    );
  }

  const fps = Math.min(60, Math.max(1, Number(body?.fps) || 30));
  const workDir = path.join(tmpdir(), `aperture-export-${randomBytes(6).toString("hex")}`);

  try {
    await mkdir(workDir, { recursive: true });

    for (const [index, frame] of frames.entries()) {
      const buffer = decodeDataUrl(String(frame));
      if (!buffer) {
        return Response.json(
          { error: `Frame ${index + 1} is not a valid image data URL.` },
          { status: 400 }
        );
      }
      await writeFile(
        path.join(workDir, `frame-${String(index).padStart(5, "0")}.png`),
        buffer
      );
    }

    const outputPath = path.join(workDir, "output.mp4");
    const args = [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      path.join(workDir, "frame-%05d.png"),
    ];

    // The audio track is a path under /public/uploads, never a client-supplied
    // absolute path.
    const audioUrl = typeof body?.audioUrl === "string" ? body.audioUrl : "";
    if (audioUrl.startsWith("/uploads/") && !audioUrl.includes("..")) {
      args.push("-i", path.join(process.cwd(), "public", audioUrl), "-shortest");
    }

    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath);

    const result = await runFfmpeg(args);

    if (!result.ok) {
      if (result.stderr === "spawn-failed") {
        return Response.json(
          {
            error:
              "ffmpeg is not available on this server, so MP4 export cannot run. " +
              "Install ffmpeg and make sure it is on the PATH.",
          },
          { status: 501 }
        );
      }
      return Response.json(
        { error: `ffmpeg failed: ${result.stderr.slice(-500)}` },
        { status: 500 }
      );
    }

    const video = await readFile(outputPath);
    return new Response(new Uint8Array(video), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="publication.mp4"',
        "Content-Length": String(video.length),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 500 }
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

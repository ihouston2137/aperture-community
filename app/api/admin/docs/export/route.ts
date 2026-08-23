import { deflateRawSync } from "node:zlib";

import { NextResponse } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeDocBlocks } from "@/lib/doc-layout";
import { serializeMarkdown, type FrontMatter } from "@/lib/doc-markdown";
import { buildDocTree, listDocSets, listDocs, type DocNode } from "@/lib/docs";
import { DocPage } from "@/lib/models";
import { getSession } from "@/lib/session";

/**
 * Every document as a zip of markdown files, the hierarchy mirrored as folders.
 *
 * One file per page, which is how the documents were authored and how another
 * system would expect to read them back. A page with children becomes a folder
 * plus an `index.md`, so the tree survives a round trip through a file system.
 *
 * The archive is built here rather than with a dependency: a zip of small text
 * files is a well-specified container, and Node already ships the one piece
 * that is not trivial — the deflate.
 */
export async function GET() {
  const session = await getSession();
  if (!(await checkPermission(session, "docs.manage"))) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  await connectDB();

  const pages = await DocPage.find().lean<any[]>();
  const byId = new Map(pages.map((doc) => [String(doc._id), doc]));

  const files: { path: string; body: string }[] = [];

  const walk = (nodes: DocNode[], prefix: string) => {
    for (const node of nodes) {
      const doc = byId.get(node._id);
      if (!doc) continue;

      const frontMatter: FrontMatter = {
        title: doc.title ?? "",
        slug: doc.slug ?? "",
        status: doc.status ?? "draft",
        description: doc.description ?? "",
        category: doc.category ?? "",
        tags: Array.isArray(doc.tags) ? doc.tags.join(", ") : "",
        ...((doc.frontMatter ?? {}) as FrontMatter),
      };

      const body = serializeMarkdown(normalizeDocBlocks(doc.content), frontMatter);
      const name = doc.slug || node._id;

      if (node.children.length > 0) {
        // A page with children owns a folder, and is its index inside it.
        const folder = `${prefix}${name}/`;
        files.push({ path: `${folder}index.md`, body });
        walk(node.children, folder);
      } else {
        files.push({ path: `${prefix}${name}.md`, body });
      }
    }
  };

  // Each set is a folder of its own, so an export of the whole site keeps the
  // groupings a reader sees rather than pouring every page into one directory.
  for (const set of await listDocSets()) {
    const tree = buildDocTree(await listDocs(set._id));
    walk(tree, `${set.slug || set._id}/`);
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "Nothing to export." }, { status: 404 });
  }

  const archive = buildZip(files);

  return new NextResponse(archive as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="documentation.zip"',
    },
  });
}

/* ------------------------------------------------------------------- Zip */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A minimal zip: one deflated entry per file, then the central directory.
 *
 * Deliberately plain — no zip64, no encryption, no extra fields. Documentation
 * is small text, so the cases those cover cannot arise here.
 */
function buildZip(files: { path: string; body: string }[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const raw = Buffer.from(file.body, "utf8");
    const deflated = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time and date, left at zero
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(0, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(0, 38); // external attributes
    entry.writeUInt32LE(offset, 42);

    central.push(entry, name);
    offset += local.length + name.length + deflated.length;
  }

  const directory = Buffer.concat(central);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, directory, end]);
}

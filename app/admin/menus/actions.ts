"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { ensureSiteMenu, normalizeMenuItems } from "@/lib/menus";
import { Menu } from "@/lib/models";
import { slugify, uniqueSlug } from "@/lib/slug";

export type MenuActionResult = { ok: boolean; error?: string };

async function guard() {
  await requirePermission("siteContent.manage");
  await connectDB();
}

function revalidate() {
  revalidatePath("/admin/menus");
  // The header carries the site menu, and a page may carry any of them.
  revalidatePath("/", "layout");
}

export async function createMenuAction(formData: FormData): Promise<MenuActionResult> {
  await guard();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give this menu a name." };

  const slug = await uniqueSlug(Menu, slugify(name), "menu");
  const created = await Menu.create({ name, slug, isSite: false, items: [] });

  revalidate();
  redirect(`/admin/menus/${String(created._id)}`);
}

export async function saveMenuAction(formData: FormData): Promise<MenuActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return { ok: false, error: "That menu no longer exists." };
  if (!name) return { ok: false, error: "Give this menu a name." };

  const menu = await Menu.findById(id);
  if (!menu) return { ok: false, error: "That menu no longer exists." };

  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { ok: false, error: "Those items could not be read." };
  }

  menu.name = name;
  // Normalized on the way in as well as on the way out, so a hand-edited
  // payload cannot store a shape the renderers do not expect.
  menu.items = normalizeMenuItems(items);
  await menu.save();

  revalidate();
  return { ok: true };
}

export async function deleteMenuAction(formData: FormData): Promise<MenuActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const menu = await Menu.findById(id);
  if (!menu) return { ok: false, error: "That menu no longer exists." };
  // The header has to have a menu to render, even an empty one.
  if (menu.isSite) {
    return { ok: false, error: "The site header menu cannot be deleted." };
  }

  await Menu.findByIdAndDelete(id);
  await ensureSiteMenu();

  revalidate();
  redirect("/admin/menus");
}

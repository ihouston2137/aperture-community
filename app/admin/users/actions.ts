"use server";

import { revalidatePath } from "next/cache";
import { hashSync } from "bcrypt-ts";

import { ensureAdministratorRole, requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Role, User } from "@/lib/models";
import { allPermissions, ADMINISTRATOR_ROLE_SLUG } from "@/lib/permissions";
import { slugify, uniqueSlug } from "@/lib/slug";

async function guard() {
  await requirePermission("users.manage");
  await connectDB();
}

/**
 * The dialogs stay open on failure to show the message, so these actions report
 * back rather than returning silently.
 */
export type RoleActionResult = { ok: boolean; error?: string };
export type UserActionResult = { ok: boolean; error?: string };

export async function saveUserAction(formData: FormData): Promise<UserActionResult> {
  const { session } = await requirePermission("users.manage");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const isActive = formData.get("isActive") === "on";
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);

  if (!email) return { ok: false, error: "An email address is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That does not look like an email address." };
  }

  // `email` is unique in the schema; checking first turns a driver-level
  // duplicate-key throw into a message the dialog can show.
  const clash = await User.findOne({ email, ...(id ? { _id: { $ne: id } } : {}) })
    .select("_id")
    .lean();
  if (clash) return { ok: false, error: "Another account already uses that email." };

  // Deactivating yourself ends your own access the moment the page reloads.
  if (id && id === session.userId && !isActive) {
    return { ok: false, error: "You cannot deactivate your own account." };
  }

  if (id) {
    const user = await User.findById(id);
    if (!user) return { ok: false, error: "That account no longer exists." };

    user.email = email;
    user.name = name;
    user.isActive = isActive;
    user.roleIds = roleIds;
    if (password) {
      user.passwordHash = hashSync(password, 10);
      user.mustChangePassword = true;
    }
    await user.save();
  } else {
    if (!password) return { ok: false, error: "Set a temporary password." };
    await User.create({
      email,
      name,
      passwordHash: hashSync(password, 10),
      // New accounts always pick their own password on first sign-in.
      mustChangePassword: true,
      isActive,
      roleIds,
    });
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUserAction(formData: FormData): Promise<UserActionResult> {
  const { session } = await requirePermission("users.manage");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That account no longer exists." };
  // Deleting your own account would lock you out mid-session.
  if (id === session.userId) {
    return { ok: false, error: "You cannot delete your own account." };
  }

  await User.findByIdAndDelete(id);

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function saveRoleAction(formData: FormData): Promise<RoleActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const permissions = formData
    .getAll("permissions")
    .map(String)
    .filter((permission) => allPermissions.includes(permission));

  if (!name) return { ok: false, error: "Give this role a name." };

  if (id) {
    const role = await Role.findById(id);
    if (!role) return { ok: false, error: "That role no longer exists." };

    // The Administrator role must keep every permission, and its name is what
    // the access layer looks for — only the description is editable.
    if (role.slug === ADMINISTRATOR_ROLE_SLUG) {
      role.description = description;
      await role.save();
    } else {
      role.name = name;
      role.description = description;
      role.permissions = permissions;
      await role.save();
    }
  } else {
    const slug = await uniqueSlug(Role, slugify(name), "role");
    await Role.create({ name, slug, description, permissions, isSystem: false });
  }

  await ensureAdministratorRole();
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteRoleAction(formData: FormData): Promise<RoleActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That role no longer exists." };

  const role = await Role.findById(id);
  if (!role) return { ok: false, error: "That role no longer exists." };
  if (role.isSystem) return { ok: false, error: "Built-in roles cannot be deleted." };

  // Anyone holding it loses it rather than keeping a dangling reference.
  await User.updateMany({ roleIds: role._id }, { $pull: { roleIds: role._id } });
  await Role.findByIdAndDelete(id);

  revalidatePath("/admin/users");
  return { ok: true };
}

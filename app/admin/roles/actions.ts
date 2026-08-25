"use server";

import { revalidatePath } from "next/cache";

import { ensureAdministratorRole, requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { AuthSettings, Role, User } from "@/lib/models";
import {
  ADMINISTRATOR_ROLE_SLUG,
  allPermissionsFor,
  roleKind,
} from "@/lib/permissions";
import { slugify, uniqueSlug } from "@/lib/slug";

/** The dialogs stay open on failure, so these report back rather than throwing. */
export type RoleActionResult = { ok: boolean; error?: string };

async function guard() {
  await requirePermission("users.manage");
  await connectDB();
}

export async function saveRoleAction(formData: FormData): Promise<RoleActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const level = Math.round(Number(formData.get("level") ?? 0)) || 0;
  const openToRegistration = formData.get("openToRegistration") === "on";

  if (!name) return { ok: false, error: "Give this role a name." };

  const existing = id ? await Role.findById(id) : null;
  if (id && !existing) return { ok: false, error: "That role no longer exists." };

  // The kind decides which vocabulary the permissions come from, and it is
  // fixed once set — flipping it would leave a role holding permissions that no
  // longer mean anything.
  const kind = existing ? roleKind(existing.kind) : roleKind(formData.get("kind"));
  const allowed = allPermissionsFor(kind);
  const permissions = formData
    .getAll("permissions")
    .map(String)
    .filter((permission) => allowed.includes(permission));

  if (existing) {
    // The Administrator role must keep every permission, and its name is what
    // the access layer looks for — only the description is editable.
    if (existing.slug === ADMINISTRATOR_ROLE_SLUG) {
      existing.description = description;
    } else {
      existing.name = name;
      existing.description = description;
      existing.permissions = permissions;
      if (kind === "community") {
        existing.level = level;
        existing.openToRegistration = openToRegistration;
      }
    }
    await existing.save();
  } else {
    const slug = await uniqueSlug(Role, slugify(name), "role");
    await Role.create({
      name,
      slug,
      description,
      kind,
      level: kind === "community" ? level : 0,
      openToRegistration: kind === "community" ? openToRegistration : false,
      permissions,
      isSystem: false,
    });
  }

  await ensureAdministratorRole();
  revalidatePath("/admin/roles");
  revalidatePath("/admin/users");
  revalidatePath("/admin/members");
  revalidatePath("/admin/registration");
  return { ok: true };
}

export async function deleteRoleAction(formData: FormData): Promise<RoleActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That role no longer exists." };

  const role = await Role.findById(id);
  if (!role) return { ok: false, error: "That role no longer exists." };
  if (role.isSystem) return { ok: false, error: "Built-in roles cannot be deleted." };

  // Deleting the last membership level would leave registration with nothing to
  // assign, and the next person to register unable to join.
  if (roleKind(role.kind) === "community") {
    const others = await Role.countDocuments({
      kind: "community",
      _id: { $ne: role._id },
    });
    if (others === 0) {
      return {
        ok: false,
        error: "This is the only membership level. Add another before deleting it.",
      };
    }
  }

  // Anyone holding it loses it rather than keeping a dangling reference.
  await User.updateMany({ roleIds: role._id }, { $pull: { roleIds: role._id } });
  await User.updateMany({ requestedRoleId: role._id }, { $set: { requestedRoleId: null } });
  // Registration falls back to the lowest level on its own, but leaving a
  // deleted role named as the default would be confusing on the settings page.
  await AuthSettings.updateMany(
    { defaultCommunityRoleId: role._id },
    { $set: { defaultCommunityRoleId: null } }
  );
  await Role.findByIdAndDelete(id);

  revalidatePath("/admin/roles");
  revalidatePath("/admin/users");
  revalidatePath("/admin/members");
  revalidatePath("/admin/registration");
  return { ok: true };
}

import { AdminHeader, Panel } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { normalizeBioType } from "@/lib/bio-types";
import { connectDB } from "@/lib/db";
import { Bio } from "@/lib/models";

import { deleteBioAction } from "./actions";
import { BioForm, type BioRecord } from "./bio-form";

export const metadata = { title: "Profiles" };

export default async function ProfilesPage() {
  await requirePermission("profiles.manage");
  await connectDB();

  const bios = await Bio.find().sort({ name: 1 }).lean<any[]>();
  const records: BioRecord[] = bios.map((bio) => ({
    _id: String(bio._id),
    name: bio.name ?? "",
    slug: bio.slug ?? "",
    // Profiles saved under the older three-way split still hold `Author` or
    // `Model`; both are people.
    type: normalizeBioType(bio.type),
    title: bio.title ?? "",
    location: bio.location ?? "",
    description: bio.description ?? "",
    headshotMediaId: bio.headshotMediaId ?? "",
    headshotUrl: bio.headshotUrl ?? "",
    isPrimary: Boolean(bio.isPrimary),
  }));

  return (
    <>
      <AdminHeader
        title="Profiles"
        subtitle="People and subjects referenced by stories and media. Only a person can be credited as an author."
      />

      {records.map((bio) => (
        <Panel
          key={bio._id}
          title={`${bio.name} · ${bio.type}${bio.isPrimary ? " · primary" : ""}`}
        >
          <BioForm bio={bio} />
          <form action={deleteBioAction} style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="id" value={bio._id} />
            <button type="submit" className="btn btn-danger btn-sm">
              Delete profile
            </button>
          </form>
        </Panel>
      ))}

      <Panel title="Add a profile">
        <BioForm />
      </Panel>
    </>
  );
}

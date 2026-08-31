import { requirePermission } from "@/lib/access";
import { defaultFormSettings } from "@/lib/form-layout";
import { createTestQuestion, defaultTestSettings } from "@/lib/form-test";

import { TestBuilder } from "../test-builder";

export const metadata = { title: "New test" };

export default async function NewTestPage() {
  await requirePermission("forms.manage");

  return (
    <TestBuilder
      test={{
        title: "",
        slug: "",
        status: "draft",
        settings: defaultFormSettings,
        // One question to start, so the editor opens on something to fill in
        // rather than on an empty page and a row of buttons.
        test: { ...defaultTestSettings, questions: [createTestQuestion("radio")] },
      }}
    />
  );
}

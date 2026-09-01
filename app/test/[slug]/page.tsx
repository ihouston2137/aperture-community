import { notFound, redirect } from "next/navigation";

import { FormShell } from "@/components/form-shell";
import { SiteChrome } from "@/components/site-chrome";
import { guardContent } from "@/lib/content-guard";
import { connectDB } from "@/lib/db";
import { styleSlotProps } from "@/lib/display-templates";
import { normalizeFormSettings } from "@/lib/form-layout";
import { buildSitting, normalizeTestSettings, sittingLayout } from "@/lib/form-test";
import { FormDefinition, FormSubmission } from "@/lib/models";
import { getSession } from "@/lib/session";

async function findTest(slug: string) {
  await connectDB();
  return FormDefinition.findOne({ slug, status: "published" }).lean<any>();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const test = await findTest(slug);
  return test ? { title: test.title } : {};
}

/**
 * A test, at its own address.
 *
 * Its own route rather than a branch of `/forms/[slug]`, because a test is not
 * a form somebody fills in: it is sat, by a named person, a bounded number of
 * times, and it comes back with a mark. The address says which of the two this
 * is before anybody opens it.
 */
export default async function TestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const test = await findTest(slug);
  if (!test) notFound();

  // A form at this address is a form; send it to its own page rather than
  // rendering one thing under the other's name.
  if (test.kind !== "test") redirect(`/forms/${slug}`);

  await guardContent("form", String(test._id), `/test/${slug}`);

  const settings = normalizeTestSettings(test.test);
  const formSettings = normalizeFormSettings(test.settings);

  /*
   * How many sittings they have left.
   *
   * Counted here as well as on submit: a candidate who has used their attempts
   * should be told before they answer forty questions, not after. The submit
   * route still checks, because this page's answer is a moment old by the time
   * anything is sent.
   */
  const session = await getSession();
  let used = 0;
  if (session) {
    const previous = await FormSubmission.findOne({
      formId: String(test._id),
      userId: session.userId,
    })
      .select("attempts")
      .lean<any>();
    used = previous?.attempts ?? 0;
  }

  const spent = settings.attemptLimit > 0 && used >= settings.attemptLimit;

  const served = buildSitting(settings);
  const titleStyled = styleSlotProps(settings.titleStyle);
  const introStyled = styleSlotProps(settings.instructionsStyle);

  return (
    <SiteChrome>
      <div className="page-shell test-page">
        <header className="test-page-head">
          <h1
            className={`test-page-title ${titleStyled.className}`.trim()}
            style={titleStyled.style}
          >
            {test.title}
          </h1>

          {settings.instructions ? (
            // Kept as written, line breaks and all: instructions are usually a
            // list of things, and running them together loses the list.
            <div
              className={`test-page-instructions ${introStyled.className}`.trim()}
              style={introStyled.style}
            >
              {settings.instructions}
            </div>
          ) : null}
        </header>

        {!session ? (
          <p className="admin-notice is-error">
            Sign in to take this test — a result has to belong to somebody.
          </p>
        ) : spent ? (
          <p className="admin-notice is-error">
            {settings.attemptLimit === 1
              ? "You have already taken this test."
              : `You have taken this test ${used} times, which is all that is allowed.`}
          </p>
        ) : (
          <>
            {settings.attemptLimit > 0 ? (
              <p className="help-text test-page-attempts">
                {used === 0
                  ? `You may take this ${settings.attemptLimit} time${
                      settings.attemptLimit === 1 ? "" : "s"
                    }.`
                  : `Attempt ${used + 1} of ${settings.attemptLimit}. Your best result is the one kept.`}
              </p>
            ) : null}

            <FormShell
              form={{
                id: String(test._id),
                title: test.title ?? "",
                slug: test.slug ?? "",
                layout: sittingLayout(served, formSettings.submitLabel),
                settings: (test.settings ?? {}) as Record<string, unknown>,
                sitting: served.map(({ questionId, variantId }) => ({
                  questionId,
                  variantId,
                })),
              }}
            />
          </>
        )}
      </div>
    </SiteChrome>
  );
}

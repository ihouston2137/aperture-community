import { FormSubmission, TestAttempt } from "./models";

export const REVIEW_MESSAGE = "Results will be shared on your dashboard after it is graded.";

/** Include older best-result records only when no sitting history exists. */
export async function testResults(filter: { userId?: string; formId?: string } = {}) {
  const attempts = await TestAttempt.find(filter).sort({ createdAt: -1 }).lean<any[]>();
  const represented = await TestAttempt.distinct("sourceSubmissionId", filter);
  const legacy = await FormSubmission.find({ ...filter, grade: { $exists: true }, _id: { $nin: represented } }).lean<any[]>();
  return [...attempts, ...legacy.map(row => ({ ...row, gradingStatus: "graded", legacy: true }))]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}


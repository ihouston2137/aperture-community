/**
 * Constants shared by the schema layer and the code helpers.
 *
 * Kept apart from `lib/verification.ts` because that module talks to the
 * database, and `lib/models.ts` cannot import anything that imports it back.
 */

export const VERIFICATION_PURPOSES = ["email", "login", "password"] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

/** Wrong guesses allowed before a code is burned and a new one must be sent. */
export const MAX_CODE_ATTEMPTS = 5;

/** Seconds a caller must wait before another code is issued for the same flow. */
export const CODE_RESEND_SECONDS = 60;

export const TWO_FACTOR_MODES = ["off", "admins", "everyone"] as const;
export type TwoFactorMode = (typeof TWO_FACTOR_MODES)[number];

export const verificationCopy: Record<
  VerificationPurpose,
  { subject: string; heading: string; intro: string }
> = {
  email: {
    subject: "Confirm your email address",
    heading: "Confirm your email address",
    intro: "Enter this code to finish creating your account.",
  },
  login: {
    subject: "Your sign-in code",
    heading: "Your sign-in code",
    intro: "Enter this code to finish signing in.",
  },
  password: {
    subject: "Reset your password",
    heading: "Reset your password",
    intro: "Enter this code to choose a new password.",
  },
};

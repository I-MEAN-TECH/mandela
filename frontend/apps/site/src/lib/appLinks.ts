/**
 * The brand site and the product deploy separately (site on the root domain,
 * product on app.<tld> — PLATFORM-PLAN §4.1). Every link from site → product
 * goes through here so the boundary is one env var in production:
 *   NEXT_PUBLIC_APP_ORIGIN=https://app.mandela.school
 * Dev default points at the product dev server on :3000.
 */
export const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000";

export const appLinks = {
  register: `${APP_ORIGIN}/register`,
  registerSchool: `${APP_ORIGIN}/register?door=school`,
  login: `${APP_ORIGIN}/login`,
  loginGuardian: `${APP_ORIGIN}/login?kind=guardian`,
  dashboard: `${APP_ORIGIN}/app`,
  otpRequest: `${APP_ORIGIN}/api/auth/otp`,
} as const;

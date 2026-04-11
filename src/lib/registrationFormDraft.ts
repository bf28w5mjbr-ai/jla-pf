/** sessionStorage key for RegisterForm draft (same tab only; cleared when tab closes). */
export const REGISTRATION_FORM_DRAFT_KEY = "jla:registration-form-draft";

export function clearRegistrationFormDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(REGISTRATION_FORM_DRAFT_KEY);
  } catch {
    // ignore quota / private mode
  }
}

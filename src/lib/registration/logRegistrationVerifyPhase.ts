export function logRegistrationVerifyPhase(
  phase: string,
  requestId?: string,
  extra?: Record<string, unknown>
): void {
  console.info("[registration/verify]", {
    phase,
    ...(requestId ? { requestId } : {}),
    ...extra,
  });
}

/**
 * Message handler stub — U2
 *
 * Stub — completed by U5 + U6.
 * This module exposes a call counter so tests can assert the handler was invoked.
 */

let calls = 0;

export function getCalls(): number {
  return calls;
}

/** Test-only: reset in-module counter. Production code never calls this. */
export function __reset(): void {
  calls = 0;
}

export async function handleMessage(_message: unknown, _env: unknown): Promise<void> {
  calls++;
  // TODO(U5+U6): implement routing:
  //   - isOwner? → command dispatch
  //   - isWhitelisted? → forwardToOwner
  //   - isBlacklisted? → silent return
  //   - rules.hit? → pushSummary + silent
  //   - else → sendVerifyButton (first-time flow)
  return;
}

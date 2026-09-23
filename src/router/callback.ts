/**
 * Callback query handler stub — U2
 *
 * Stub — completed by U5 (verify callback flow).
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

export async function handleCallbackQuery(_query: unknown, _env: unknown): Promise<void> {
  calls++;
  // TODO(U5): implement verify:{chat_id} callback_data parsing,
  // whitelist write, and copyMessageToOwner forwarding.
  return;
}

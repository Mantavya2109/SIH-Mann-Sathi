import { useEffect, useState } from "react";

/**
 * Remembers where the user was (portal + tab) in sessionStorage, so a page
 * refresh during an active session returns them to the same screen,
 * while closing the browser/window clears the session and requires a fresh login.
 *
 * Only small, non-sensitive UI values are stored (which portal, which tab).
 * Every access is wrapped in try/catch: private mode or blocked storage just
 * means "nothing remembered", never a crash.
 */

const PREFIX = "mannsaathi.";

export const LAST_PAGE_KEYS = {
  session: "session", // which portal is open: "victim" | "counsellor"
  victimTab: "victim.tab",
  counsellorTab: "counsellor.tab",
} as const;

export function readLast(key: string): string | null {
  try {
    return window.sessionStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeLast(key: string, value: string | null) {
  try {
    if (value === null) {
      window.sessionStorage.removeItem(PREFIX + key);
    } else {
      window.sessionStorage.setItem(PREFIX + key, value);
    }
    // Clean up any legacy localStorage entry
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Forget everything (used on logout). */
export function clearLastPage() {
  Object.values(LAST_PAGE_KEYS).forEach((k) => {
    writeLast(k, null);
    try {
      window.localStorage.removeItem(PREFIX + k);
    } catch {
      /* ignore */
    }
  });
}

/**
 * useState that is restored from / saved to sessionStorage.
 * `allowed` guards against stale values (e.g. a tab that no longer exists).
 */
export function useRememberedState(key: string, fallback: string, allowed: readonly string[]) {
  const [value, setValue] = useState<string>(() => {
    const saved = readLast(key);
    return saved && allowed.includes(saved) ? saved : fallback;
  });
  useEffect(() => {
    writeLast(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

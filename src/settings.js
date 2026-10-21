// The player's settings (SPEC3 §3.2, §10.1): how the ship steers on a touch screen, ◀ ▶ buttons (the
// default) or the ship's wheel (Pause ▸ Steering). Stored as pirates-ahoy-settings: {"v":1,"steer":"buttons"}.
//
// Pure: imports nothing (the Node tests load it as a data: URL). Like every saved record, the settings are
// validated field by field and never throw: a missing, broken or tampered record gives the defaults, so with
// storage blocked the game steers with the buttons and a choice made in the pause menu lasts for the visit.
// Two tabs (§10.2): the storage listener simply takes the other tab's record, parseSettings(theirs).

/** The steering modes on touch layouts, the default first. */
export const STEER_MODES = Object.freeze(['buttons', 'wheel']);

const MAX_RAW = 1024; // §10.1: ≤ 1 KB (a real record is 25 characters)

// Read an own property; a non-object, a throwing getter or a hostile proxy just counts as missing.
function ownField(o, k) {
  try {
    return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
}
function isRecord(o) {
  try {
    return o !== null && typeof o === 'object' && !Array.isArray(o);
  } catch {
    return false; // a revoked proxy
  }
}

/** The defaults: steer with the ◀ ▶ buttons. A fresh object every call. */
export function defaultSettings() {
  return { v: 1, steer: STEER_MODES[0] };
}

function cleanSettings(obj) {
  const s = defaultSettings();
  if (!isRecord(obj)) return s;
  const steer = ownField(obj, 'steer');
  if (typeof steer === 'string' && STEER_MODES.includes(steer)) s.steer = steer;
  return s;
}

/**
 * Read a stored settings record (the string from storage, or null; a record object is validated the same way).
 * Never throws: ≤ 1 KB, JSON, `steer` exactly 'buttons' or 'wheel' (else 'buttons'), own properties only,
 * unknown fields dropped, "v" ignored (written back as 1); unreadable input gives the defaults.
 */
export function parseSettings(raw) {
  try {
    if (typeof raw === 'string') {
      if (raw.length > MAX_RAW) return defaultSettings();
      return cleanSettings(JSON.parse(raw)); // bad JSON -> catch -> the defaults
    }
    return cleanSettings(raw);
  } catch {
    return defaultSettings();
  }
}

/** JSON for storage, validated first: always {"v":1,"steer":"buttons"} or {"v":1,"steer":"wheel"}. */
export function serializeSettings(s) {
  const c = parseSettings(s);
  return JSON.stringify({ v: 1, steer: c.steer });
}

// The player's settings (SPEC3 §3.2, §10.1): how the ship steers on a touch screen, ◀ ▶ buttons (the
// default) or the ship's wheel. Stored as pirates-ahoy-settings.
//
// Pure: imports nothing (the Node tests load it as a data: URL).
//
// STAGE 0 SCAFFOLD: the final §11.1 API; parseSettings gives the defaults. Stage 1D writes the validation.

export const STEER_MODES = ['buttons', 'wheel'];

export function defaultSettings() {
  return { v: 1, steer: 'buttons' };
}

/** Read a stored settings record. Never throws. (Stage 0: the defaults.) */
export function parseSettings(raw) {
  return defaultSettings();
}

export function serializeSettings(s) {
  const steer = s && typeof s === 'object' && STEER_MODES.includes(s.steer) ? s.steer : 'buttons';
  return JSON.stringify({ v: 1, steer });
}

export const SESSIONS_KEY = "ngoding.play.sessions";
export const LEGACY_PLAY_SAVE_KEY = "vm:play";

export function playSaveKey(id) {
  return `vm:play:${id}`;
}

function isSession(v) {
  return (
    v &&
    typeof v === "object" &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.updatedAt === "number"
  );
}

function readRaw() {
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSession);
  } catch {
    return [];
  }
}

function writeRaw(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function sortSessions(sessions) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listSessions() {
  return sortSessions(readRaw());
}

export function getSession(id) {
  return readRaw().find((s) => s.id === id) ?? null;
}

export function createSession(now = Date.now()) {
  const existing = readRaw();
  const session = {
    id: crypto.randomUUID(),
    name: `Session ${existing.length + 1}`,
    createdAt: now,
    updatedAt: now,
  };
  writeRaw([...existing, session]);
  return session;
}

export function touchSession(id, now = Date.now()) {
  const existing = readRaw();
  const i = existing.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const updated = { ...existing[i], updatedAt: now };
  const next = [...existing];
  next[i] = updated;
  writeRaw(next);
  return updated;
}

export function removeSession(id) {
  const existing = readRaw();
  const next = existing.filter((s) => s.id !== id);
  if (next.length === existing.length) return false;
  writeRaw(next);
  return true;
}

export function migrateLegacyPlayMeta(hasLegacyBlob, now = Date.now()) {
  if (!hasLegacyBlob || readRaw().length > 0) return null;
  return createSession(now);
}

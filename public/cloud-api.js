async function parseJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** @returns {Promise<{ id: string, email: string } | null>} null on 401/503/error */
export async function authMe() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (res.status === 503) return null;
    if (!res.ok) return null;
    const body = await parseJson(res);
    return body?.user ?? null;
  } catch {
    return null;
  }
}

/** Probe whether account APIs are configured (not 503). */
export async function accountsAvailable() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    return res.status !== 503;
  } catch {
    return false;
  }
}

export async function authRequest(email) {
  const res = await fetch("/api/auth/request", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(body?.error || `auth request ${res.status}`);
  }
  return body;
}

export async function authLogout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
}

export async function listCloudSessions() {
  const res = await fetch("/api/play/sessions", { credentials: "same-origin" });
  if (!res.ok) return [];
  const body = await parseJson(res);
  return Array.isArray(body?.sessions) ? body.sessions : [];
}

export async function upsertPlaySession(session) {
  const res = await fetch(`/api/play/sessions/${encodeURIComponent(session.id)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: session.name,
      template: session.template,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      image: session.image,
    }),
  });
  return res.ok;
}

export async function deleteCloudSession(id) {
  const res = await fetch(`/api/play/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  return res.ok || res.status === 404;
}

export async function uploadSnapshot(id, blob, { image, savedAt } = {}) {
  const headers = { "content-type": "application/gzip" };
  if (image) headers["x-ngoding-image"] = image;
  if (savedAt != null) headers["x-ngoding-saved-at"] = String(savedAt);
  const res = await fetch(`/api/play/sessions/${encodeURIComponent(id)}/snapshot`, {
    method: "PUT",
    credentials: "same-origin",
    headers,
    body: blob,
  });
  if (!res.ok) {
    const body = await parseJson(res);
    throw new Error(body?.error || `upload ${res.status}`);
  }
  return parseJson(res);
}

export async function getExerciseProgress() {
  const res = await fetch("/api/exercise/progress", { credentials: "same-origin" });
  if (!res.ok) return null;
  const body = await parseJson(res);
  return Array.isArray(body?.solved) ? body.solved : [];
}

export async function putExerciseProgress(solved) {
  const res = await fetch("/api/exercise/progress", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ solved }),
  });
  return res.ok;
}

export async function createShare({ pack, sourceSessionId, name } = {}) {
  const res = await fetch("/api/shares", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pack,
      sourceSessionId,
      name,
    }),
  });
  const body = await parseJson(res);
  if (!res.ok) throw new Error(body?.error || `share ${res.status}`);
  return body;
}

export async function forkShare(id) {
  const res = await fetch(`/api/shares/${encodeURIComponent(id)}/fork`, { method: "POST" });
  const body = await parseJson(res);
  if (!res.ok) throw new Error(body?.error || `fork ${res.status}`);
  return body;
}

/** @returns {Promise<{ image: string, session: string, savedAt: number, blob: Blob } | null>} */
export async function downloadSnapshot(id) {
  const res = await fetch(`/api/play/sessions/${encodeURIComponent(id)}/snapshot`, {
    credentials: "same-origin",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const blob = await res.blob();
  const image = res.headers.get("x-ngoding-image") || "";
  const savedAt = Number(res.headers.get("x-ngoding-saved-at") || Date.now());
  return {
    image,
    session: `play:${id}`,
    savedAt,
    blob,
  };
}

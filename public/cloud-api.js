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

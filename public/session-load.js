import { playSaveKey } from "./play-sessions.js";

/**
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {(key: string) => Promise<any>} opts.localGet
 * @param {(id: string) => Promise<any>} opts.cloudGetSnapshot
 * @param {boolean} opts.signedIn
 */
export async function resolvePlaySnapshot({ sessionId, localGet, cloudGetSnapshot, signedIn }) {
  const local = await localGet(playSaveKey(sessionId));
  if (local?.blob) return { source: "local", record: local };
  if (signedIn) {
    const cloud = await cloudGetSnapshot(sessionId);
    if (cloud?.blob) return { source: "cloud", record: cloud };
  }
  return { source: "none" };
}

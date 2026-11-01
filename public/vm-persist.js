// Status text / pill class for VM snapshot persistence (IndexedDB save).

export function formatPersistStatus({ ready, phase, savedAt }) {
  if (phase === "dirty") return `${ready} · unsaved`;
  if (phase === "saving") return `${ready} · saving…`;
  if (phase === "error") return `${ready} · save failed`;
  if (phase === "saved" && savedAt != null) {
    const when = new Date(savedAt).toLocaleTimeString([], { timeStyle: "short" });
    return `${ready} · saved ${when}`;
  }
  return ready;
}

export function persistPillClass(phase) {
  if (phase === "error") return "error";
  if (phase === "dirty" || phase === "saving") return "unsaved";
  return "ready";
}

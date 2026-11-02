// VM status row: boot progress, readiness, and snapshot persistence (IndexedDB save).
//
// The row (see play.html / exercise.html) is
//   [dot] [state] [boot]  ...  [note]
// state: "restoring your work…" while booting, "ready" once the shell is up,
// "boot failed" on error. boot: "8.3s" or "restored". note: the save state
// ("saved 7:26 PM", "unsaved", …) or a short-lived notice like "share link copied".

const NOTICE_MS = 4000;

export function persistLabel({ phase, savedAt }) {
  if (phase === "dirty") return "unsaved";
  if (phase === "saving") return "saving…";
  if (phase === "error") return "save failed";
  if (phase === "saved" && savedAt != null) {
    return `saved ${new Date(savedAt).toLocaleTimeString([], { timeStyle: "short" })}`;
  }
  return "";
}

export function persistTone(phase) {
  if (phase === "error") return "error";
  if (phase === "dirty" || phase === "saving") return "unsaved";
  return "";
}

export function bootLabel({ restored, ms }) {
  return restored ? "restored" : `${(ms / 1000).toFixed(1)}s`;
}

export function createVmStatus(row) {
  const part = (name) => row.querySelector(`.vm-${name}`);
  const [state, boot, note] = ["state", "boot", "note"].map(part);
  let ready = false;
  let persist = { phase: "idle", savedAt: null };
  // While an action note or notice is showing, save-state updates wait.
  let held = false;
  let noticeTimer = 0;

  function setNote(text, tone = "") {
    note.textContent = text;
    note.className = `vm-note ${tone}`;
  }

  function showPersist() {
    if (ready && !held) setNote(persistLabel(persist), persistTone(persist.phase));
  }

  function clearNotice() {
    clearTimeout(noticeTimer);
    held = false;
  }

  function fail(text) {
    clearNotice();
    ready = false;
    row.dataset.state = "error";
    state.textContent = text;
    boot.textContent = "";
    setNote("");
  }

  return {
    /** Ongoing work: boot steps before ready, background actions after. */
    progress(text) {
      clearNotice();
      if (!ready) {
        row.dataset.state = "busy";
        state.textContent = text;
      } else {
        held = true;
        setNote(text, "busy");
      }
    },
    ready({ restored, ms }) {
      ready = true;
      row.dataset.state = "ready";
      state.textContent = "ready";
      boot.textContent = bootLabel({ restored, ms });
      showPersist();
    },
    persist(p) {
      persist = { phase: p.phase, savedAt: p.savedAt ?? persist.savedAt };
      showPersist();
    },
    /** A one-off result ("share link copied", "could not save session"). */
    notice(text, tone = "") {
      if (!ready) {
        if (tone === "error") fail(text);
        return;
      }
      clearNotice();
      held = true;
      setNote(text, tone);
      noticeTimer = setTimeout(() => {
        held = false;
        showPersist();
      }, NOTICE_MS);
    },
    fail,
  };
}

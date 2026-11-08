import {
  accountsAvailable,
  authLogout,
  authMe,
  authRequest,
  deleteCloudSession,
  getExerciseProgress,
  listCloudSessions,
  putExerciseProgress,
  upsertPlaySession,
} from "./cloud-api.js";
import { exerciseStats, pickExerciseProblem, unionSolved } from "./exercise-progress.js";
import { LANGUAGES, playgroundTemplate } from "./languages.js";
import {
  createSession,
  listSessions,
  playSaveKey,
  removeSession,
  touchSession,
  upsertLocalSession,
} from "./play-sessions.js";
import * as store from "./store.js";

let signedInUser = null;

async function pushLocalSessions() {
  if (!signedInUser) return;
  for (const s of listSessions()) {
    try {
      await upsertPlaySession(s);
    } catch (e) {
      console.error(e);
    }
  }
}

async function pullCloudSessions() {
  if (!signedInUser) return;
  const remote = await listCloudSessions();
  for (const r of remote) {
    const local = listSessions().find((s) => s.id === r.id);
    if (!local || (r.updatedAt ?? 0) >= (local.updatedAt ?? 0)) {
      upsertLocalSession({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        template: r.template ?? "blank",
      });
    }
  }
}

function $(id) {
  return document.getElementById(id);
}

function relativeTime(ms) {
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const then = new Date(ms);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()) - new Date(then.toDateString())) / 86_400_000);
  if (days === 0) return `${Math.round(min / 60)} h ago`;
  if (days === 1) return "yesterday";
  const opts = { month: "short", day: "numeric" };
  if (then.getFullYear() !== today.getFullYear()) opts.year = "numeric";
  return then.toLocaleDateString(undefined, opts);
}

function openSession(id) {
  touchSession(id);
  location.href = `/play?s=${encodeURIComponent(id)}`;
}

function span(className, text) {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

function renderSessions() {
  const sessions = listSessions();
  const list = $("session-list");
  const empty = $("session-empty");
  list.replaceChildren();
  empty.hidden = sessions.length > 0;
  for (const s of sessions) {
    const li = document.createElement("li");
    li.className = "session-row";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "session-open";
    open.append(
      span("session-name", s.name),
      span("session-file", playgroundTemplate(s.template).open ?? "—"),
      span("session-when", relativeTime(s.updatedAt)),
    );
    open.onclick = () => openSession(s.id);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "session-delete";
    del.textContent = "Delete";
    del.setAttribute("aria-label", `Delete ${s.name}`);
    del.onclick = async (e) => {
      e.stopPropagation();
      removeSession(s.id);
      await store.del(playSaveKey(s.id));
      if (signedInUser) {
        try {
          await deleteCloudSession(s.id);
        } catch (err) {
          console.error(err);
        }
      }
      renderSessions();
    };
    li.append(open, del);
    list.append(li);
  }
}

const TEMPLATE_DETAIL = {
  python: "main.py · hello boilerplate",
  c: "main.c · hello boilerplate",
  cpp: "main.cpp · hello boilerplate",
  go: "main.go · hello boilerplate",
  rust: "Cargo.toml · src/main.rs",
  haskell: "Main.hs · hello boilerplate",
  javascript: "package.json · main.js",
  typescript: "tsconfig.json · src/main.ts",
};

const dialog = $("session-template-dialog");
const form = $("session-template-form");
const langGrid = $("session-template-langs");
let selectedTemplate = "python";

function setSelected(id) {
  selectedTemplate = id;
  for (const card of dialog.querySelectorAll("[data-template]")) {
    const on = card.dataset.template === id;
    card.classList.toggle("is-selected", on);
    card.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

for (const lang of LANGUAGES) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "session-template-card";
  btn.dataset.template = lang.id;
  btn.innerHTML =
    `<span class="session-template-name">${lang.label}</span>` +
    `<span class="session-template-detail">${TEMPLATE_DETAIL[lang.id] ?? lang.ext}</span>`;
  langGrid.append(btn);
}

dialog.addEventListener("click", (e) => {
  const card = e.target.closest("[data-template]");
  if (card) setSelected(card.dataset.template);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const s = createSession(Date.now(), { template: selectedTemplate });
  if (signedInUser) {
    try {
      await upsertPlaySession(s);
    } catch (err) {
      console.error(err);
    }
  }
  location.href = `/play?s=${encodeURIComponent(s.id)}`;
});

$("session-template-cancel").onclick = () => dialog.close();

function openTemplateDialog() {
  setSelected("python");
  dialog.showModal();
}

$("new-session").onclick = openTemplateDialog;
$("open-editor").onclick = openTemplateDialog;

renderSessions();

// Where /auth/callback sends the browser back when a link can't be used.
const AUTH_ERRORS = {
  used: "That sign-in link was already used. Request a new one.",
  invalid: "That sign-in link is invalid or has expired. Request a new one.",
  missing: "That sign-in link is incomplete. Request a new one.",
  error: "Sign-in failed on the server. Try again.",
  unavailable: "Accounts are not available on this server.",
};

function takeAuthError() {
  const url = new URL(location.href);
  const code = url.searchParams.get("auth");
  if (!code) return null;
  url.searchParams.delete("auth");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  return AUTH_ERRORS[code] ?? AUTH_ERRORS.error;
}

function showAuthStatus(text, { link, error = false } = {}) {
  const el = $("auth-status");
  el.hidden = false;
  el.classList.toggle("is-error", error);
  el.textContent = text;
  if (link) {
    const a = document.createElement("a");
    a.href = link;
    a.textContent = "open the dev sign-in link";
    el.append(" — or ", a, ".");
  }
}

function setAuthPopover(open) {
  $("auth-popover").hidden = !open;
  $("auth-toggle").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) $("auth-email").focus();
}

/** Shows the right account controls; resolves to the signed-in user or null. */
async function initAccount() {
  const authError = takeAuthError();
  const account = $("account");
  if (!(await accountsAvailable())) {
    account.hidden = true;
    return null;
  }
  account.hidden = false;
  const user = await authMe();
  signedInUser = user;
  const toggle = $("auth-toggle");
  const popover = $("auth-popover");
  if (user) {
    toggle.hidden = true;
    $("auth-signed-in").hidden = false;
    $("auth-email-label").textContent = user.email;
    $("auth-logout").onclick = async () => {
      await authLogout();
      location.reload();
    };
    return user;
  }

  toggle.onclick = () => setAuthPopover(popover.hidden);
  document.addEventListener("click", (e) => {
    if (!popover.hidden && !account.contains(e.target)) setAuthPopover(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !popover.hidden) {
      setAuthPopover(false);
      toggle.focus();
    }
  });
  if (authError) {
    setAuthPopover(true);
    showAuthStatus(authError, { error: true });
  }

  const submit = $("auth-submit");
  $("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("auth-email").value.trim();
    submit.disabled = true;
    try {
      const body = await authRequest(email);
      showAuthStatus(`Check ${email} for a sign-in link`, { link: body?.devLink });
      if (!body?.devLink) $("auth-status").append(".");
    } catch (err) {
      console.error(err);
      showAuthStatus(err.message || "Could not send sign-in link", { error: true });
    } finally {
      submit.disabled = false;
    }
  };
  return null;
}

/** Merges this browser's sessions and solved list with the account's. */
async function syncAccount() {
  await pushLocalSessions();
  await pullCloudSessions();
  renderSessions();
  const local = JSON.parse(localStorage.getItem("ngoding.solved") ?? "[]");
  const remote = (await getExerciseProgress()) ?? [];
  const merged = unionSolved(local, remote);
  localStorage.setItem("ngoding.solved", JSON.stringify(merged));
  await putExerciseProgress(merged);
}

/** Fetches the problem list, resetting local progress if the server issued a new token. */
async function loadProblems() {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: localStorage.getItem("ngoding.token") }),
  });
  if (!res.ok) throw new Error(`session ${res.status}`);
  const { token, problems } = await res.json();
  if (token && token !== localStorage.getItem("ngoding.token")) {
    localStorage.setItem("ngoding.token", token);
    localStorage.removeItem("ngoding.solved");
  }
  return problems;
}

function firstSentence(html) {
  const text = new DOMParser().parseFromString(html, "text/html").body.textContent.replace(/\s+/g, " ").trim();
  const end = text.search(/[.!?](\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}

function renderExercises(problems) {
  const solved = JSON.parse(localStorage.getItem("ngoding.solved") ?? "[]");
  const { done, total } = exerciseStats(problems, solved);
  $("exercise-stats").textContent = `${done} of ${total} solved`;
  $("start-exercise-label").textContent = done > 0 ? "Continue" : "Start";
  const next = pickExerciseProblem(problems, solved);
  $("exercise-next").hidden = !next;
  if (!next) return;
  $("exercise-num").textContent = String(problems.indexOf(next) + 1).padStart(2, "0");
  $("exercise-title").textContent = next.title;
  $("exercise-blurb").textContent = firstSentence(next.description);
}

function renderExercisesUnavailable() {
  const cta = $("start-exercise");
  $("exercise-stats").textContent = "—";
  cta.setAttribute("aria-disabled", "true");
  cta.title = "Could not reach the server";
  cta.addEventListener("click", (ev) => ev.preventDefault());
}

// The token check may wipe local progress, so the account merge runs after it;
// otherwise a fresh token right after sign-in would discard the synced list.
const account = initAccount().catch((e) => {
  console.error(e);
  return null;
});
(async () => {
  let problems = null;
  try {
    problems = await loadProblems();
    renderExercises(problems);
  } catch (e) {
    console.error(e);
    renderExercisesUnavailable();
  }
  if (!(await account)) return;
  try {
    await syncAccount();
  } catch (e) {
    console.error(e);
  }
  if (problems) renderExercises(problems);
})();

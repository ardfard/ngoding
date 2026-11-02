import { accountsAvailable, authLogout, authMe, authRequest } from "./cloud-api.js";
import { exerciseStats } from "./exercise-progress.js";
import { LANGUAGES } from "./languages.js";
import { createSession, listSessions, playSaveKey, removeSession, touchSession } from "./play-sessions.js";
import * as store from "./store.js";

function $(id) {
  return document.getElementById(id);
}

function relativeTime(ms) {
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 36) return `${hr}h ago`;
  return new Date(ms).toLocaleDateString();
}

function openSession(id) {
  touchSession(id);
  location.href = `/play?s=${encodeURIComponent(id)}`;
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
    open.innerHTML = `<span class="session-name">${s.name}</span><span class="session-when">${relativeTime(s.updatedAt)}</span>`;
    open.onclick = () => openSession(s.id);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "session-delete";
    del.textContent = "Delete";
    del.onclick = async (e) => {
      e.stopPropagation();
      removeSession(s.id);
      await store.del(playSaveKey(s.id));
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

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const s = createSession(Date.now(), { template: selectedTemplate });
  location.href = `/play?s=${encodeURIComponent(s.id)}`;
});

$("session-template-cancel").onclick = () => dialog.close();

$("new-session").onclick = () => {
  setSelected("python");
  dialog.showModal();
};

renderSessions();

function showAuthStatus(html, { asHtml = false } = {}) {
  const el = $("auth-status");
  el.hidden = false;
  if (asHtml) el.innerHTML = html;
  else el.textContent = html;
}

async function initAccount() {
  const account = $("account");
  if (!(await accountsAvailable())) {
    account.hidden = true;
    return;
  }
  account.hidden = false;
  const form = $("auth-form");
  const signedIn = $("auth-signed-in");
  const user = await authMe();
  if (user) {
    form.hidden = true;
    signedIn.hidden = false;
    $("auth-email-label").textContent = user.email;
    $("auth-status").hidden = true;
  } else {
    form.hidden = false;
    signedIn.hidden = true;
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = $("auth-email").value.trim();
    try {
      const body = await authRequest(email);
      if (body.devLink) {
        showAuthStatus(
          `Check your email — or <a href="${body.devLink}">open the dev sign-in link</a>.`,
          { asHtml: true },
        );
      } else {
        showAuthStatus("Check your email for a sign-in link.");
      }
    } catch (err) {
      console.error(err);
      showAuthStatus(err.message || "Could not send sign-in link");
    }
  };
  $("auth-logout").onclick = async () => {
    await authLogout();
    location.reload();
  };
}

(async () => {
  initAccount().catch((e) => console.error(e));
  const statsEl = $("exercise-stats");
  const cta = $("start-exercise");
  try {
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
    const solved = JSON.parse(localStorage.getItem("ngoding.solved") ?? "[]");
    const { done, total } = exerciseStats(problems, solved);
    statsEl.textContent = `solved ${done}/${total}`;
    cta.textContent = done > 0 ? "Continue" : "Start";
  } catch (e) {
    console.error(e);
    statsEl.textContent = "—";
    cta.setAttribute("aria-disabled", "true");
    cta.title = "Could not reach the server";
    cta.addEventListener("click", (ev) => ev.preventDefault());
  }
})();

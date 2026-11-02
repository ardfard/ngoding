import { createSession } from "./play-sessions.js";

const shareId = location.pathname.split("/").filter(Boolean)[1] || "";
const status = document.getElementById("share-status");
const btn = document.getElementById("fork-btn");

async function probe() {
  if (!shareId) {
    status.textContent = "Missing share id.";
    return;
  }
  const res = await fetch(`/api/shares/${encodeURIComponent(shareId)}/fork`, { method: "POST" });
  if (!res.ok) {
    status.textContent = res.status === 404 ? "This share was not found or has expired." : "Could not load share.";
    return;
  }
  status.textContent = "Ready to copy these files into a new playground session.";
  btn.disabled = false;
  btn.onclick = () => {
    const session = createSession(Date.now(), { template: "blank" });
    location.href = `/play?s=${encodeURIComponent(session.id)}&fork=${encodeURIComponent(shareId)}`;
  };
}

probe().catch((e) => {
  console.error(e);
  status.textContent = "Could not reach the server.";
});

// Pick the VM: v86 by default, CheerpX with /?vm=cheerpx (for comparison).
import { startApp } from "./ui.js";

const which = new URLSearchParams(location.search).get("vm") === "cheerpx" ? "cheerpx" : "v86";
for (const a of document.querySelectorAll("#switch a")) {
  a.setAttribute("aria-current", a.dataset.vm === which);
}
startApp(await import(which === "cheerpx" ? "./vm-cheerpx.js" : "./vm.js"));

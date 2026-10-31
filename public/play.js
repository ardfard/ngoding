import { startPlay } from "./play-ui.js";
import * as vm from "./vm.js";

startPlay(vm).catch((e) => {
  console.error(e);
  document.getElementById("status").textContent = "could not reach the server";
  document.getElementById("status").className = "status error";
});

import { startApp } from "./ui.js";
import * as vm from "./vm.js";

startApp(vm).catch((e) => {
  console.error(e);
  document.getElementById("status").textContent = "could not reach the server";
  document.getElementById("status").className = "status error";
});

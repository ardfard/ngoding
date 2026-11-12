import { startLearn } from "./learn-ui.js";
import * as vm from "./vm.js";

startLearn(vm).catch((e) => {
  console.error(e);
  document.querySelector("#status .vm-state").textContent = "could not start";
});

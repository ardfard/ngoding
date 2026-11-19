// The app runs twice from the same files: on v86 at "/" and on unkernel under
// "/新" (the server swaps vm.js there). Links and per-app local state go
// through these helpers so each copy stays in its own tree.
export const UNK_PREFIX = "/新";

/** "/新" when the page is part of the unkernel app, else "". */
export function basePath(pathname = globalThis.location?.pathname ?? "/") {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {}
  return path === UNK_PREFIX || path.startsWith(`${UNK_PREFIX}/`) ? UNK_PREFIX : "";
}

export const IS_UNKERNEL = basePath() !== "";

/** An app path ("/play?s=…") in the current copy of the app. */
export const appHref = (path) => basePath() + path;

export const homeHref = () => appHref("/");

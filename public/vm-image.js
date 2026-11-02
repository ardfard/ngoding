/**
 * Decide which v86 state image to boot.
 * @param {{ saved: { image: string, session: string } | null, currentImage: string, session?: string, imageExists: (name: string) => boolean }} opts
 * @returns {{ kind: "fresh"|"restore"|"missing-image", image: string }}
 */
export function chooseBootImage({ saved, currentImage, session, imageExists }) {
  if (!saved) return { kind: "fresh", image: currentImage };
  if (session != null && saved.session !== session) {
    return { kind: "fresh", image: currentImage };
  }
  if (saved.image === currentImage || imageExists(saved.image)) {
    return { kind: "restore", image: saved.image };
  }
  return { kind: "missing-image", image: currentImage };
}

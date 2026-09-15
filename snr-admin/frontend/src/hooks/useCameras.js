import { CAMERAS } from "../data/cameras.js";

export function useCameras() {
  return { cameras: CAMERAS, loading: false };
}

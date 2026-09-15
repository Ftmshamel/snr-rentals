import { ADDONS } from "../data/addons.js";

export function useAddOns() {
  return { addons: ADDONS, loading: false };
}

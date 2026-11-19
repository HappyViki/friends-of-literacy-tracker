import { createContext, useContext } from "react";
import type { Language, Location, Me } from "./types";

export type AppCtx = {
  me: Me;
  location: Location;
  locations: Location[];
  languages: Language[];
  changeLocation: () => void;
  reloadLocations: () => void;
};

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside the signed-in app");
  return ctx;
}

const KEY = "fol.locationId";
export function savedLocationId(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
export function saveLocationId(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(id));
  } catch {
    /* private mode: the picker shows again next time */
  }
}

export const languageName = (languages: Language[], code: string | null) =>
  code ? (languages.find((l) => l.code === code)?.name ?? code) : null;

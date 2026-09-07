import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_BOARD_ID,
  DEFAULT_B_FACTION,
  DEFAULT_SET_ID,
  DEFAULT_W_FACTION,
  getSet,
  otherFaction,
  pairingOf,
} from "./catalog";

export interface Prefs {
  setId: string;
  wFaction: string;
  bFaction: string;
  boardId: string;
  tilt: number;
  sound: boolean;
  haptic: boolean;
  autoFlip: boolean;
  setSetId: (setId: string) => void;
  setWFaction: (id: string) => void;
  setBFaction: (id: string) => void;
  setBoardId: (boardId: string) => void;
  setTilt: (tilt: number) => void;
  setSound: (sound: boolean) => void;
  setHaptic: (haptic: boolean) => void;
  setAutoFlip: (autoFlip: boolean) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set, get) => ({
      setId: DEFAULT_SET_ID,
      wFaction: DEFAULT_W_FACTION,
      bFaction: DEFAULT_B_FACTION,
      boardId: DEFAULT_BOARD_ID,
      tilt: 0,
      sound: true,
      haptic: true,
      autoFlip: false,
      setSetId: (setId) => {
        const s = getSet(setId);
        set({ setId, wFaction: s.w, bFaction: s.b });
      },
      setWFaction: (id) => {
        const b = get().bFaction === id ? otherFaction(id) : get().bFaction;
        set({ wFaction: id, bFaction: b, setId: pairingOf(id, b)?.id ?? get().setId });
      },
      setBFaction: (id) => {
        if (id === get().wFaction) return;
        const w = get().wFaction;
        set({ bFaction: id, setId: pairingOf(w, id)?.id ?? get().setId });
      },
      setBoardId: (boardId) => set({ boardId }),
      setTilt: (tilt) => set({ tilt }),
      setSound: (sound) => set({ sound }),
      setHaptic: (haptic) => set({ haptic }),
      setAutoFlip: (autoFlip) => set({ autoFlip }),
    }),
    { name: "sanctum-prefs-v6" },
  ),
);

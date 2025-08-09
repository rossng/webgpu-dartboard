import { atom } from "jotai";

export interface TargetPosition {
  x: number;
  y: number;
}

// Shared target position atom - coordinates are in normalized canvas space (-1 to 1)
// Each component will convert to their own pixel coordinates based on canvas size
export const targetPositionAtom = atom<TargetPosition>({ x: 0, y: 0 });
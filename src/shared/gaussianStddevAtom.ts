import { atom } from "jotai";
import { mmToPixels, pixelsToMm } from "../dartboard/dartboard-definition";

const DEFAULT_STDDEV_MM = 50;

export const gaussianStddevMmAtom = atom<number>(DEFAULT_STDDEV_MM);

export const gaussianStddevPixelsAtom = atom(
  (get) => {
    const mm = get(gaussianStddevMmAtom);
    return (canvasWidth: number) => mmToPixels(mm, canvasWidth);
  },
  (get, set, update: { mm: number }) => {
    set(gaussianStddevMmAtom, update.mm);
  }
);

export const getGaussianStddevPixels = (mm: number, canvasWidth: number): number => {
  return mmToPixels(mm, canvasWidth);
};

export const getGaussianStddevMm = (pixels: number, canvasWidth: number): number => {
  return pixelsToMm(pixels, canvasWidth);
};
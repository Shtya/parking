/** Motion language — the only easing/duration values used in the app. Mirrors the CSS tokens in globals.css. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const; // reveals
export const EASE_INOUT = [0.76, 0, 0.24, 1] as const; // transitions between places (floors, pages)
export const SPRING = { type: 'spring', stiffness: 170, damping: 22, mass: 1 } as const; // direct manipulation

export const D = {
  micro: 0.18,
  std: 0.45,
  cine: 1.2,
  stagger: 0.06,
} as const;

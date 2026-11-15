import clsx, { type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge aware of our custom tokens, so a caller className (e.g. w-40) always beats the base (w-full)
const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ['stencil', 'display'] },
    classGroups: {
      shadow: [{ shadow: ['e1', 'e2', 'e3', 'e4'] }],
      rounded: [{ rounded: ['input', 'panel', 'sheet'] }],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

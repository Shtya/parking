'use client';

import { motion } from 'motion/react';
import { EASE_OUT, D } from '@/lib/motion';

/** Route transition: content settles in quickly (no exit wait — never slows navigation). */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: D.std, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}

'use client';

import { motion } from 'motion/react';
import { revealUp, inView } from '@/lib/motion';

/**
 * غلاف الظهور عند التمرير.
 * يُستعمل حيثما احتجنا ظهوراً تدريجياً دون تكرار نفس الخصائص.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={revealUp}
      {...inView}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

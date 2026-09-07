import type { Variants, Transition } from 'motion/react';
import { easing, duration } from './design-tokens';

/**
 * تعريفات الحركة المشتركة
 * ---------------------------------------------------------------
 * كل حركة في الموقع تنبع من هنا، حتى يبقى الإيقاع واحداً. القيم
 * نفسها المعرّفة في design-tokens — لا أرقام سحرية متناثرة.
 */

export const luxe: Transition = {
  duration: duration.medium,
  ease: [...easing.luxe] as [number, number, number, number],
};

export const luxeSlow: Transition = {
  duration: duration.slow,
  ease: [...easing.luxe] as [number, number, number, number],
};

/** ظهور تدريجي من الأسفل مع ميلان خفيف — الحركة الأساسية عند التمرير */
export const revealUp: Variants = {
  hidden: { opacity: 0, y: 40, rotateX: 8 },
  show: { opacity: 1, y: 0, rotateX: 0, transition: luxe },
};

/** ظهور من اليمين — يحترم اتجاه القراءة العربية */
export const revealFromStart: Variants = {
  hidden: { opacity: 0, x: 30 },
  show: { opacity: 1, x: 0, transition: luxe },
};

/** حاوية تُظهر أبناءها تباعاً */
export function stagger(delayChildren = 0, staggerChildren = 0.08): Variants {
  return {
    hidden: {},
    show: { transition: { delayChildren, staggerChildren } },
  };
}

/** إعدادات الظهور عند التمرير — تُشغَّل مرة واحدة عند دخول العنصر فعلاً */
export const inView = {
  initial: 'hidden',
  whileInView: 'show',
  viewport: { once: true, amount: 0.25 },
} as const;

/** ظهور حرفاً حرفاً — لشاشة الافتتاح والعناوين الكبيرة */
export const letterReveal: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: luxe },
};

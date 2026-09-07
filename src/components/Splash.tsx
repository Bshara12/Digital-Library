'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { letterReveal, stagger } from '@/lib/motion';

/**
 * شاشة الافتتاح
 * ---------------------------------------------------------------
 * تظهر مرّة واحدة لكل جلسة فقط. الـ Splash الذي يتكرّر في كل زيارة
 * يتحوّل من فخامة إلى عبء، لذا نحفظ العلامة في sessionStorage.
 *
 * لا تُعرض أصلاً لمن فعّل «تقليل الحركة».
 */

const SEEN_KEY = 'esam-splash-seen';
const NAME = 'عصام السالم';

export function Splash() {
  const reduceMotion = useReducedMotion();
  // نبدأ مخفيّين: التقديم على الخادم لا يعرف بحالة الجلسة، وإظهار
  // الشاشة ثم إخفاؤها فوراً يُحدث ومضة مزعجة.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    let seen = true;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // متصفّح يمنع التخزين — نتخطّى الشاشة بدل أن نُظهرها كل مرّة
    }
    if (seen) return;

    setVisible(true);
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      setVisible(false);
      document.body.style.overflow = '';
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* لا شيء نفعله */
      }
    }, 2200);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = '';
    };
  }, [reduceMotion]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink-950"
          // الستارة تنزلق للأعلى كاشفةً الصفحة خلفها
          exit={{ y: '-100%', transition: { duration: 0.8, ease: [0.65, 0, 0.35, 1] } }}
          aria-hidden
        >
          {/* الخط الذهبي يتمدّد من المنتصف */}
          <motion.div
            className="rule-gold w-full max-w-md"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* الاسم حرفاً حرفاً */}
          <motion.h1
            className="my-8 font-display text-4xl text-gold-300 sm:text-6xl"
            variants={stagger(0.5, 0.04)}
            initial="hidden"
            animate="show"
          >
            {NAME.split('').map((char, i) => (
              <motion.span key={i} variants={letterReveal} className="inline-block">
                {char === ' ' ? ' ' : char}
              </motion.span>
            ))}
          </motion.h1>

          <motion.p
            className="font-ui text-[0.7rem] tracking-[0.45em] text-ivory-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
          >
            مكتبة الأعمال الكاملة
          </motion.p>

          {/* فاصلة زخرفية: ثلاث نقاط ذهبية تتفتّح من المنتصف */}
          <motion.span
            className="mt-8 flex items-center gap-2.5 text-gold-500"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.6, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="block h-[3px] w-[3px] rounded-full bg-gold-500/70" />
            <span className="block h-1.5 w-1.5 rounded-full bg-gold-500" />
            <span className="block h-[3px] w-[3px] rounded-full bg-gold-500/70" />
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

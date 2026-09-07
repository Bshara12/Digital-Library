'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import { luxe } from '@/lib/motion';

/* ---------------------------------------------------------------
   زخرفة الخلفية — تُحسب مرّة واحدة عند تحميل الوحدة
   ---------------------------------------------------------------
   حلقة مُشرَّشة وشريط لؤلؤي: مفردات تجليد الكتب والتذهيب، تعطي
   إحساس نقش دقيق دون أي شكل رمزي.
*/
const CENTER = 100;

/** نقاط موزّعة على محيط دائرة */
function ring(radius: number, count: number, offset = 0): Array<[number, number]> {
  return Array.from({ length: count }, (_, i) => {
    const angle = ((i + offset) / count) * Math.PI * 2 - Math.PI / 2;
    return [
      +(CENTER + radius * Math.cos(angle)).toFixed(2),
      +(CENTER + radius * Math.sin(angle)).toFixed(2),
    ] as [number, number];
  });
}

/** حلقة من أقواس متتابعة تنتفخ نحو الخارج */
const SCALLOP_RING = (() => {
  const N = 32;
  const knots = ring(54, N);
  const controls = ring(58.5, N, 0.5);
  const [x0, y0] = knots[0];
  let d = `M ${x0} ${y0}`;
  for (let i = 0; i < N; i++) {
    const [cx, cy] = controls[i];
    const [x, y] = knots[(i + 1) % N];
    d += ` Q ${cx} ${cy} ${x} ${y}`;
  }
  return `${d} Z`;
})();

const PEARLS = ring(64, 72);

interface Props {
  stats: { bookCount: number; pageCount: number; wordCount: number; readingHours: number };
}

/**
 * المشهد الافتتاحي
 * ---------------------------------------------------------------
 * ثلاث طبقات تتحرّك بسرعات مختلفة مع التمرير (parallax) فتعطي عمقاً
 * حقيقياً: هالة ذهبية بعيدة، خطوط هندسية وسطى، والمحتوى في المقدّمة.
 */
export function Hero({ stats }: Props) {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  // كلّما بعُدت الطبقة قلّت سرعتها
  const haloY = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const linesY = useTransform(scrollYProgress, [0, 1], ['0%', '45%']);
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '75%']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  const still = reduceMotion ? undefined : true;

  return (
    <section
      ref={ref}
      className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-6"
    >
      {/* الطبقة البعيدة: هالة ذهبية ضبابية */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          y: still && haloY,
          backgroundImage:
            'radial-gradient(45% 38% at 50% 42%, rgba(201,162,39,0.20) 0%, transparent 72%)',
        }}
      />

      {/* الطبقة الوسطى: خطوط هندسية رفيعة */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.13]"
        style={{ y: still && linesY }}
      >
        <svg
          viewBox="0 0 200 200"
          className="h-[130vmin] w-[130vmin] text-gold-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.25"
        >
          {/* حلقات متراكزة رفيعة — معجم تجليد الكتب الفخم */}
          <circle cx="100" cy="100" r="92" />
          <circle cx="100" cy="100" r="88" strokeDasharray="0.6 4" />
          <circle cx="100" cy="100" r="70" />
          {/* حلقة مُشرَّشة (زخرفة نافذة) */}
          <path d={SCALLOP_RING} strokeWidth="0.3" />
          {/* شريط لؤلؤي */}
          <g fill="currentColor" stroke="none" opacity="0.85">
            {PEARLS.map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="0.55" />
            ))}
          </g>
          <circle cx="100" cy="100" r="40" strokeDasharray="0.6 4" />
        </svg>
      </motion.div>

      {/* المقدّمة: المحتوى */}
      <motion.div
        className="relative z-10 flex flex-col items-center text-center"
        style={{ y: still && contentY, opacity: still && contentOpacity }}
      >
        <motion.p
          className="font-ui text-[0.65rem] tracking-[0.45em] text-ivory-dim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...luxe, delay: 0.1 }}
        >
          مكتبة رقمية
        </motion.p>

        <motion.h1
          className="mt-6 font-display leading-[1.15]"
          style={{ fontSize: 'clamp(2.5rem, 8vw, 6rem)' }}
          initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ ...luxe, delay: 0.25, duration: 1 }}
        >
          <span className="shimmer">مكتبة عصام السالم</span>
        </motion.h1>

        <motion.p
          className="mt-7 max-w-xl font-body text-base leading-loose text-ivory/80 sm:text-lg"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...luxe, delay: 0.5 }}
        >
          {stats.bookCount} أعمال في التاريخ والأديان والاجتماع — تُقرأ كاملة هنا، أو تُنزَّل بصيغة PDF.
        </motion.p>

        <motion.div
          className="mt-11 flex flex-wrap items-center justify-center gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...luxe, delay: 0.68 }}
        >
          <Link
            href="/library"
            className="group relative overflow-hidden rounded-sm px-9 py-3.5 font-body text-sm text-ink-950 transition-transform duration-200 hover:scale-[1.03]"
            style={{ backgroundImage: 'var(--grad-gold-surface)' }}
          >
            تصفّح المكتبة
          </Link>
          <Link
            href="/search"
            className="rounded-sm border border-gold-500/45 px-9 py-3.5 font-body text-sm text-gold-300 transition-colors duration-200 hover:border-gold-500 hover:bg-gold-500/8"
          >
            ابحث في المتن
          </Link>
          <Link
            href="/author"
            className="rounded-sm border border-gold-500/45 px-9 py-3.5 font-body text-sm text-gold-300 transition-colors duration-200 hover:border-gold-500 hover:bg-gold-500/8"
          >
            عن الكاتب
          </Link>
        </motion.div>

        {/* أرقام المكتبة */}
        <motion.dl
          className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...luxe, delay: 0.9 }}
        >
          {[
            ['كتاب', stats.bookCount],
            ['صفحة', stats.pageCount.toLocaleString('en-US')],
            ['كلمة', stats.wordCount.toLocaleString('en-US')],
            ['ساعة قراءة', stats.readingHours],
          ].map(([label, value]) => (
            <div key={label as string} className="text-center">
              <dd className="font-latin text-3xl text-gold-300">{value}</dd>
              <dt className="mt-1 font-ui text-[0.6rem] tracking-[0.25em] text-ivory-dim">
                {label}
              </dt>
            </div>
          ))}
        </motion.dl>
      </motion.div>

      {/* مؤشّر التمرير */}
      <motion.div
        aria-hidden
        className="absolute bottom-8 left-1/2 z-10 h-12 w-px -translate-x-1/2 overflow-hidden bg-ink-700"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3, duration: 0.8 }}
      >
        <motion.span
          className="block h-4 w-px bg-gold-500"
          animate={{ y: [-16, 48] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </section>
  );
}

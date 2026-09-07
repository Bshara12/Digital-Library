'use client';

import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';
import { BookCover, type CoverData } from './BookCover';

/**
 * الكتاب ثلاثي الأبعاد
 * ---------------------------------------------------------------
 * جسم حقيقي في الفضاء لا صورة مسطّحة: وجه أمامي، كعب بسماكة، وظلّ
 * وانعكاس تحته. يميل نحو المؤشّر، وتنزلق عليه لمعة تتبع موضعه —
 * وهذه اللمعة تحديداً هي ما يعطي الإحساس بسطح مصقول حقيقي.
 *
 * على الجوال لا يوجد تحويم، فيبقى الكتاب بميلانه الساكن الأنيق
 * ويتكفّل اللمس بالتنقّل.
 */

const MAX_TILT = 12; // درجة
const LIFT = 40; // px على محور Z

interface Props {
  book: CoverData;
  /** ميلان ساكن حين لا يوجد تفاعل — يعطي عمقاً حتى في السكون */
  restTilt?: number;
  className?: string;
}

export function Book3D({ book, restTilt = -14, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion();

  // موضع المؤشّر داخل البطاقة، من -0.5 إلى 0.5
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const spring = { stiffness: 220, damping: 26, mass: 0.6 };
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-MAX_TILT, MAX_TILT]), spring);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [MAX_TILT, -MAX_TILT]), spring);

  // اللمعة تتبع الماوس أفقياً
  const shineX = useTransform(px, [-0.5, 0.5], ['135%', '-35%']);

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    if (reduceMotion || event.pointerType !== 'mouse') return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function handleLeave() {
    setHovered(false);
    px.set(0);
    py.set(0);
  }

  const spine = 'var(--book-spine, 22px)';

  return (
    <div
      ref={ref}
      className={`card-3d ${className}`}
      onPointerMove={handleMove}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={handleLeave}
    >
      <motion.div
        className="preserve-3d relative"
        style={{
          rotateY: reduceMotion ? 0 : rotateY,
          rotateX: reduceMotion ? 0 : rotateX,
          transformStyle: 'preserve-3d',
        }}
        initial={false}
        animate={{
          // الميلان الساكن يتلاشى عند التحويم ليأخذ المؤشّر مكانه
          rotate: 0,
          y: hovered && !reduceMotion ? -10 : 0,
          scale: hovered && !reduceMotion ? 1.04 : 1,
        }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="preserve-3d relative"
          animate={{ rotateY: hovered && !reduceMotion ? 0 : restTilt }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* كعب الكتاب — يقع خلف الوجه ومُزاح لليمين (كتاب عربي) */}
          <div
            className="absolute inset-y-0 right-0 origin-right"
            style={{
              width: spine,
              transform: `rotateY(90deg) translateZ(calc(${spine} / -2))`,
              backgroundImage: `linear-gradient(to left, ${book.accent}, rgba(0,0,0,0.75))`,
              borderRadius: '2px',
            }}
          >
            <span
              className="absolute inset-0 flex items-center justify-center whitespace-nowrap font-display text-[10px] text-gold-500/80"
              style={{ writingMode: 'vertical-rl' }}
            >
              {book.title}
            </span>
          </div>

          {/* الوجه الأمامي */}
          <div
            className="relative"
            style={{
              transform: `translateZ(${hovered && !reduceMotion ? LIFT : 0}px)`,
              transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: hovered
                ? '0 40px 70px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(201,162,39,0.18)'
                : '0 22px 40px -18px rgba(0,0,0,0.75)',
            }}
          >
            <BookCover book={book} />

            {/* لمعة براقة تتبع المؤشّر */}
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-[2px]"
              style={{
                opacity: hovered && !reduceMotion ? 1 : 0,
                transition: 'opacity 0.35s ease',
                backgroundImage:
                  'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.16) 50%, transparent 62%)',
                backgroundSize: '260% 100%',
                backgroundPositionX: reduceMotion ? '50%' : shineX,
              }}
            />
          </div>
        </motion.div>

        {/* انعكاس مرآوي متلاشٍ */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full h-1/3 overflow-hidden opacity-25"
          style={{
            transform: 'rotateX(180deg) translateZ(-1px)',
            maskImage: 'linear-gradient(to top, transparent 5%, black 95%)',
            WebkitMaskImage: 'linear-gradient(to top, transparent 5%, black 95%)',
          }}
        >
          <div className="h-[300%]">
            <BookCover book={book} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

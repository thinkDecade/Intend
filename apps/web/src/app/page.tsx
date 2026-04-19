'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

const ease = [0.16, 1, 0.3, 1] as const;
const easeTuple = ease as unknown as [number, number, number, number];

const fade = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, delay: i * 0.08, ease: easeTuple },
  }),
};
const stagger = { visible: { transition: { staggerChildren: 0.09 } } };

/* ── Features ── */
const features = [
  {
    n: '01',
    kicker: 'Store & Manage',
    title: ['One place.', 'Everything you own.'],
    body: 'Every account, every asset, in one living view — explained in plain language.',
    chips: ['Fiat', 'Stablecoins', 'Tokens'],
    theme: 'cream',
  },
  {
    n: '02',
    kicker: 'Send & Spend',
    title: ['Move money anywhere.', 'Instantly.'],
    body: 'The fastest, cheapest path for every transfer — you just say where it goes.',
    chips: ['Borderless', 'Sub-second', 'Pennies'],
    theme: 'ink',
  },
  {
    n: '03',
    kicker: 'Convert',
    title: ['Every asset onchain.', 'Within reach.'],
    body: 'Smart routing across every source so you can move into any position, instantly.',
    chips: ['Best rate', 'One step', 'No friction'],
    theme: 'gold',
  },
  {
    n: '04',
    kicker: 'Allocate',
    title: ['Your capital,', 'always positioned to win.'],
    body: 'A private wealth manager, watching the world and your goals — continuously.',
    chips: ['Always-on', 'Goal-aware', 'Wealth-grade'],
    theme: 'ember',
  },
] as const;

/* ── Visual artifacts per feature ── */
function FeatureVisual({ theme }: { theme: 'cream' | 'ink' | 'gold' | 'ember' }) {
  if (theme === 'cream') {
    return (
      <div className="lpr-vis lpr-vis-stack" aria-hidden="true">
        <motion.div
          className="lpr-card lpr-card-3"
          initial={{ opacity: 0, y: 24, rotate: -2 }}
          whileInView={{ opacity: 1, y: 0, rotate: -6 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.9, delay: 0.45, ease }}
        >
          <div className="lpr-card-row">
            <span className="lpr-card-tag">EUR</span>
            <span className="lpr-card-amt">€2,840.50</span>
          </div>
          <div className="lpr-card-row lpr-card-row-foot">
            <span className="lpr-card-mini">Euro savings</span>
            <span className="lpr-card-delta lpr-card-delta-up">+ 0.42%</span>
          </div>
        </motion.div>

        <motion.div
          className="lpr-card lpr-card-2"
          initial={{ opacity: 0, y: 24, rotate: 4 }}
          whileInView={{ opacity: 1, y: 0, rotate: 4 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.9, delay: 0.3, ease }}
        >
          <div className="lpr-card-row">
            <span className="lpr-card-tag">NGN</span>
            <span className="lpr-card-amt">₦4,612,200</span>
          </div>
          <div className="lpr-card-row lpr-card-row-foot">
            <span className="lpr-card-mini">Naira account</span>
            <span className="lpr-card-delta lpr-card-delta-down">- 1.8%</span>
          </div>
        </motion.div>

        <motion.div
          className="lpr-card lpr-card-1"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.95, delay: 0.15, ease }}
        >
          <div className="lpr-card-meta">Total balance · USD</div>
          <div className="lpr-card-total">$12,480.<span>92</span></div>
          <svg viewBox="0 0 220 50" className="lpr-card-spark" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lpr-spark-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#D4A24A" stopOpacity="0.32"/>
                <stop offset="100%" stopColor="#D4A24A" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path
              d="M 0 36 L 22 30 L 44 32 L 66 22 L 88 26 L 110 18 L 132 22 L 154 12 L 176 16 L 198 8 L 220 10 L 220 50 L 0 50 Z"
              fill="url(#lpr-spark-fill)"
            />
            <path
              d="M 0 36 L 22 30 L 44 32 L 66 22 L 88 26 L 110 18 L 132 22 L 154 12 L 176 16 L 198 8 L 220 10"
              fill="none" stroke="#D4A24A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <div className="lpr-card-row lpr-card-row-foot">
            <span className="lpr-card-tag">7d</span>
            <span className="lpr-card-delta lpr-card-delta-up">+ $214.80 today</span>
          </div>
        </motion.div>

        <motion.div
          className="lpr-card-pill"
          initial={{ opacity: 0, scale: 0.85 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, delay: 0.7, ease }}
        >
          <span className="lpr-card-pill-dot"/>
          <span>Live · auto-refreshed</span>
        </motion.div>
      </div>
    );
  }
  if (theme === 'ink') {
    return (
      <div className="lpr-vis lpr-vis-arc" aria-hidden="true">
        <svg viewBox="0 0 520 520" className="lpr-arc-svg">
          <defs>
            <radialGradient id="lpr-arc-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#D4A24A" stopOpacity="0.55"/>
              <stop offset="60%" stopColor="#D4A24A" stopOpacity="0.08"/>
              <stop offset="100%" stopColor="#D4A24A" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="lpr-arc-line" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#F0DBA8"/>
              <stop offset="50%" stopColor="#D4A24A"/>
              <stop offset="100%" stopColor="#F0DBA8"/>
            </linearGradient>
            <path id="lpr-arc-path" d="M 80 340 Q 260 60 440 340"/>
          </defs>
          <circle cx="260" cy="260" r="240" fill="url(#lpr-arc-glow)"/>
          <circle cx="260" cy="260" r="220" fill="none" stroke="rgba(245,240,230,0.05)" strokeWidth="1" strokeDasharray="2 6"/>
          <circle cx="260" cy="260" r="170" fill="none" stroke="rgba(245,240,230,0.08)" strokeWidth="1"/>
          <circle cx="260" cy="260" r="120" fill="none" stroke="rgba(245,240,230,0.10)" strokeWidth="1"/>
          <circle cx="260" cy="260" r="70"  fill="none" stroke="rgba(245,240,230,0.14)" strokeWidth="1"/>

          <use href="#lpr-arc-path" fill="none" stroke="rgba(245,240,230,0.10)" strokeWidth="1" strokeDasharray="4 6"/>
          <use href="#lpr-arc-path" fill="none" stroke="url(#lpr-arc-line)" strokeWidth="2.5" strokeLinecap="round"/>

          <circle cx="80"  cy="340" r="9" fill="#F0DBA8"/>
          <circle cx="80"  cy="340" r="16" fill="none" stroke="#F0DBA8" strokeOpacity="0.4">
            <animate attributeName="r" values="9;22;9" dur="2.4s" repeatCount="indefinite"/>
            <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite"/>
          </circle>
          <circle cx="440" cy="340" r="9" fill="#F0DBA8"/>
          <circle cx="440" cy="340" r="16" fill="none" stroke="#F0DBA8" strokeOpacity="0.4">
            <animate attributeName="r" values="9;22;9" dur="2.4s" begin="1.2s" repeatCount="indefinite"/>
            <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2.4s" begin="1.2s" repeatCount="indefinite"/>
          </circle>

          {/* Traveling packet */}
          <circle r="5" fill="#F0DBA8">
            <animateMotion dur="2.6s" repeatCount="indefinite">
              <mpath href="#lpr-arc-path"/>
            </animateMotion>
          </circle>
        </svg>
        <div className="lpr-arc-tag lpr-arc-tag-a">London → Lagos</div>
        <div className="lpr-arc-tag lpr-arc-tag-b">
          <span className="lpr-arc-tag-row"><b>2.3s</b> · est. arrival</span>
          <span className="lpr-arc-tag-row"><b>$0.04</b> · network fee</span>
          <span className="lpr-arc-tag-row"><b>1 GBP = 2,038 NGN</b></span>
        </div>
      </div>
    );
  }
  if (theme === 'gold') {
    return (
      <div className="lpr-vis lpr-vis-orbit" aria-hidden="true">
        <div className="lpr-orbit-core">
          <svg viewBox="0 0 40 40" width="22" height="22" fill="none" stroke="#1A1612" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 8 14 L 32 14 M 24 6 L 32 14 L 24 22"/>
            <path d="M 32 26 L 8 26 M 16 18 L 8 26 L 16 34"/>
          </svg>
        </div>

        <div className="lpr-orbit-ring lpr-orbit-ring-1"/>
        <div className="lpr-orbit-ring lpr-orbit-ring-2"/>

        <svg viewBox="0 0 360 360" className="lpr-orbit-svg" preserveAspectRatio="xMidYMid meet">
          <circle cx="180" cy="180" r="120" fill="none" stroke="rgba(26,22,18,0.18)" strokeWidth="1" strokeDasharray="2 4"/>
          <circle cx="180" cy="180" r="170" fill="none" stroke="rgba(26,22,18,0.10)" strokeWidth="1" strokeDasharray="2 6"/>
          <circle cx="180" cy="60" r="2.5" fill="#1A1612">
            <animateTransform attributeName="transform" type="rotate" from="0 180 180" to="360 180 180" dur="22s" repeatCount="indefinite"/>
          </circle>
        </svg>

        <div className="lpr-orbit-token lpr-orbit-t1">USDC</div>
        <div className="lpr-orbit-token lpr-orbit-t2">ETH</div>
        <div className="lpr-orbit-token lpr-orbit-t3">cbBTC</div>
        <div className="lpr-orbit-token lpr-orbit-t4">EURC</div>

        <div className="lpr-orbit-route">
          <span className="lpr-orbit-route-dot"/>
          <span>USDC → EURC · best rate · 0.9s</span>
        </div>
      </div>
    );
  }
  // ember
  return (
    <div className="lpr-vis lpr-vis-rings" aria-hidden="true">
      <svg viewBox="0 0 480 480" className="lpr-rings-svg">
        <defs>
          <linearGradient id="lpr-ring-grad" x1="0" x2="1">
            <stop offset="0%" stopColor="#D4A24A"/>
            <stop offset="100%" stopColor="#F0DBA8"/>
          </linearGradient>
          <linearGradient id="lpr-ring-grad-soft" x1="0" x2="1">
            <stop offset="0%" stopColor="#F0DBA8" stopOpacity="0.7"/>
            <stop offset="100%" stopColor="#D4A24A" stopOpacity="0.4"/>
          </linearGradient>
        </defs>

        {/* outer track + animated arc */}
        <circle cx="240" cy="240" r="200" fill="none" stroke="rgba(245,240,230,0.06)" strokeWidth="40"/>
        <motion.circle
          cx="240" cy="240" r="200" fill="none"
          stroke="url(#lpr-ring-grad)" strokeWidth="40" strokeLinecap="round"
          transform="rotate(-90 240 240)"
          initial={{ strokeDasharray: '0 1257' }}
          whileInView={{ strokeDasharray: '780 1257' }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 1.6, delay: 0.2, ease }}
        />

        {/* mid track + arc with slow drift */}
        <circle cx="240" cy="240" r="140" fill="none" stroke="rgba(245,240,230,0.06)" strokeWidth="28"/>
        <motion.circle
          cx="240" cy="240" r="140" fill="none"
          stroke="url(#lpr-ring-grad-soft)" strokeWidth="28" strokeLinecap="round"
          transform="rotate(40 240 240)"
          initial={{ strokeDasharray: '0 880' }}
          whileInView={{ strokeDasharray: '540 880' }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 1.6, delay: 0.4, ease }}
        />

        {/* inner track + arc */}
        <circle cx="240" cy="240" r="86" fill="none" stroke="rgba(245,240,230,0.08)" strokeWidth="20"/>
        <motion.circle
          cx="240" cy="240" r="86" fill="none"
          stroke="rgba(245,240,230,0.55)" strokeWidth="20" strokeLinecap="round"
          transform="rotate(120 240 240)"
          initial={{ strokeDasharray: '0 540' }}
          whileInView={{ strokeDasharray: '340 540' }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 1.6, delay: 0.6, ease }}
        />

        {/* outer rotating ticks */}
        <g transform="translate(240 240)">
          <g>
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="80s" repeatCount="indefinite"/>
            {Array.from({ length: 36 }).map((_, i) => (
              <line
                key={i}
                x1="0" y1="-232" x2="0" y2="-224"
                stroke="rgba(245,240,230,0.18)" strokeWidth="1"
                transform={`rotate(${i * 10})`}
              />
            ))}
          </g>
        </g>
      </svg>

      <div className="lpr-rings-center">
        <div className="lpr-rings-pct">+ 18.2%</div>
        <div className="lpr-rings-meta">capital working</div>
      </div>

      <div className="lpr-rings-legend">
        <span className="lpr-rings-legend-item"><i className="lpr-dot lpr-dot-gold"/> Yield</span>
        <span className="lpr-rings-legend-item"><i className="lpr-dot lpr-dot-soft"/> Stable</span>
        <span className="lpr-rings-legend-item"><i className="lpr-dot lpr-dot-cream"/> Reserve</span>
      </div>
    </div>
  );
}

/* ── Paradigm shift slides ── */
const shiftSlides = [
  {
    n: '01',
    eyebrow: 'The burden',
    headline: ['Money has always', 'been your job.'],
    sub: 'Watching it. Moving it. Protecting it. Growing it. The responsibility has always sat with you.',
    visual: 'burden',
  },
  {
    n: '02',
    eyebrow: 'The acceleration',
    headline: ['And the world', 'won’t slow down.'],
    sub: 'Wars move currencies. Inflation eats purchasing power. No human can keep up — most are already losing ground.',
    visual: 'wave',
  },
  {
    n: '03',
    eyebrow: 'The mismatch',
    headline: ['Your life is borderless.', 'Your money isn’t.'],
    sub: 'Airport rates. Cards that don’t work. Days for a transfer home. The world became borderless. Money didn’t.',
    visual: 'globe',
  },
  {
    n: '04',
    eyebrow: 'The shift',
    headline: ['Intend changes', 'all of that.'],
    sub: 'Tell Intend what you want your money to do. Intend gets it done. You live your life.',
    visual: 'mark',
  },
] as const;

function ShiftVisual({ kind }: { kind: 'burden' | 'wave' | 'globe' | 'mark' }) {
  if (kind === 'burden') {
    return (
      <svg viewBox="0 0 320 320" className="lpr-slide-svg" aria-hidden="true">
        <defs>
          <radialGradient id="sv-burden" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#D4A24A" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="#D4A24A" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="160" cy="160" r="140" fill="url(#sv-burden)"/>
        <circle cx="160" cy="160" r="110" fill="none" stroke="rgba(245,240,230,0.10)" strokeWidth="1"/>
        <circle cx="160" cy="160" r="78"  fill="none" stroke="rgba(245,240,230,0.14)" strokeWidth="1"/>
        <circle cx="160" cy="160" r="46"  fill="none" stroke="rgba(245,240,230,0.18)" strokeWidth="1"/>
        <line x1="160" y1="160" x2="160" y2="60"  stroke="#D4A24A" strokeWidth="2" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 160 160" to="360 160 160" dur="14s" repeatCount="indefinite"/>
        </line>
        <line x1="160" y1="160" x2="240" y2="160" stroke="#F0DBA8" strokeWidth="2.5" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 160 160" to="360 160 160" dur="60s" repeatCount="indefinite"/>
        </line>
        <circle cx="160" cy="160" r="4" fill="#F0DBA8"/>
      </svg>
    );
  }
  if (kind === 'wave') {
    return (
      <svg viewBox="0 0 360 320" className="lpr-slide-svg" aria-hidden="true">
        <defs>
          <linearGradient id="sv-wave" x1="0" x2="1">
            <stop offset="0%"  stopColor="#D4A24A" stopOpacity="0"/>
            <stop offset="50%" stopColor="#F0DBA8" stopOpacity="1"/>
            <stop offset="100%" stopColor="#D4A24A" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={i}
            d={`M 0 ${160 + i * 6} Q 90 ${120 - i * 6} 180 ${160 + i * 6} T 360 ${160 + i * 6}`}
            fill="none"
            stroke="url(#sv-wave)"
            strokeWidth={1.6 - i * 0.18}
            opacity={0.85 - i * 0.12}
          />
        ))}
        <g fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#D4A24A" opacity="0.8">
          <text x="20"  y="60">+ 4.2%</text>
          <text x="120" y="40">- 1.8%</text>
          <text x="240" y="68">+ 0.6%</text>
          <text x="60"  y="280">- 3.1%</text>
          <text x="240" y="270">+ 2.4%</text>
        </g>
      </svg>
    );
  }
  if (kind === 'globe') {
    return (
      <svg viewBox="0 0 320 320" className="lpr-slide-svg" aria-hidden="true">
        <defs>
          <linearGradient id="sv-globe" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#F0DBA8"/>
            <stop offset="100%" stopColor="#D4A24A"/>
          </linearGradient>
        </defs>
        <circle cx="160" cy="160" r="120" fill="none" stroke="rgba(245,240,230,0.10)" strokeWidth="1"/>
        <ellipse cx="160" cy="160" rx="120" ry="40" fill="none" stroke="rgba(245,240,230,0.10)"/>
        <ellipse cx="160" cy="160" rx="120" ry="80" fill="none" stroke="rgba(245,240,230,0.10)"/>
        <ellipse cx="160" cy="160" rx="80"  ry="120" fill="none" stroke="rgba(245,240,230,0.10)"/>
        <ellipse cx="160" cy="160" rx="40"  ry="120" fill="none" stroke="rgba(245,240,230,0.10)"/>
        <path d="M 60 200 Q 160 60 260 200" fill="none" stroke="url(#sv-globe)" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="60"  cy="200" r="6" fill="#F0DBA8"/>
        <circle cx="260" cy="200" r="6" fill="#F0DBA8"/>
        <circle cx="160" cy="92" r="4" fill="#D4A24A">
          <animate attributeName="cy" values="92;88;92" dur="2.6s" repeatCount="indefinite"/>
        </circle>
      </svg>
    );
  }
  // mark
  return (
    <svg viewBox="0 0 320 320" className="lpr-slide-svg" aria-hidden="true">
      <defs>
        <radialGradient id="sv-mark-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#F0DBA8" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#D4A24A" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="sv-mark-fill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%"  stopColor="#F0DBA8"/>
          <stop offset="100%" stopColor="#D4A24A"/>
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r="150" fill="url(#sv-mark-glow)"/>
      <circle cx="160" cy="160" r="84" fill="none" stroke="url(#sv-mark-fill)" strokeWidth="2"/>
      <circle cx="160" cy="160" r="84" fill="none" stroke="url(#sv-mark-fill)" strokeWidth="2"
        strokeDasharray="40 528" strokeLinecap="round" transform="rotate(-90 160 160)">
        <animateTransform attributeName="transform" type="rotate" from="0 160 160" to="360 160 160" dur="9s" repeatCount="indefinite"/>
      </circle>
      <circle cx="160" cy="160" r="14" fill="url(#sv-mark-fill)"/>
    </svg>
  );
}

/* ── TOC ── */
const tocItems = [
  { id: 'hero',     label: 'Start' },
  { id: 'shift',    label: 'The shift' },
  { id: 'features', label: 'What it does' },
  { id: 'modes',    label: 'How it works' },
  { id: 'close',    label: 'Begin' },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  /* Horizontal-pinned shift slides */
  const shiftRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: shiftProgress } = useScroll({
    target: shiftRef,
    offset: ['start start', 'end end'],
  });
  const slidesCount = shiftSlides.length;
  const trackX = useTransform(
    shiftProgress,
    [0, 1],
    [`0%`, `-${((slidesCount - 1) / slidesCount) * 100}%`],
  );
  const railProgress = useTransform(shiftProgress, [0, 1], ['0%', '100%']);

  const [activeSection, setActiveSection] = useState<string>('hero');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id); }),
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );
    tocItems.forEach((t) => {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lpr">
      {/* ═══ FLOATING NAV ═══ */}
      <nav className="lpr-nav">
        <div className="lpr-logo">
          <span className="lpr-logo-dot" />
          intend
        </div>
        <div className="lpr-nav-links">
          <a href="#shift" className="lpr-nav-link">Why</a>
          <a href="#features" className="lpr-nav-link">What</a>
          <a href="#modes" className="lpr-nav-link">How</a>
        </div>
        <Link href="/login" className="lpr-nav-cta">
          Start intending
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
          </svg>
        </Link>
      </nav>

      {/* ═══ MINI TOC ═══ */}
      <div className="lpr-toc" aria-hidden="true">
        {tocItems.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={`lpr-toc-item${activeSection === t.id ? ' active' : ''}`}>
            <span className="lpr-toc-label">{t.label}</span>
            <span className="lpr-toc-dot" />
          </a>
        ))}
      </div>

      {/* ═══ HERO ═══ */}
      <section className="lpr-hero" id="hero" ref={heroRef}>
        <div className="lpr-hero-grain" aria-hidden="true" />
        <div className="lpr-hero-glow" aria-hidden="true">
          <div className="lpr-hero-orb lpr-hero-orb-1"/>
          <div className="lpr-hero-orb lpr-hero-orb-2"/>
          <div className="lpr-hero-orb lpr-hero-orb-3"/>
        </div>

        <motion.div className="lpr-hero-inner" style={{ y: heroY, opacity: heroOpacity }}>
          <motion.h1
            className="lpr-hero-h1"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.95, delay: 0.15, ease: easeTuple }}
          >
            <em>The financial concierge</em>
            <br />
            <em>that acts,</em> <span className="lpr-hero-h1-mute">so you don&rsquo;t have to.</span>
          </motion.h1>

          <motion.p
            className="lpr-hero-sub"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55 }}
          >
            An autonomous financial concierge that executes your intentions and keeps your money moving in your favor — always on, always context-aware.
          </motion.p>

          <motion.div
            className="lpr-hero-actions"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
          >
            <Link href="/login" className="lpr-btn lpr-btn-primary">
              Start intending
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
              </svg>
            </Link>
            <a href="#shift" className="lpr-btn lpr-btn-ghost">See the shift</a>
          </motion.div>

          <motion.div
            className="lpr-hero-trust"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.95 }}
          >
            <div className="lpr-trust-item"><span className="lpr-trust-num">100%</span><span className="lpr-trust-label">non-custodial</span></div>
            <div className="lpr-trust-item"><span className="lpr-trust-num">24/7</span><span className="lpr-trust-label">monitoring</span></div>
            <div className="lpr-trust-item"><span className="lpr-trust-num">∞</span><span className="lpr-trust-label">currencies</span></div>
          </motion.div>
        </motion.div>

        {/* Floating concierge artifact */}
        <motion.div
          className="lpr-hero-art"
          initial={{ opacity: 0, scale: 0.94, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.3, delay: 0.4, ease: easeTuple }}
          aria-hidden="true"
        >
          <div className="lpr-hero-card lpr-hero-card-back">
            <div className="lpr-hero-card-meta">Intent</div>
            <div className="lpr-hero-card-text">
              <span className="lpr-prompt">intend://</span> protect my savings from naira inflation
            </div>
          </div>
          <div className="lpr-hero-card lpr-hero-card-front">
            <div className="lpr-hero-card-row">
              <span className="lpr-hero-card-pill">Plan</span>
              <span className="lpr-hero-card-time">3.2s</span>
            </div>
            <div className="lpr-hero-card-headline">
              Move <em>$1,200</em> to a stable position
            </div>
            <ul className="lpr-hero-card-list">
              <li><span>Protect against</span><b>~18% / yr loss</b></li>
              <li><span>Earn while held</span><b>4.8% APY</b></li>
              <li><span>Network fee</span><b>$0.14</b></li>
            </ul>
            <div className="lpr-hero-card-cta">Protect my savings →</div>
          </div>

          {/* Send mini-card — Argentina */}
          <div className="lpr-hero-card lpr-hero-mini lpr-hero-mini-send">
            <div className="lpr-hero-mini-row">
              <span className="lpr-hero-mini-pill">Send</span>
              <span className="lpr-hero-mini-time">0.9s</span>
            </div>
            <div className="lpr-hero-mini-text">
              <span className="lpr-prompt">intend://</span> send <b>$1,000</b> to my mom in Argentina
            </div>
            <div className="lpr-hero-mini-foot">
              <span>USDC → ARS · arrives in 8s</span>
              <span className="lpr-hero-mini-dot"/>
            </div>
          </div>

          {/* Spend mini-card — Singapore café */}
          <div className="lpr-hero-card lpr-hero-mini lpr-hero-mini-spend">
            <div className="lpr-hero-mini-row">
              <span className="lpr-hero-mini-pill lpr-hero-mini-pill-light">Spend</span>
              <span className="lpr-hero-mini-time">1.4s</span>
            </div>
            <div className="lpr-hero-mini-text">
              <span className="lpr-prompt">intend://</span> pay for my coffee at a café in Singapore
            </div>
            <div className="lpr-hero-mini-foot">
              <span>S$ 6.80 · tap-to-pay</span>
              <span className="lpr-hero-mini-dot lpr-hero-mini-dot-light"/>
            </div>
          </div>

          <div className="lpr-hero-spark lpr-hero-spark-1"/>
          <div className="lpr-hero-spark lpr-hero-spark-2"/>
          <div className="lpr-hero-spark lpr-hero-spark-3"/>
        </motion.div>
      </section>

      {/* ═══ PARADIGM SHIFT — horizontal pinned slides ═══ */}
      <section className="lpr-shift" id="shift" ref={shiftRef}>
        <div className="lpr-shift-grain" aria-hidden="true"/>
        <div className="lpr-shift-pin">
          <div className="lpr-shift-overlay">
            <div className="lpr-shift-eyebrow"><span/> A new way to do money</div>
            <div className="lpr-shift-rail" aria-hidden="true">
              <motion.div className="lpr-shift-rail-fill" style={{ width: railProgress }}/>
            </div>
            <div className="lpr-shift-counter" aria-hidden="true">
              {shiftSlides.map((s) => (
                <span key={s.n} className="lpr-shift-counter-dot"/>
              ))}
            </div>
          </div>

          <motion.div
            className="lpr-shift-track"
            style={{ x: trackX, width: `${slidesCount * 100}%` }}
          >
            {shiftSlides.map((s) => (
              <article key={s.n} className="lpr-slide" style={{ width: `${100 / slidesCount}%` }}>
                <div className="lpr-slide-inner">
                  <div className="lpr-slide-text">
                    <div className="lpr-slide-num">{s.n}</div>
                    <h2 className="lpr-slide-h">
                      {s.headline.map((line, i) => (
                        <span key={i} className="lpr-slide-h-line"><em>{line}</em></span>
                      ))}
                    </h2>
                    <p className="lpr-slide-sub">{s.sub}</p>
                  </div>
                  <div className="lpr-slide-art">
                    <ShiftVisual kind={s.visual} />
                  </div>
                </div>
              </article>
            ))}
          </motion.div>
        </div>

        {/* Mobile-only stacked fallback */}
        <div className="lpr-shift-mobile">
          {shiftSlides.map((s) => (
            <article key={s.n} className="lpr-slide-m">
              <div className="lpr-slide-num">{s.n}</div>
              <h2 className="lpr-slide-h">
                {s.headline.map((line, i) => (
                  <span key={i} className="lpr-slide-h-line"><em>{line}</em></span>
                ))}
              </h2>
              <p className="lpr-slide-sub">{s.sub}</p>
              <div className="lpr-slide-art lpr-slide-art-m">
                <ShiftVisual kind={s.visual} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="lpr-features" id="features">
        <motion.div
          className="lpr-features-head"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
        >
          <motion.div className="lpr-features-eyebrow" variants={fade}>
            <span/> What Intend does
          </motion.div>
          <motion.h2 className="lpr-features-h2" variants={fade} custom={1}>
            Everything Intend does for you today.
          </motion.h2>
        </motion.div>

        {features.map((f, i) => (
          <motion.div
            key={f.n}
            className={`lpr-feat lpr-feat-${f.theme} ${i % 2 === 1 ? 'lpr-feat-flip' : ''}`}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
          >
            <div className="lpr-feat-inner">
              <motion.div className="lpr-feat-text" variants={fade}>
                <div className="lpr-feat-badge">
                  <span className="lpr-feat-badge-num">{f.n}</span>
                  <span className="lpr-feat-badge-kicker">{f.kicker}</span>
                </div>
                <h3 className="lpr-feat-title">
                  {f.title.map((line, idx) => (
                    <span key={idx} className="lpr-feat-title-line"><em>{line}</em></span>
                  ))}
                </h3>
                <p className="lpr-feat-body">{f.body}</p>
                <div className="lpr-feat-chips">
                  {f.chips.map((c) => (
                    <span key={c} className="lpr-feat-chip">{c}</span>
                  ))}
                </div>
              </motion.div>
              <motion.div
                className="lpr-feat-art"
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 1, ease: easeTuple, delay: 0.15 }}
              >
                <FeatureVisual theme={f.theme} />
              </motion.div>
            </div>
          </motion.div>
        ))}
      </section>

      {/* ═══ MODES ═══ */}
      <section className="lpr-modes" id="modes">
        <motion.div
          className="lpr-modes-head"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
        >
          <motion.div className="lpr-modes-eyebrow" variants={fade}>
            <span/> Two modes, one rhythm
          </motion.div>
          <motion.h2 className="lpr-modes-h2" variants={fade} custom={1}>
            <em>Intend behaves at the rhythm of your life.</em>
          </motion.h2>
          <motion.p className="lpr-modes-lead" variants={fade} custom={2}>
            Some days you want everything handled. Other days you want to be in the loop. Intend follows your rhythm — not the other way around.
          </motion.p>
        </motion.div>

        <div className="lpr-modes-grid">
          <motion.div
            className="lpr-mode lpr-mode-auto"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.85, ease: easeTuple }}
          >
            <div className="lpr-mode-tag">Mode 01</div>
            <div className="lpr-mode-name">Autonomous</div>
            <div className="lpr-mode-quote"><em>Intention in. Outcome out.</em></div>
            <p className="lpr-mode-body">
              You tell Intend what you want. It executes and brings you the receipt — no approvals, no check-ins, no waiting.
            </p>
            <div className="lpr-mode-flow">
              <span>Intent</span>
              <span className="lpr-mode-arrow">→</span>
              <span>Outcome</span>
            </div>
          </motion.div>

          <motion.div
            className="lpr-mode lpr-mode-assist"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.85, delay: 0.12, ease: easeTuple }}
          >
            <div className="lpr-mode-tag">Mode 02</div>
            <div className="lpr-mode-name">Assisted</div>
            <div className="lpr-mode-quote"><em>Intention in. Your approval. Execution out.</em></div>
            <p className="lpr-mode-body">
              Intend builds the plan and shows you exactly what it will do before doing anything. You approve. It moves.
            </p>
            <div className="lpr-mode-flow">
              <span>Intent</span>
              <span className="lpr-mode-arrow">→</span>
              <span>Plan</span>
              <span className="lpr-mode-arrow">→</span>
              <span>Approve</span>
              <span className="lpr-mode-arrow">→</span>
              <span>Outcome</span>
            </div>
          </motion.div>
        </div>

        <motion.div
          className="lpr-modes-foot"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.div className="lpr-modes-switch" variants={fade}>
            <div className="lpr-modes-switch-label">The switch</div>
            <p>
              Switch modes in settings or just tell Intend in conversation. It adjusts on the fly.
            </p>
          </motion.div>

          <motion.div className="lpr-modes-close" variants={fade} custom={1}>
            This is a financial concierge that fits your life instead of asking your life to fit it.
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ FOOTER + CTA ═══ */}
      <section className="lpr-footer" id="close">
        <div className="lpr-footer-grain" aria-hidden="true"/>
        <motion.div
          className="lpr-footer-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
        >
          <motion.div className="lpr-footer-quote" variants={fade}>
            <em>Your money, thinking</em>
            <br />
            <em>and acting for you.</em>
          </motion.div>

          <motion.div className="lpr-footer-cta-wrap" variants={fade} custom={1}>
            <Link href="/login" className="lpr-btn lpr-btn-primary lpr-btn-lg lpr-btn-light">
              Start intending
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
              </svg>
            </Link>
          </motion.div>

          <motion.div className="lpr-footer-bar" variants={fade} custom={2}>
            <div className="lpr-footer-brand">
              <span className="lpr-logo-dot"/>
              intend
            </div>
            <div className="lpr-footer-links">
              <a href="https://t.me/intend_auto_bot" className="lpr-footer-link" target="_blank" rel="noreferrer">Telegram</a>
              <a href="#" className="lpr-footer-link">Docs</a>
              <a href="#" className="lpr-footer-link">Privacy</a>
              <a href="#" className="lpr-footer-link">thinkDecade</a>
            </div>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}

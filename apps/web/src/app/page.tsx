'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/* ── Motion helpers ── */
const ease = [0.16, 1, 0.3, 1] as const;

const fade = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, delay: i * 0.08, ease: ease as unknown as [number, number, number, number] },
  }),
};

const stagger = { visible: { transition: { staggerChildren: 0.08 } } };

/* ── Primitives — all 8 shown, outcome-only copy ── */
const primitives = [
  {
    key: 'PROTECT',
    label: 'Protect',
    body: 'Keep your money ahead of inflation and currency risk — without you watching the markets.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5 4 6v6c0 5 3.5 8.5 8 9.5 4.5-1 8-4.5 8-9.5V6l-8-3.5z"/>
      </svg>
    ),
  },
  {
    key: 'GROW',
    label: 'Grow',
    body: 'Put idle capital to work, automatically. Yield appears while you live your life.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17 9 11l4 4 8-8"/>
        <path d="M14 7h7v7"/>
      </svg>
    ),
  },
  {
    key: 'MOVE',
    label: 'Move',
    body: 'Send money to anyone, anywhere. They receive it — no wallets, no hoops, no delay.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12h15"/>
        <path d="m14 6 6 6-6 6"/>
      </svg>
    ),
  },
  {
    key: 'CONVERT',
    label: 'Convert',
    body: 'Exchange between any two currencies at the best available rate — instantly.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3v14"/>
        <path d="M3 7l4-4 4 4"/>
        <path d="M17 21V7"/>
        <path d="M13 17l4 4 4-4"/>
      </svg>
    ),
  },
  {
    key: 'SAVE',
    label: 'Save',
    body: 'Name a goal. Intend funds it on a rhythm you set, and tells you when you arrive.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="4"/>
      </svg>
    ),
  },
  {
    key: 'EARN',
    label: 'Earn',
    body: 'Incoming money lands intelligently. It gets routed the moment it arrives — never sits idle.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12"/>
        <path d="m6 9 6 6 6-6"/>
        <path d="M5 21h14"/>
      </svg>
    ),
  },
  {
    key: 'INVEST',
    label: 'Invest',
    body: 'Buy and hold what you believe in. Clean cost basis, real-time P&L, no clutter.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="4" height="9"/>
        <rect x="10" y="7" width="4" height="13"/>
        <rect x="17" y="3" width="4" height="17"/>
      </svg>
    ),
  },
  {
    key: 'SPEND',
    label: 'Spend',
    body: 'Pay anyone, anywhere — card, crypto, or protocol. One way in. Every rail out.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="13" rx="2"/>
        <path d="M2 11h20"/>
        <path d="M6 15h3"/>
      </svg>
    ),
  },
];

const confidence = [
  { n: '01', title: 'Keys stay encrypted.', body: 'Your private keys never touch our servers. They live in secure enclaves operated by Coinbase. We hold nothing you don\'t want us to.' },
  { n: '02', title: 'Confirmation, always.', body: 'Every movement of value is previewed and explicitly confirmed — even in autonomous mode. You see exactly what will happen before it happens.' },
  { n: '03', title: 'Live data, never stale.', body: 'Rates, prices and fees are fetched fresh before every execution. Hard staleness limits kill anything older than seconds.' },
  { n: '04', title: 'Every action, receipted.', body: 'A full audit trail of every intent, plan and execution. You can inspect any decision Intend has made on your behalf.' },
];

const channels = [
  {
    name: 'Telegram',
    body: 'Message an intention. Get a plan back. Confirm with a tap. The quickest way in.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21 4-9 16-3-7-7-3z"/>
      </svg>
    ),
  },
  {
    name: 'WhatsApp',
    body: 'Same Intend, inside the app you already use every day. Arriving soon.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-3.2-6.9L21 4l-1.1 3.3A9 9 0 0 1 21 12z"/>
        <path d="M8.5 9.5c0 3 2 5 5 5l1.5-1-1.5-1.5a4 4 0 0 1-2.5-2.5L9.5 8z"/>
      </svg>
    ),
  },
  {
    name: 'Web',
    body: 'A calm dashboard. Streaming plans, live positions, every intent at a glance.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M3 12h18"/>
        <path d="M12 3a14 14 0 0 1 0 18"/>
        <path d="M12 3a14 14 0 0 0 0 18"/>
      </svg>
    ),
  },
];

const tocItems = [
  { id: 'hero', label: 'Start' },
  { id: 'shift', label: 'The shift' },
  { id: 'primitives', label: 'Primitives' },
  { id: 'confidence', label: 'Confidence' },
  { id: 'channels', label: 'Channels' },
  { id: 'close', label: 'Begin' },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const [activeSection, setActiveSection] = useState<string>('hero');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );
    tocItems.forEach((t) => {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lp">
      <div className="lp-bg" />

      {/* ═══ FLOATING PILL NAV ═══ */}
      <nav className="lp-nav">
        <div className="lp-logo">
          <span className="lp-logo-dot" />
          Intend
        </div>
        <div className="lp-nav-links">
          <a href="#primitives" className="lp-nav-link">Primitives</a>
          <a href="#confidence" className="lp-nav-link">Confidence</a>
          <a href="#channels" className="lp-nav-link">Channels</a>
        </div>
        <Link href="/login" className="lp-nav-cta">Open app</Link>
      </nav>

      {/* ═══ RIGHT MINI-TOC ═══ */}
      <div className="lp-toc" aria-hidden="true">
        {tocItems.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className={`lp-toc-item${activeSection === t.id ? ' active' : ''}`}
          >
            <span className="lp-toc-label">{t.label}</span>
            <span className="lp-toc-dot" />
          </a>
        ))}
      </div>

      {/* ═══ HERO ═══ */}
      <section className="lp-hero" id="hero" ref={heroRef}>
        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-orb lp-orb-1" />
          <div className="lp-orb lp-orb-2" />
          <div className="lp-orb lp-orb-3" />
        </div>

        <motion.div className="lp-hero-inner" style={{ y: heroY, opacity: heroOpacity }}>
          <motion.h1
            className="lp-hero-h1"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.15, ease: ease as unknown as [number, number, number, number] }}
          >
            Your money,<br />
            <span className="lp-hero-h1-accent">executing</span><br />
            your intentions.
          </motion.h1>

          <motion.p
            className="lp-hero-sub"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.45 }}
          >
            Finance was built around products. Intend rebuilds it around intentions.
            You define the outcome. Intend figures out how.
          </motion.p>

          <motion.div
            className="lp-hero-actions"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65 }}
          >
            <Link href="/login" className="lp-btn-primary">
              Open app
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
              </svg>
            </Link>
            <a href="#primitives" className="lp-btn-ghost">See what it does</a>
          </motion.div>
        </motion.div>

        {/* Trust chip */}
        <motion.div
          className="lp-trust-chip"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
        >
          <span className="lp-trust-dot" />
          <span className="lp-trust-text"><strong>Live</strong> · Private keys encrypted</span>
        </motion.div>

        {/* Scroll orbit badge */}
        <motion.a
          href="#shift"
          className="lp-scroll-badge"
          aria-label="Scroll to content"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 1 }}
        >
          <svg className="lp-scroll-circle" viewBox="0 0 120 120">
            <defs>
              <path id="circlePath" d="M 60,60 m -46,0 a 46,46 0 1,1 92,0 a 46,46 0 1,1 -92,0" />
            </defs>
            <text fill="currentColor" fontSize="9" fontFamily="var(--font-mono)" fontWeight="500" letterSpacing="3">
              <textPath href="#circlePath">SCROLL · EXPLORE · SCROLL · EXPLORE · </textPath>
            </text>
          </svg>
          <span className="lp-scroll-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>
            </svg>
          </span>
        </motion.a>
      </section>

      {/* ═══ THE SHIFT ═══ */}
      <section className="lp-section" id="shift">
        <motion.div
          className="lp-section-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
        >
          <motion.div className="lp-eyebrow" variants={fade}>The intention shift</motion.div>
          <motion.h2 className="lp-h2" variants={fade} custom={1}>
            For centuries, people adapted themselves to financial systems.<br />
            <span className="lp-h2-accent">Intend reverses that.</span>
          </motion.h2>
          <motion.p className="lp-lead" variants={fade} custom={2}>
            You say what you want to happen. Intend reads your position, builds a plan, shows
            you the outcome, and executes — across currencies, rails and continents. No
            protocols. No jargon. No translation work.
          </motion.p>
        </motion.div>
      </section>

      {/* ═══ PRIMITIVES ═══ */}
      <section className="lp-section" id="primitives">
        <motion.div
          className="lp-section-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className="lp-eyebrow" variants={fade}>Eight primitives</motion.div>
          <motion.h2 className="lp-h2" variants={fade} custom={1}>
            Everything your money should know how to do.
          </motion.h2>

          <div className="lp-prim-grid">
            {primitives.map((p, i) => (
              <motion.div key={p.key} className="lp-prim-card" variants={fade} custom={i + 2}>
                <div className="lp-prim-icon">{p.icon}</div>
                <div className="lp-prim-label">{p.label}</div>
                <div className="lp-prim-desc">{p.body}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══ CONFIDENCE ═══ */}
      <section className="lp-section" id="confidence">
        <motion.div
          className="lp-section-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className="lp-eyebrow" variants={fade}>Why you can trust autonomous</motion.div>
          <motion.h2 className="lp-h2" variants={fade} custom={1}>
            Autonomy is a promise.<br />
            <span className="lp-h2-accent">We keep it with four guarantees.</span>
          </motion.h2>

          <div className="lp-conf-grid">
            {confidence.map((c, i) => (
              <motion.div key={c.n} className="lp-conf-item" variants={fade} custom={i + 2}>
                <div className="lp-conf-num">{c.n} —</div>
                <div className="lp-conf-title">{c.title}</div>
                <div className="lp-conf-body">{c.body}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══ CHANNELS ═══ */}
      <section className="lp-section" id="channels">
        <motion.div
          className="lp-section-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className="lp-eyebrow" variants={fade}>Meet you where you are</motion.div>
          <motion.h2 className="lp-h2" variants={fade} custom={1}>
            One Intend. Three ways in.
          </motion.h2>

          <div className="lp-ch-grid">
            {channels.map((c, i) => (
              <motion.div key={c.name} className="lp-ch-card" variants={fade} custom={i + 2}>
                <div className="lp-ch-icon">{c.icon}</div>
                <div className="lp-ch-name">{c.name}</div>
                <div className="lp-ch-desc">{c.body}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══ CLOSING CTA ═══ */}
      <section className="lp-cta" id="close">
        <motion.div
          className="lp-cta-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.h2 className="lp-cta-h2" variants={fade}>
            Define your outcome.<br />
            <span className="lp-hero-h1-accent">Intend does the rest.</span>
          </motion.h2>
          <motion.p className="lp-cta-sub" variants={fade} custom={1}>
            The smartest financial concierge on earth is ready to meet your money.
          </motion.p>
          <motion.div variants={fade} custom={2}>
            <Link href="/login" className="lp-btn-primary lp-btn-lg">
              Open app
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
              </svg>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo">
              <span className="lp-logo-dot" />
              Intend
            </div>
            <div className="lp-footer-tag">Your money, executing your intentions.</div>
          </div>
          <div className="lp-footer-links">
            <a href="#primitives" className="lp-footer-link">Primitives</a>
            <a href="#confidence" className="lp-footer-link">Confidence</a>
            <Link href="/login" className="lp-footer-link">Sign in</Link>
          </div>
          <div className="lp-footer-meta">v0.5</div>
        </div>
      </footer>
    </div>
  );
}

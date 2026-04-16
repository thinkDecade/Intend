'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

/* ── Animation helpers ── */
const easeOut = [0.25, 0.46, 0.45, 0.94] as const;

const fade = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.1, ease: easeOut as unknown as [number, number, number, number] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

// v0.5: 4 active primitives
const primitives = [
  { key: 'PROTECT', label: 'Protect', desc: 'Intend watches inflation and FX signals around the clock. When your savings are at risk, it alerts you and acts — before you know you need protection.' },
  { key: 'CONVERT', label: 'Convert', desc: 'Best-rate asset exchange. Intend fetches live quotes, routes through the deepest pool, and executes. You just say what you want.' },
  { key: 'SEND',    label: 'Send',    desc: 'Transfer value to any wallet or Intend user. Recipients without wallets get a secure claim link — no setup required on their end.' },
  { key: 'SPEND',   label: 'Spend',   desc: 'Pay anywhere: card-enabled merchants, crypto checkout, or open payment protocols. One interface for everything.' },
];

const steps = [
  { num: '01', title: 'Express your intention', body: 'Tell Intend what you want in plain language. "Protect my savings." "Send $200 to my sister." That\'s it.' },
  { num: '02', title: 'Review the plan',        body: 'Intend builds a detailed execution plan — fees, timing, routing — and presents it for your approval. No surprises.' },
  { num: '03', title: 'Confirm and done',        body: 'One tap to execute. Your money moves exactly where it should. You stay in complete control.' },
];

const stats = [
  { value: '4',   label: 'Financial primitives — v0.5' },
  { value: '6h',  label: 'PROTECT monitoring cycle' },
  { value: '<1s', label: 'Intent interpretation' },
  { value: '0',   label: 'Protocol knowledge required' },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <>
      <div className="ambient" />

      {/* ═══ NAV ═══ */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-logo">intend</div>
          <div className="lp-nav-links">
            <a href="#how" className="lp-nav-link">How it works</a>
            <a href="#primitives" className="lp-nav-link">Capabilities</a>
            <Link href="/login" className="lp-nav-cta">Get started</Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="lp-hero" ref={heroRef}>
        <motion.div
          className="lp-hero-content"
          style={{ y: heroY, opacity: heroOpacity }}
        >
          <motion.div
            className="lp-hero-badge"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Finance, rebuilt around intentions
          </motion.div>

          <motion.h1
            className="lp-hero-h1"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: easeOut as unknown as [number, number, number, number] }}
          >
            Your money,
            <br />
            <span className="lp-hero-accent">executing your</span>
            <br />
            intentions.
          </motion.h1>

          <motion.p
            className="lp-hero-sub"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
          >
            The smartest financial concierge on earth. Intend understands
            your economic reality, acts on your intentions, and protects
            your capital — before you know you need it.
          </motion.p>

          <motion.div
            className="lp-hero-actions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <Link href="/login" className="lp-btn-primary">
              Get early access
            </Link>
            <a href="#how" className="lp-btn-ghost">
              See how it works
            </a>
          </motion.div>
        </motion.div>

        {/* Decorative gradient orb */}
        <div className="lp-hero-orb" />
      </section>

      {/* ═══ DIVIDER LINE ═══ */}
      <div className="lp-divider" />

      {/* ═══ ABOUT ═══ */}
      <section className="lp-section">
        <motion.div
          className="lp-about"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className="lp-section-tag" variants={fade}>
            The vision
          </motion.div>
          <motion.h2 className="lp-section-h2" variants={fade} custom={1}>
            For centuries, people have adapted themselves
            to financial systems.
          </motion.h2>
          <motion.p className="lp-section-lead" variants={fade} custom={2}>
            Intend reverses that relationship. You define the outcome.
            Intend figures out how to achieve it.
          </motion.p>
        </motion.div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="lp-section lp-section-dark" id="how">
        <motion.div
          className="lp-section-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.div className="lp-section-tag" variants={fade}>
            How it works
          </motion.div>
          <motion.h2 className="lp-section-h2" variants={fade} custom={1}>
            Three steps. Nothing more.
          </motion.h2>

          <div className="lp-steps">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                className="lp-step"
                variants={fade}
                custom={i + 2}
              >
                <div className="lp-step-num">{s.num}</div>
                <h3 className="lp-step-title">{s.title}</h3>
                <p className="lp-step-body">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══ STATS BAR ═══ */}
      <section className="lp-stats-bar">
        <motion.div
          className="lp-stats-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
        >
          {stats.map((s, i) => (
            <motion.div key={s.label} className="lp-stat" variants={fade} custom={i}>
              <div className="lp-stat-val">{s.value}</div>
              <div className="lp-stat-label">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ═══ EXECUTION MODES ═══ */}
      <section className="lp-section">
        <motion.div
          className="lp-section-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.div className="lp-section-tag" variants={fade}>
            Execution modes
          </motion.div>
          <motion.h2 className="lp-section-h2" variants={fade} custom={1}>
            Your level of control. Your choice.
          </motion.h2>

          <div className="lp-modes">
            <motion.div className="lp-mode-card" variants={fade} custom={2}>
              <div className="lp-mode-label">Semi-Autonomous <span className="lp-mode-default">default</span></div>
              <p className="lp-mode-desc">
                Intend builds the plan and presents it. You review, then confirm with one tap.
                Trust is built through transparency — you always know what&apos;s about to happen.
              </p>
              <div className="lp-mode-trigger">Say: &ldquo;ask me before executing&rdquo;</div>
            </motion.div>
            <motion.div className="lp-mode-card lp-mode-auto" variants={fade} custom={3}>
              <div className="lp-mode-label">Autonomous</div>
              <p className="lp-mode-desc">
                Intent in. Outcome out. Intend executes immediately and sends you a receipt.
                For users who want zero friction and have established trust.
              </p>
              <div className="lp-mode-trigger">Say: &ldquo;go autonomous&rdquo;</div>
            </motion.div>
          </div>
          <motion.p className="lp-modes-note" variants={fade} custom={4}>
            Switch modes any time — from settings or mid-conversation. PROTECT always asks first, no matter what.
          </motion.p>
        </motion.div>
      </section>

      {/* ═══ PRIMITIVES ═══ */}
      <section className="lp-section lp-section-dark" id="primitives">
        <motion.div
          className="lp-section-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.div className="lp-section-tag" variants={fade}>
            Capabilities
          </motion.div>
          <motion.h2 className="lp-section-h2" variants={fade} custom={1}>
            Four things your money can do — right now.
          </motion.h2>

          <div className="lp-prim-grid">
            {primitives.map((p, i) => (
              <motion.div
                key={p.key}
                className="lp-prim-card"
                variants={fade}
                custom={i + 2}
              >
                <div className="lp-prim-label">{p.label}</div>
                <div className="lp-prim-desc">{p.desc}</div>
                <div className="lp-prim-arrow">&#8599;</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══ SHOWCASE / DEMO ═══ */}
      <section className="lp-section lp-section-dark">
        <motion.div
          className="lp-section-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.div className="lp-section-tag" variants={fade}>
            Experience
          </motion.div>
          <motion.h2 className="lp-section-h2" variants={fade} custom={1}>
            Natural language. Real execution.
          </motion.h2>

          <motion.div className="lp-showcase" variants={fade} custom={2}>
            <div className="lp-showcase-chat">
              {/* Proactive PROTECT alert — Intend acts before user asks */}
              <div className="lp-chat-msg lp-chat-agent lp-chat-proactive">
                <div className="lp-chat-agent-label">⚡ intend noticed something</div>
                The cedi has lost 4.2% against the dollar this week and inflation
                is running at 18.4%. Your $1,200 in savings is exposed.
              </div>
              <div className="lp-chat-plan">
                <div className="lp-plan-row">
                  <span className="lp-plan-key">Action</span>
                  <span className="lp-plan-val">Protect $1,200</span>
                </div>
                <div className="lp-plan-row">
                  <span className="lp-plan-key">Protection from</span>
                  <span className="lp-plan-val">~18% annual purchasing-power loss</span>
                </div>
                <div className="lp-plan-row">
                  <span className="lp-plan-key">Yield while protected</span>
                  <span className="lp-plan-val lp-plan-green">4.8% APY</span>
                </div>
                <div className="lp-plan-row">
                  <span className="lp-plan-key">Fee</span>
                  <span className="lp-plan-val">$0.14</span>
                </div>
              </div>
              <div className="lp-chat-confirm lp-chat-confirm-two">
                <div className="lp-confirm-btn">Protect my savings &#8594;</div>
                <div className="lp-dismiss-btn">Not now</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ CHANNELS ═══ */}
      <section className="lp-section">
        <motion.div
          className="lp-section-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.div className="lp-section-tag" variants={fade}>
            Channels
          </motion.div>
          <motion.h2 className="lp-section-h2" variants={fade} custom={1}>
            Telegram and Web. More coming.
          </motion.h2>
          <motion.p className="lp-section-lead" variants={fade} custom={2}>
            One account. Two channels for v0.5. Your financial state follows you
            seamlessly — no context lost, ever.
          </motion.p>

          <div className="lp-channels">
            {[
              { name: 'Telegram', icon: '💬', desc: 'Message your intentions directly in chat. The fastest way to act.', live: true },
              { name: 'Web App',  icon: '🌐', desc: 'Full dashboard with streaming plan previews and one-tap execution.', live: true },
              { name: 'WhatsApp', icon: '📱', desc: 'In development — same Intend experience on a third channel.', live: false },
            ].map((ch, i) => (
              <motion.div key={ch.name} className={`lp-channel-card${ch.live ? '' : ' lp-channel-dim'}`} variants={fade} custom={i + 3}>
                <div className="lp-channel-icon">{ch.icon}</div>
                <div className="lp-channel-name">{ch.name}{ch.live ? '' : ' ·\u00a0soon'}</div>
                <div className="lp-channel-desc">{ch.desc}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ═══ BOTTOM CTA ═══ */}
      <section className="lp-cta-section">
        <motion.div
          className="lp-cta-inner"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
        >
          <motion.h2 className="lp-cta-h2" variants={fade}>
            Finance, built around
            <br />
            <span className="lp-hero-accent">your intentions.</span>
          </motion.h2>
          <motion.p className="lp-cta-sub" variants={fade} custom={1}>
            Stop adapting to financial products. Let your money adapt to you.
          </motion.p>
          <motion.div variants={fade} custom={2}>
            <Link href="/login" className="lp-btn-primary lp-btn-lg">
              Get early access
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo">intend</div>
            <div className="lp-footer-tagline">Your money, executing your intentions.</div>
          </div>
          <div className="lp-footer-links">
            <a href="#how" className="lp-footer-link">How it works</a>
            <a href="#primitives" className="lp-footer-link">Capabilities</a>
            <Link href="/login" className="lp-footer-link">Sign in</Link>
          </div>
          <div className="lp-footer-bottom">
            <span className="lp-footer-copy">&copy; 2026 Intend</span>
            <span className="lp-footer-ver">v0.5</span>
          </div>
        </div>
      </footer>
    </>
  );
}

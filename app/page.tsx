import { CompanionsSection } from "@/components/landing/CompanionsSection";
import { PracticeBoard } from "@/components/landing/PracticeBoard";
import { DemoOrb } from "@/components/landing/DemoOrb";
import { Character } from "@/components/ui/Character";
import { APP_NAME } from "@/components/ui/brand";
import { LevelBadge } from "@/components/ui/LevelBadge";
import { Logo } from "@/components/ui/Logo";
import type { Level, Mood } from "@/lib/types";
import styles from "./page.module.css";

// ---- Copy. Everything on the page that is not the companion picker lives here. ----

const PROOF = ["Speak naturally, right in your browser", "Specific notes after every session", "No account needed to start"];

const AUDIENCES = [
  { who: "Students", what: "Rehearse internship and graduate interviews before the first real one." },
  { who: "Early-career professionals", what: "Practise case rounds, promotions and the conversations nobody trained you for." },
  { who: "Experienced professionals", what: "Sharpen pitches, presentations and difficult conversations under realistic pushback." },
];

const STEPS = [
  {
    title: "Choose",
    body: "Pick a companion and set the scene: the role you want, who you are pitching to, how tough they should be. Paste a job description or your own notes and the questions follow.",
  },
  {
    title: "Talk",
    body: "Speak out loud and your companion answers in real time, in a natural voice. Interrupt whenever you like, as you would in a real conversation. Prefer to type? You can.",
  },
  {
    title: "Get notes",
    body: "End the session and ask for notes. You get a clear level for each skill that matters in that scenario, plus numbers measured from what you actually said.",
  },
  {
    title: "Go again",
    body: "Change the difficulty or the scenario and repeat. Every session starts fresh, and signing in is optional if you want to keep a history.",
  },
];

const SKILL_LEVELS: { label: string; level: Level }[] = [
  { label: "Structure", level: "solid" },
  { label: "Relevance", level: "strong" },
  { label: "Conciseness", level: "needs-work" },
];

const CAST: { id: string; name: string; mood: Mood }[] = [
  { id: "interview", name: "Interview", mood: "neutral" },
  { id: "case", name: "Case", mood: "curious" },
  { id: "sales", name: "Sales", mood: "happy" },
  { id: "presentation", name: "Presentation", mood: "serious" },
  { id: "conversation", name: "Conversation", mood: "happy" },
  { id: "friend", name: "Friend", mood: "neutral" },
];

const CONTEXT_CHIPS = ["Job description", "Resume summary", "Product you are pitching", "Presentation topic", "Interviewer style", "Buyer type"];

const PRINCIPLES = [
  {
    title: "Speaking is the real skill",
    body: "An answer that reads well on paper can fall apart out loud. Practising aloud shows you the gaps before the real moment does.",
  },
  {
    title: "A partner who responds",
    body: "Follow-up questions, interruptions and pushback are what make real conversations hard. Your companion reacts to what you actually said, so you cannot coast on a script.",
  },
  {
    title: "Feedback you can act on",
    body: "Notes point to specific moments and say what to try instead. Each skill gets its own level, never a single vague score.",
  },
  {
    title: "Low stakes, high repetition",
    body: "Nobody is watching. Fail, restart and try a different approach as many times as you need, until the answer feels like yours.",
  },
];

const FAQ = [
  {
    q: "Do I need an account?",
    a: "No. You can practise as a guest. Signing in is optional and only adds saved history.",
  },
  {
    q: "Which browsers work?",
    a: "Voice input works best in Chrome on desktop and Android. In other browsers you can type your answers instead.",
  },
  {
    q: "Who hears my voice?",
    a: "Your browser's speech service turns your voice into text, and that text goes to AI providers to write the replies. Those providers may use it under their own terms.",
  },
  {
    q: "How reliable are the notes?",
    a: "The levels and tips are written by an AI model from the transcript, so treat them as guidance, not a verdict. The numbers (pace, filler words, talk share) are measured directly from what you said.",
  },
  {
    q: "Does it replace a human coach?",
    a: "No. It is a practice partner that is always available, so your time with people can go to the things only people can judge.",
  },
  {
    q: "What is the natural voice?",
    a: "A more human-sounding voice that downloads once to your browser (about 300 MB). Until it is ready, and on devices that cannot run it, the standard browser voice is used.",
  },
  {
    q: "Why does Friendly chat have no notes?",
    a: "It is meant to be relaxed: no levels, no stats, just a conversation.",
  },
];

// ---- Page ----

export default function Home() {

  return (
    <main>
      <nav className={styles.jump} aria-label="On this page">
        <a href="#mission">Our goal</a>
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <a href="#why">Why it works</a>
        <a href="#faq">FAQ</a>
        <a href="#companions" className={styles.jumpCta}>
          Start
        </a>
      </nav>

      <section className={`container ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <h1>Say it out loud before it counts.</h1>
          <p className={styles.lede}>
            {APP_NAME} is a voice practice space for interviews, pitches, case questions and everyday conversation. Talk
            with an AI companion in real time, then get clear, specific notes on how you came across.
          </p>
          <div className={styles.heroActions}>
            <a href="#companions" className="btn btn-primary">
              Start practising
            </a>
            <a href="#how" className={styles.textLink}>
              See how it works <span aria-hidden="true">&darr;</span>
            </a>
          </div>
        </div>
        <PracticeBoard className={styles.heroArt} />
        <ul className={styles.proof} aria-label="Highlights">
          {PROOF.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      <section id="companions" aria-labelledby="companions-heading" className={`container ${styles.companions}`}>
        <h2 id="companions-heading" className="sr-only">
          Choose a companion
        </h2>
        <CompanionsSection />
      </section>

      <section id="mission" aria-labelledby="mission-heading" className={`container ${styles.mission}`}>
        <h2 id="mission-heading" className={styles.statement}>
          Preparation should sound like the real thing.
        </h2>
        <div className={styles.missionBody}>
          <p>
            Most people prepare for an interview, a pitch or a hard conversation by reading advice and rehearsing in
            their head. But the moment that matters is spoken, with pauses, follow-up questions and nerves.
          </p>
          <p>
            {APP_NAME} gives you a realistic partner to practise with, so the first time you say your answer out loud is
            not the time it counts.
          </p>
        </div>
        <ul className={styles.audiences}>
          {AUDIENCES.map((a, i) => (
            <li key={a.who} className={styles.reveal} style={{ "--i": i } as React.CSSProperties}>
              <h3>{a.who}</h3>
              <p>{a.what}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="focus-heading" className={`container ${styles.focusWrap}`}>
        <div className={styles.focus}>
          <DemoOrb id="interview" className={styles.focusOrb} />
          <div className={styles.focusCopy}>
            <h2 id="focus-heading">One thing to look at.</h2>
            <p>
              In a real interview you look at the person asking the questions. So each companion is a single orb that
              moves with its own voice: calm when it listens, alive when it speaks. Nothing else on the screen
              competes for your eyes.
            </p>
            <ul className={styles.states}>
              <li>
                <DemoOrb id="interview" state="listening" className={styles.stateOrb} />
                <span>
                  <strong>Listening</strong>A quiet ring shows it is with you.
                </span>
              </li>
              <li>
                <DemoOrb id="interview" state="thinking" className={styles.stateOrb} />
                <span>
                  <strong>Thinking</strong>A slow ripple while it works out a reply.
                </span>
              </li>
              <li>
                <DemoOrb id="interview" state="speaking" className={styles.stateOrb} />
                <span>
                  <strong>Speaking</strong>The rim follows every syllable.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section id="how" aria-labelledby="how-heading" className={`container ${styles.section} ${styles.how}`}>
        <div className={styles.sectionHead}>
          <h2 id="how-heading">How a session works</h2>
          <p className={styles.sub}>From picking a companion to reading your notes takes about as long as a real conversation.</p>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={styles.reveal} style={{ "--i": i } as React.CSSProperties}>
              <span className={styles.stepNo} aria-hidden="true">
                {i + 1}
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <div className={styles.stepArt} aria-hidden="true">
                {i === 0 && (
                  <div className={styles.trio}>
                    <Character id="case" />
                    <Character id="interview" />
                    <Character id="sales" />
                  </div>
                )}
                {i === 1 && (
                  <div className={styles.talk}>
                    <DemoOrb id="conversation" className={styles.talkOrb} />
                    <span className={styles.bars}>
                      {Array.from({ length: 14 }, (_, b) => (
                        <i key={b} style={{ "--b": b } as React.CSSProperties} />
                      ))}
                    </span>
                  </div>
                )}
                {i === 2 && (
                  <div className={styles.badges}>
                    <LevelBadge level="strong" />
                    <LevelBadge level="solid" />
                    <LevelBadge level="needs-work" />
                  </div>
                )}
                {i === 3 && (
                  <div className={styles.again}>
                    <Character id="presentation" />
                    <Character id="presentation" />
                    <Character id="presentation" />
                    <Character id="presentation" />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" aria-labelledby="features-heading" className={`container ${styles.section}`}>
        <div className={styles.sectionHead}>
          <h2 id="features-heading">What you get</h2>
          <p className={styles.sub}>Everything is built around one idea: practise the way the real moment will feel.</p>
        </div>
        <div className={styles.bento}>
          <article className={`${styles.tile} ${styles.tCast} ${styles.reveal}`} style={{ "--i": 0 } as React.CSSProperties}>
            <h3>Six companions, six kinds of practice</h3>
            <p>
              Interview, case, sales, presentation, conversation and a friendly chat. Each has its own colour, movement,
              personality and settings, so a hostile panel and a shy conversation partner feel different.
            </p>
            <ul className={styles.cast} aria-hidden="true">
              {CAST.map((c) => (
                <li key={c.id}>
                  <Character id={c.id} mood={c.mood} className={styles.castBlob} />
                  <span>{c.name}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className={`${styles.tile} ${styles.tVoice} ${styles.reveal}`} style={{ "--i": 1 } as React.CSSProperties}>
            <h3>A real-time voice conversation</h3>
            <p>Speak and they answer straight away, in a natural voice. Interrupt at any time. You can type instead.</p>
            <figure className={styles.dialogue}>
              <blockquote>&ldquo;Tell me about a time a plan fell apart. What did you do next?&rdquo;</blockquote>
              <figcaption>Your companion</figcaption>
            </figure>
          </article>

          <article className={`${styles.tile} ${styles.tNotes} ${styles.reveal}`} style={{ "--i": 2 } as React.CSSProperties}>
            <h3>Notes that name what to fix</h3>
            <p>A level for each skill that matters in that scenario, with the moments behind it.</p>
            <ul className={styles.levels} aria-label="Example skill levels">
              {SKILL_LEVELS.map((d) => (
                <li key={d.label}>
                  <span>{d.label}</span>
                  <LevelBadge level={d.level} />
                </li>
              ))}
            </ul>
            <p className={styles.eg}>Example</p>
          </article>

          <article className={`${styles.tile} ${styles.tStats} ${styles.reveal}`} style={{ "--i": 3 } as React.CSSProperties}>
            <h3>Measured, not guessed</h3>
            <p>Pace, filler words and how much of the talking was you, counted from your own words.</p>
            <dl className={styles.stats}>
              <div>
                <dt>words per minute</dt>
                <dd>142</dd>
              </div>
              <div>
                <dt>filler words</dt>
                <dd>3</dd>
              </div>
              <div>
                <dt>talk share</dt>
                <dd>62%</dd>
              </div>
            </dl>
            <p className={styles.eg}>Example</p>
          </article>

          <article className={`${styles.tile} ${styles.tContext} ${styles.reveal}`} style={{ "--i": 4 } as React.CSSProperties}>
            <h3>Your context, built in</h3>
            <p>Add the details of your own situation and the conversation is shaped around them.</p>
            <ul className={styles.chips}>
              {CONTEXT_CHIPS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </article>

          <article className={`${styles.tile} ${styles.tPrivacy} ${styles.reveal}`} style={{ "--i": 5 } as React.CSSProperties}>
            <h3>Private by default</h3>
            <p>
              Practise as a guest and nothing is saved by us. Sign in only if you want a history, and delete it whenever
              you like.
            </p>
            <ul className={styles.checks}>
              <li>Guest sessions are not stored by us</li>
              <li>An account is optional and only adds history</li>
              <li>Delete one session or everything, any time</li>
            </ul>
          </article>
        </div>
      </section>

      <section id="why" aria-labelledby="why-heading" className={`container ${styles.section} ${styles.why}`}>
        <div className={styles.sectionHead}>
          <h2 id="why-heading">Why it works</h2>
          <p className={styles.sub}>
            The design follows how people actually get better at speaking: realistic practice, a partner that reacts, and
            feedback specific enough to use.
          </p>
        </div>
        <ul className={styles.principles}>
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} className={styles.reveal} style={{ "--i": i } as React.CSSProperties}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </li>
          ))}
        </ul>
        <p className={styles.honest}>
          We keep the line clear between what is measured and what is judged. Numbers come straight from your words.
          Everything else is the AI&apos;s read of the transcript, offered as guidance.
        </p>
      </section>

      <section id="faq" aria-labelledby="faq-heading" className={`container ${styles.section} ${styles.faq}`}>
        <h2 id="faq-heading">Good to know</h2>
        <div className={styles.faqList}>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="cta-heading" className={`container ${styles.closing}`}>
        <div className={`${styles.closingBand} ${styles.reveal}`}>
          <h2 id="cta-heading">Your next conversation starts here.</h2>
          <p>Pick a companion, say your answer out loud, and see exactly where to improve.</p>
          <a href="#companions" className="btn btn-primary">
            Start practising
          </a>
        </div>
      </section>

      <footer className={`container ${styles.footer}`}>
        <div className={styles.footerTop}>
          <div>
            <Logo />
            <p className="muted">Practise the conversation before it counts.</p>
          </div>
          <nav aria-label="Footer" className={styles.footerLinks}>
            <a href="#companions">Companions</a>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#why">Why it works</a>
            <a href="#faq">FAQ</a>
          </nav>
        </div>
        <p className={`muted ${styles.fine}`}>
          Your voice is processed by your browser&apos;s speech service. Text is sent to AI providers and may be used by
          them under their terms.
        </p>
      </footer>
    </main>
  );
}

// End-to-end smoke test against a running server: `npm run dev` in one terminal, `npm run smoke` in another.
// BASE_URL defaults to http://localhost:3000. Model checks need a real provider key; without one they are SKIPPED.

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LEVELS = ["needs-work", "solid", "strong"];
const TAGS = ["strength", "improve", "tip"];
const PRIVATE_KEYS = ["promptFragment", "promptLabel", "role"];
const NUMERIC_SCORE = /\b\d+(\.\d+)?\s*(\/|out of)\s*(5|10|100)\b|\b(score|rating|grade)\s*[:=]\s*\d/i;

const SKIP = Symbol("skip");
type Outcome = void | typeof SKIP;
let failed = 0;

async function check(name: string, fn: () => Promise<Outcome>) {
  try {
    const outcome = await fn();
    console.log(`${outcome === SKIP ? "SKIPPED" : "PASS   "}  ${name}${outcome === SKIP ? "  (no provider key configured on the server)" : ""}`);
  } catch (err) {
    failed++;
    console.log(`FAIL     ${name}\n         ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const post = (path: string, body: unknown) =>
  fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const selections = { type: "behavioral", style: "friendly", role: "Junior data analyst" };
const transcript = [
  { role: "assistant", content: "Welcome. This interview is for the junior data analyst role. Tell me about yourself.", t: 1500 },
  { role: "user", content: "Um, so, I just finished a statistics degree and I did a summer internship where I built sales dashboards.", t: 14_000 },
  { role: "assistant", content: "Tell me about a time you had to deal with messy data.", t: 16_000 },
  { role: "user", content: "During the internship the sales data had, like, duplicate customers. I wrote a script to merge them and the report totals finally matched finance.", t: 33_000 },
  { role: "assistant", content: "What would you do differently next time?", t: 35_000 },
  { role: "user", content: "I would basically ask about the data sources earlier, because I lost a week before I found out there were two systems.", t: 49_000 },
];

/** Deep search for keys that must never reach the client. */
function findPrivateKey(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map(findPrivateKey).find(Boolean);
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (PRIVATE_KEYS.includes(k)) return k;
      const inner = findPrivateKey(v);
      if (inner) return inner;
    }
  }
  return undefined;
}

async function main() {
  console.log(`Smoke test against ${BASE_URL}\n`);
  let noProvider = false;

  await check("GET /api/companions returns six public companions", async () => {
    const res = await fetch(`${BASE_URL}/api/companions`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const list: unknown = await res.json();
    assert(Array.isArray(list) && list.length === 6, "expected an array of six companions");
    const ids = list.map((c) => c.id).sort().join(",");
    assert(ids === "case,conversation,friend,interview,presentation,sales", `unexpected ids: ${ids}`);
    for (const c of list) {
      assert(typeof c.name === "string" && Array.isArray(c.groups) && typeof c.notes === "boolean", `bad shape for ${c.id}`);
    }
    assert(list.find((c) => c.id === "friend").notes === false, "friend must have notes=false");
    const leaked = findPrivateKey(list);
    assert(!leaked, `private key "${leaked}" is exposed`);
  });

  await check("POST /api/chat with a malformed body returns 400", async () => {
    for (const body of ["{not json", { companionId: "wizard", selections: {}, messages: [] }, { companionId: "interview" }]) {
      const res = await post("/api/chat", body);
      assert(res.status === 400, `expected 400, got ${res.status}`);
      assert(typeof (await res.json()).error === "string", "expected { error }");
    }
  });

  await check("POST /api/chat opens the conversation with streamed text", async () => {
    const res = await post("/api/chat", { companionId: "interview", selections, messages: [] });
    if (res.status === 503) {
      noProvider = true;
      return SKIP;
    }
    const text = await res.text();
    assert(res.status === 200, `expected 200, got ${res.status}: ${text}`);
    assert((res.headers.get("content-type") ?? "").startsWith("text/plain"), "expected text/plain");
    const lines = text.split("\n");
    if (lines[0].startsWith("MOOD:")) {
      const mood = lines.shift()!.slice(5).trim();
      assert(["neutral", "happy", "curious", "serious"].includes(mood), `unknown mood "${mood}"`);
    }
    assert(lines.join("\n").trim().length > 0, "reply text is empty");
  });

  await check("POST /api/notes for friend returns 404", async () => {
    const res = await post("/api/notes", { companionId: "friend", selections: {}, messages: transcript, durationMs: 55_000 });
    assert(res.status === 404, `expected 404, got ${res.status}`);
    assert(typeof (await res.json()).error === "string", "expected { error }");
  });

  await check("POST /api/notes returns a valid NotesResult for a 6-turn interview", async () => {
    const res = await post("/api/notes", { companionId: "interview", selections, messages: transcript, durationMs: 55_000 });
    const body = await res.text();
    assert(res.status === 200, `expected 200, got ${res.status}: ${body}`);
    const n = JSON.parse(body);

    // Measured stats come back with or without a model.
    const s = n.stats;
    assert(s && [s.userWords, s.wpm, s.fillerCount, s.talkRatio].every(Number.isFinite), "stats are missing or not finite");
    assert(s.userWords > 40 && s.talkRatio > 0 && s.talkRatio < 1 && s.fillerCount >= 3, `implausible stats: ${JSON.stringify(s)}`);
    assert(typeof n.summary === "string" && n.summary.length > 0, "summary is empty");
    assert(LEVELS.includes(n.overall), `overall is not a level: ${n.overall}`);
    assert(Array.isArray(n.notes) && n.notes.length >= 1 && n.notes.length <= 8, "expected 1-8 note cards");
    for (const [i, card] of n.notes.entries()) {
      assert(card.id === `n${i + 1}` && card.title && card.body, `bad note card at ${i}`);
      assert(Array.isArray(card.tags) && card.tags.length > 0 && card.tags.every((t: string) => TAGS.includes(t)), `bad tags at ${i}`);
    }

    // The route answers 200 with a stats-only fallback (no dimensions) when no model is available.
    if (noProvider && n.dimensions.length === 0) return SKIP;

    assert(
      n.dimensions.map((d: { label: string }) => d.label).join(",") === "Structure,Relevance,Conciseness,Confidence",
      "dimensions do not match the interview rubric (an empty list means the model call failed and the fallback was returned)",
    );
    for (const d of n.dimensions) assert(LEVELS.includes(d.level) && d.reason, `bad dimension ${d.label}`);
    assert(n.notes.length >= 4, "expected at least 4 note cards from the model");
    const judged = JSON.stringify({ summary: n.summary, dimensions: n.dimensions, notes: n.notes });
    assert(!NUMERIC_SCORE.test(judged), "found a numeric score in the notes");
  });

  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`Could not run the smoke test. Is the server running at ${BASE_URL}?\n${err instanceof Error ? err.message : err}`);
  process.exit(1);
});

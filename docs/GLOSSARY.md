# Glossary

The words this project uses, in code and in conversation. Use these names in new code, UI copy and docs.

| Term | Meaning |
|---|---|
| **Companion** | One of the six practice partners: a persona template plus a character and a voice. Defined in `lib/companions.ts`. |
| **Selections** | The option choices and free text the user sets on the setup page (`groupId -> choiceId or text`). |
| **Session** | One conversation from Start to End. Lives in the browser's `sessionStorage` (key `session:v1`); for a signed-in user it also becomes a saved session. |
| **Guest** | Someone using the app without signing in. Nothing of theirs is stored on the server. |
| **Account** | An optional sign-in by email magic link (Supabase Auth). Its only effect is history. Off entirely when Supabase is not configured. |
| **Saved session** | A finished session (setup choices, transcript, notes) stored in the `sessions` table for the account that had it. Types `SavedSession` and `SavedSessionSummary` in `lib/types.ts`. |
| **History** | The list of an account's saved sessions at `/history`, newest first, where they can be reopened or deleted. |
| **Turn / Message** | One user or companion utterance with a timestamp `t` (milliseconds since the session started). |
| **Character / Skin** | The cartoon animal artwork for a companion. An SVG component that implements the skin contract (named anchor points). |
| **Rig** | The shared animation logic (blink, breathe, lip-sync, poses) that animates any skin through its anchors. |
| **Voice** | A registry entry in `lib/voices.ts` that maps a voice id to a Kokoro voice and browser voice hints. |
| **Notes** | The one set of feedback generated on demand at session end, when the user presses "Get notes". |
| **Note card** | One item in the notes sidebar: a title, a body and tags (`strength`, `improve`, `tip`). |
| **Level** | A qualitative label: Needs work / Solid / Strong (`needs-work`, `solid`, `strong`). Never a number. |
| **Stats** | Numbers measured from the transcript, not judged by a model: words per minute, filler count, talk ratio. |
| **Rubric** | The per-companion feedback dimensions and their criteria. Data in `lib/rubrics.ts`. |

Related terms:

- **Dimension**: one row of a rubric (for example "Structure" for interviews), shown with a Level and a one-sentence reason.
- **Talk ratio**: the user's share of all words spoken in the session, from 0 to 1.
- **Filler**: a word that fills a pause ("um", "you know", a non-literal "like"). Counted by `lib/analysis.ts`.
- **HD voice**: the optional Kokoro text-to-speech voice that runs in the browser; the default is the browser's built-in voice.
- **Provider**: an LLM service behind `lib/llm.ts` (Gemini, Groq, Cerebras, NVIDIA NIM, OpenRouter, Bytez).
- **Magic link**: the one-time sign-in link emailed to a user; there are no passwords.
- **Row-level security**: the Postgres rules that let a signed-in user touch only their own saved sessions. The real access boundary for history.

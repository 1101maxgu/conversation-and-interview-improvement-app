import type { Voice } from "./types";

// One fixed voice per companion. Adding a voice is a data-only edit: add an entry here and
// point a companion's `voiceId` at it.
// `kokoroVoice` ids are from node_modules/kokoro-js/README.md (the af_/am_/bf_/bm_ voice table).
// `browserVoiceHints` are substrings of SpeechSynthesisVoice.name: Chrome desktop ("Google ..."),
// Edge ("Microsoft ..."), macOS/iOS ("Samantha", "Daniel", ...), Android ("English United States").
export const voices: Record<string, Voice> = {
  heart: {
    id: "heart",
    label: "Warm and bright",
    kokoroVoice: "af_heart",
    browserVoiceHints: ["Google US English", "Microsoft Aria", "Microsoft Jenny", "Samantha", "English United States"],
    rate: 1,
  },
  emma: {
    id: "emma",
    label: "Composed and precise",
    kokoroVoice: "bf_emma",
    browserVoiceHints: ["Google UK English Female", "Microsoft Sonia", "Microsoft Libby", "Kate", "Serena", "English United Kingdom"],
    rate: 1,
  },
  puck: {
    id: "puck",
    label: "Quick and lively",
    kokoroVoice: "am_puck",
    browserVoiceHints: ["Microsoft Guy", "Microsoft Andrew", "Alex", "Google US English", "English United States"],
    rate: 1,
  },
  michael: {
    id: "michael",
    label: "Even and analytical",
    kokoroVoice: "am_michael",
    browserVoiceHints: ["Microsoft Christopher", "Microsoft Eric", "Microsoft David", "Fred", "Google US English", "English United States"],
    rate: 1,
  },
  george: {
    id: "george",
    label: "Deep and steady",
    kokoroVoice: "bm_george",
    browserVoiceHints: ["Google UK English Male", "Microsoft Ryan", "Microsoft Thomas", "Daniel", "English United Kingdom"],
    rate: 1,
  },
  bella: {
    id: "bella",
    label: "Soft and easygoing",
    kokoroVoice: "af_bella",
    browserVoiceHints: ["Microsoft Ava", "Microsoft Michelle", "Google US English", "Karen", "Samantha", "English United States"],
    rate: 1,
  },
};

const DEFAULT_VOICE = "heart";

export function getVoice(id: string): Voice {
  return (Object.hasOwn(voices, id) && voices[id]) || voices[DEFAULT_VOICE];
}

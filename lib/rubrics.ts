// Feedback rubrics, one per companion that gives notes. Data only: edit the text here to change
// what the notes judge. The labels are shown on the results page, in this order.
import { CASE_STANDARD } from "@/lib/agents/case/knowledge";
import { CONVERSATION_STANDARD } from "@/lib/agents/conversation/knowledge";
import { GOOD_ANSWER_STANDARD } from "@/lib/agents/interview/knowledge";
import { PRESENTATION_STANDARD } from "@/lib/agents/presentation/knowledge";
import { SALES_STANDARD } from "@/lib/agents/sales/knowledge";
import type { CompanionId } from "@/lib/types";

export type Rubric = { dimensions: { label: string; criteria: string }[]; focus: string };

export const rubrics: Record<Exclude<CompanionId, "friend">, Rubric> = {
  interview: {
    focus: `How convincingly the candidate answers the questions asked, with structured, relevant, concise and confident answers. ${GOOD_ANSWER_STANDARD}`,
    dimensions: [
      {
        label: "Structure",
        criteria:
          "For questions about past experience, STAR: situation, task, action, result. Strong: answers set the scene briefly, spend most of the time on what the user personally did ('I', not only 'we'), and end with a concrete result or lesson. For other questions (motivation, technical, opinion), strong answers give the main point first and then one or two reasons or examples. Needs work: answers ramble, jump between points, stop at the situation, or never reach an outcome.",
      },
      {
        label: "Relevance",
        criteria:
          "Strong: each answer addresses the question that was asked and ties back to the role, company or job description when one was given. Needs work: answers drift to unrelated topics, dodge the question, stay generic where a specific example was requested, or stay vague until the interviewer has to ask a follow-up for the missing detail.",
      },
      {
        label: "Conciseness",
        criteria:
          "Strong: answers make their point and stop, with little repetition or filler. Needs work: very long turns, the same point repeated, long wind-ups before the point, or one-line answers that leave out necessary substance.",
      },
      {
        label: "Confidence",
        criteria:
          "Strong: direct statements, ownership ('I did', 'I decided'), claims backed by specifics. Needs work: heavy hedging ('I guess', 'maybe', 'sort of'), apologising, underselling own contribution, or trailing off unfinished.",
      },
    ],
  },
  sales: {
    focus: `How well the seller uncovers the buyer's need, makes the value clear, handles pushback and keeps the relationship warm. ${SALES_STANDARD}`,
    dimensions: [
      {
        label: "Value clarity",
        criteria:
          "Strong: says plainly what the product does for this buyer, links it to a need the buyer voiced, and uses a concrete outcome or example. Needs work: lists features without benefits, uses jargon, makes claims with no proof or example, or pitches before asking what the buyer cares about.",
      },
      {
        label: "Objection handling",
        criteria:
          "Strong: acknowledges the objection, asks a clarifying question, answers it directly, and checks whether it is resolved. Needs work: ignores or talks over objections, gets defensive, offers a discount before showing the value, or repeats the pitch unchanged.",
      },
      {
        label: "Rapport",
        criteria:
          "Strong: asks about the buyer's situation, reflects their words back, respects their time, and proposes a clear next step. Needs work: monologues, asks no questions, sounds scripted or pushy, or ends without a next step.",
      },
    ],
  },
  case: {
    focus: `How the candidate structures an ambiguous business problem, works through the numbers and lands a recommendation. ${CASE_STANDARD}`,
    dimensions: [
      {
        label: "Structure",
        criteria:
          "Strong: restates the question, asks clarifying questions, lays out a framework of distinct branches that fits this case before diving in, asks for specific data to test each branch, and says which branch comes next and why. Needs work: jumps straight to answers, recites a memorised framework that does not fit the case, lists ideas with no organisation, or loses track of the original question.",
      },
      {
        label: "Math",
        criteria:
          "Strong: states assumptions, talks through each calculation step, uses sensible round numbers and sanity-checks the result. Needs work: unstated assumptions, skipped steps, arithmetic slips left uncorrected even after being asked to walk through the calculation again, or avoiding the numbers. If the session contained no calculations, say so in the reason and use 'solid'.",
      },
      {
        label: "Synthesis",
        criteria:
          "Strong: ends with a clear recommendation first, backed by two or three findings, plus risks or next steps. Needs work: no conclusion, a summary that only repeats the analysis, or no 'so what' drawn from the numbers.",
      },
    ],
  },
  presentation: {
    focus: `How clearly and calmly the presenter handles audience questions after a talk. ${PRESENTATION_STANDARD}`,
    dimensions: [
      {
        label: "Clarity",
        criteria:
          "Strong: leads with the main point, uses plain language suited to the audience, and gives one concrete example. Needs work: buries the point, relies on unexplained jargon, or gives answers the audience would struggle to repeat back.",
      },
      {
        label: "Composure",
        criteria:
          "Strong: stays even under challenging or hostile questions, acknowledges the concern, and admits what is not known without getting flustered. Needs work: defensive or apologetic replies, sudden over-explaining, or giving up on an answer part-way.",
      },
      {
        label: "Answer quality",
        criteria:
          "Strong: answers the actual question, supports it with evidence or reasoning, and bridges back to the key message. Needs work: answers a different question, gives unsupported claims, or leaves the question unresolved.",
      },
    ],
  },
  conversation: {
    focus: `How naturally the user keeps an everyday conversation going: showing interest, listening and sharing the floor. ${CONVERSATION_STANDARD}`,
    dimensions: [
      {
        label: "Curiosity",
        criteria:
          "Strong: asks open questions and follow-ups that build on what the other person just said. Needs work: asks few or no questions, asks only yes/no questions, or changes the subject instead of following up.",
      },
      {
        label: "Listening",
        criteria:
          "Strong: refers back to details the other person mentioned, answers what was asked, and reacts to their feelings or news. Needs work: ignores what was said, repeats questions already answered, or steers every reply back to their own topic.",
      },
      {
        label: "Balance",
        criteria:
          "Strong: shares something of their own and then hands the conversation back, so both sides talk in roughly similar amounts. Needs work: long monologues, or very short replies that leave the other person to carry the conversation. Use the measured talk ratio as evidence.",
      },
    ],
  },
};

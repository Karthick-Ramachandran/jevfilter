/**
 * Offline providers for tests, demos, and evals. No network, no key.
 */
import type { ChoiceSpec, FilterProvider, ProviderAnswer } from "./provider.ts";

export type MockAnswer = string | { choice: string; probability?: number };

/**
 * Answers each question with a function you write. Return an option label, or
 * `undefined` to pick the first option. Useful for scripting exact scenarios in tests.
 *
 * ```ts
 * mockProvider(({ id }) => ({ intent: "filter", field_status: 'is "open"' })[id])
 * ```
 */
export function mockProvider(
  answer: (q: { id: string; question: ChoiceSpec; text: string }) => MockAnswer | undefined,
  name = "mock",
): FilterProvider<any> {
  return {
    name,
    async choose(request) {
      const answers: Record<string, ProviderAnswer> = {};
      for (const [id, question] of Object.entries(request.questions)) {
        const a = answer({ id, question, text: request.state.search_request });
        const labels = Object.keys(question.options);
        const choice = a === undefined ? labels[0]! : typeof a === "string" ? a : a.choice;
        const p = typeof a === "object" && a.probability !== undefined ? a.probability : 1;
        answers[id] = { choice, probabilities: { [choice]: p } };
      }
      return { answers };
    },
  };
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * A naive keyword baseline. It matches enum values and short synonyms from their descriptions,
 * and "not"/"except" before a value. It is not a language model. Use it to try the library
 * without a key and as the baseline in evals.
 */
export function keywordProvider(): FilterProvider<any> {
  return mockProvider(({ id, question, text }) => {
    const t = ` ${words(text).join(" ")} `;
    const labels = Object.keys(question.options);
    if (id === "intent") {
      return /\b(ignore|tenant|tenants|admin|delete|update|permission|permissions|other compan|count|how many)\b/.test(t) ? "other" : "filter";
    }
    if (id.startsWith("field_")) {
      const has = (phrase: string) => t.indexOf(` ${words(phrase).join(" ")} `);
      const negated = (idx: number) => /\b(not|except|excluding|without|non)\s*$/.test(t.slice(0, idx + 1));
      if (labels.includes("yes")) {
        const name = id.slice("field_".length).toLowerCase();
        const idx = t.search(new RegExp(`\\b${name.slice(0, Math.max(4, name.length - 2))}`));
        return idx < 0 ? "unspecified" : negated(idx - 1) ? "no" : "yes";
      }
      const hits: { label: string; neg: boolean }[] = [];
      for (const label of labels) {
        const m = /^is "(.*)"$/.exec(label);
        if (!m) continue;
        // The value itself, plus short comma-separated synonyms from its description.
        const synonyms = (/covers: (.*)$/.exec(question.options[label] ?? "")?.[1] ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter((x) => x && x.split(" ").length <= 2 && !x.startsWith("not "));
        for (const term of [m[1]!, ...synonyms]) {
          const idx = has(term);
          if (idx >= 0) {
            hits.push({ label, neg: negated(idx) });
            break;
          }
        }
      }
      if (hits.length === 0) return "unspecified";
      if (hits.length > 1 && t.includes(" or ")) return "several values";
      const h = hits[0]!;
      return h.neg ? `is not ${h.label.slice(3)}` : h.label;
    }
    if (id.startsWith("date_") || id.startsWith("number_")) return labels[0];
    if (id.startsWith("entity_")) {
      // Pick a capitalized phrase if there is one.
      const cap = labels.find((l) => /^phrase /.test(l) && /^"\p{Lu}/u.test(question.options[l] ?? ""));
      return cap ?? "none";
    }
    return undefined;
  }, "keyword-baseline");
}

/**
 * Jev provider (TypeSafe AI). Bring your own key: pass `apiKey` as a string, as a function of
 * the trusted request context (per-tenant keys), or leave it out to use TYPESAFE_API_KEY.
 * See ADR-0003.
 */
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  choice,
  RateLimitError,
  TypeSafeClient,
  type ChoiceQuestion,
} from "@typesafe-ai/sdk";
import { ProviderError, type FilterProvider, type ProviderAnswer } from "./provider.ts";

/** Pinned default. Upgrading the model changes interpretations: rerun your evals first. */
export const DEFAULT_JEV_MODEL = "jev-1.13.0";

export interface JevOptions<Ctx = unknown> {
  /**
   * Your Jev API key, or a function that returns one from the trusted server context
   * (for example, a key your customer stored in their workspace settings).
   * Default: the TYPESAFE_API_KEY environment variable.
   */
  apiKey?: string | ((context: Ctx) => string | Promise<string>);
  /** Use a pre-built client instead (custom fetch, logging, proxies). Ignores `apiKey`. */
  client?: TypeSafeClient;
  /** Model version. Default `jev-1.13.0`. */
  model?: string;
  /** API root. Default: TYPESAFE_BASE_URL, then https://api.typesafe.ai. */
  baseURL?: string;
  /** Timeout per attempt in ms. Default 5000. core's `timeoutMs` still caps the whole call. */
  timeout?: number;
  /** Retries after the first attempt. Default 1. */
  maxRetries?: number;
  /** Custom fetch (proxies, tests). Default: global fetch. */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

export function jev<Ctx = unknown>(options: JevOptions<Ctx> = {}): FilterProvider<Ctx> {
  const model = options.model ?? DEFAULT_JEV_MODEL;
  const timeout = options.timeout ?? 5_000;
  const maxRetries = options.maxRetries ?? 1;
  let shared: TypeSafeClient | undefined = options.client;

  const build = (apiKey: string | undefined) =>
    new TypeSafeClient({
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      defaultModel: model,
      timeout,
      retry: { maxRetries },
      ...(options.fetch ? { fetch: options.fetch } : {}),
      // Never log request bodies: they contain the user's search text.
      logLevel: "off",
    });

  async function clientFor(context: Ctx): Promise<TypeSafeClient> {
    if (shared) return shared;
    if (typeof options.apiKey === "function") {
      const key = await options.apiKey(context);
      if (typeof key !== "string" || key.trim() === "") {
        throw new ProviderError("No Jev API key for this request", { retryable: false });
      }
      // Per-request client: no cache of other people's keys in memory (ADR-0003).
      return build(key.trim());
    }
    try {
      shared = build(options.apiKey);
    } catch (e) {
      // Missing TYPESAFE_API_KEY and no apiKey. Keep the SDK message out of results.
      throw new ProviderError("Jev API key is not configured", { retryable: false, cause: e });
    }
    return shared;
  }

  return {
    name: "jev",
    model,
    async choose(request, { context, signal }) {
      const client = await clientFor(context);
      const questions: Record<string, ChoiceQuestion> = {};
      for (const [id, spec] of Object.entries(request.questions)) {
        questions[id] = choice(spec.instructions, spec.options);
      }
      try {
        const res = await client.systemOne({ state: request.state, questions, model }, { signal });
        const answers: Record<string, ProviderAnswer> = {};
        for (const [id, a] of Object.entries(res.answers)) {
          if (a && a.type === "choice") answers[id] = { choice: a.choice, probabilities: { ...a.probabilities } };
        }
        return {
          answers,
          model: res.model,
          usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
        };
      } catch (e) {
        if (e instanceof APITimeoutError) throw e; // core reports it as a timeout
        if (e instanceof APIUserAbortError) throw e;
        const retryable =
          e instanceof RateLimitError ||
          e instanceof APIConnectionError ||
          (e instanceof APIError && e.status >= 500);
        // Sanitized message: never echo keys, headers, or request bodies.
        const status = e instanceof APIError ? ` (HTTP ${e.status})` : "";
        throw new ProviderError(`Jev request failed${status}`, { retryable, cause: e });
      }
    },
  };
}

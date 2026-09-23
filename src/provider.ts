/**
 * The provider contract. Providers only answer closed multiple-choice questions, so no
 * provider output can become executable text. Core validates every answer against the
 * options it asked.
 */

export interface ChoiceSpec {
  /** Trusted instructions compiled from the server-side schema. */
  instructions: string;
  /** Option label → description. The answer must be one of these labels. */
  options: Record<string, string | null>;
}

export interface ProviderRequest {
  /** The untrusted user text, kept separate from instructions. */
  state: { search_request: string };
  /** Question id → question. Ids are stable: `intent`, `field_<name>`, `date_<i>`, `number_<i>`, `entity_<name>`. */
  questions: Record<string, ChoiceSpec>;
}

export interface ProviderAnswer {
  choice: string;
  /**
   * Probability per option label, 0 to 1. At minimum include the chosen label. If it is missing,
   * core treats the answer as unknown confidence (0), so non-default answers become
   * clarification questions instead of being accepted silently.
   */
  probabilities: Record<string, number>;
}

export interface ProviderResponse {
  answers: Record<string, ProviderAnswer>;
  model?: string;
  usage?: { inputTokens: number; outputTokens?: number };
}

export interface ProviderCallOptions<Ctx = unknown> {
  /** Trusted server context, used e.g. to pick a per-tenant API key. Never send it to a model. */
  context: Ctx;
  signal: AbortSignal;
}

export interface FilterProvider<Ctx = unknown> {
  readonly name: string;
  choose(request: ProviderRequest, options: ProviderCallOptions<Ctx>): Promise<ProviderResponse>;
}

/** Throw this from a provider to tell core whether a retry could help. */
export class ProviderError extends Error {
  readonly retryable: boolean;
  constructor(message: string, options: { retryable: boolean; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "ProviderError";
    this.retryable = options.retryable;
  }
}

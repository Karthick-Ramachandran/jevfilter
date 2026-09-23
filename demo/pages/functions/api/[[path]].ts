/**
 * Pages Function for /api/* (ADR-0009). It forwards the request unchanged to the API Worker through
 * a service binding. The Worker holds the Jev key, the rate limits and all the logic.
 */
interface Env {
  API: Fetcher;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => env.API.fetch(request);

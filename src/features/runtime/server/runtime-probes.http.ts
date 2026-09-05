import { readRuntimeIdentity } from "./runtime-identity";

export function handleGetHealth(): Response {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export function handleGetVersion(
  environment: Record<string, string | undefined> = process.env,
): Response {
  const identity = readRuntimeIdentity("web", environment);
  return Response.json(
    {
      releaseCommit: identity.releaseCommit,
      imageDigest: identity.imageDigest,
      buildId: identity.buildId,
      environment: identity.environment,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

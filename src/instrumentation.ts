import type { Instrumentation } from "next";

/** Structured server error logging (picked up by Vercel / any log drain). No request bodies or cookies are logged. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      msg: "request error",
      error: e.message,
      digest: e.digest,
      method: request.method,
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
};

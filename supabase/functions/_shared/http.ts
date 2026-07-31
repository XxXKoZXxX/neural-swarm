export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const preflight = (req: Request) =>
  req.method === "OPTIONS" ? new Response(null, { headers: CORS }) : null;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

export const jsonError = (message: string, status: number) => json({ error: message }, status);

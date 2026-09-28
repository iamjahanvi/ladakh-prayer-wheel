// The worldwide turn count. GET returns the total; POST { n } adds a small
// batch of turns (capped in the database) and returns the new total. The
// secret key stays here, so browsers never talk to the database directly.

const base = () => `${process.env.SUPABASE_URL}/rest/v1`;
const headers = () => ({
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
});
const json = (body, status = 200, cache = 'no-store') =>
    Response.json(body, { status, headers: { 'Cache-Control': cache } });

export async function GET() {
    const r = await fetch(`${base()}/turns?id=eq.1&select=total`, { headers: headers() });
    if (!r.ok) return json({ error: 'unavailable' }, 502);
    const [row] = await r.json();
    // A few seconds at the edge keeps many visitors from each reaching the database.
    return json({ total: Number(row?.total ?? 0) }, 200, 'public, s-maxage=5, stale-while-revalidate=30');
}

export async function POST(request) {
    // Sent with sendBeacon too, which posts plain text.
    let n = 0;
    try { n = Math.floor(Number(JSON.parse(await request.text()).n)); } catch { /* ignored below */ }
    if (!Number.isFinite(n) || n < 1) return json({ error: 'bad request' }, 400);
    const r = await fetch(`${base()}/rpc/add_turns`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ n: Math.min(n, 40) }),
    });
    if (!r.ok) return json({ error: 'unavailable' }, 502);
    return json({ total: Number(await r.json()) });
}

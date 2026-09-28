// Likes on gallery photos. GET returns every photo's count; POST
// { photo, visitor, liked } likes or unlikes one photo for one visitor and
// returns its new count. The visitor's IP is only ever stored as a salted
// hash, used to cap likes from one network (see supabase/likes.sql).
import { createHash } from 'node:crypto';

const base = () => `${process.env.SUPABASE_URL}/rest/v1`;
const headers = () => ({
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
});
const json = (body, status = 200, cache = 'no-store') =>
    Response.json(body, { status, headers: { 'Cache-Control': cache } });

const PHOTO = /^[a-z0-9-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
    const r = await fetch(`${base()}/rpc/like_counts`, { method: 'POST', headers: headers(), body: '{}' });
    if (!r.ok) return json({ error: 'unavailable' }, 502);
    const counts = Object.fromEntries((await r.json()).map(row => [row.photo, Number(row.n)]));
    return json({ counts }, 200, 'public, s-maxage=5, stale-while-revalidate=10');
}

export async function POST(request) {
    let body = {};
    try { body = JSON.parse(await request.text()); } catch { /* checked below */ }
    const { photo, visitor, liked } = body;
    if (!PHOTO.test(photo ?? '') || !UUID.test(visitor ?? '') || typeof liked !== 'boolean') {
        return json({ error: 'bad request' }, 400);
    }
    // Only the live site counts; local and preview versions answer as if the
    // like were saved, without saving it.
    if (process.env.VERCEL_ENV !== 'production') {
        const r = await fetch(`${base()}/rpc/like_counts`, { method: 'POST', headers: headers(), body: '{}' });
        const rows = r.ok ? await r.json() : [];
        const n = Number(rows.find(row => row.photo === photo)?.n ?? 0);
        return json({ photo, count: liked ? n + 1 : n });
    }
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const h = createHash('sha256').update(`${process.env.SUPABASE_JWT_SECRET}:${ip}`).digest('hex').slice(0, 32);
    const r = await fetch(`${base()}/rpc/like_photo`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ p: photo, v: visitor, liked, h }),
    });
    if (!r.ok) return json({ error: 'unavailable' }, 502);
    return json({ photo, count: Number(await r.json()) });
}

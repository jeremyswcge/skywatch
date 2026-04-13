// Netlify Function — Webcams API proxy
const fetch = require('node-fetch');

const cache = new Map();
const TTL = 3600_000;

function mapCat(cats) {
  const m = { beach:'beach', city:'city', mountain:'mountain', nature:'nature',
              forest:'nature', lake:'nature', harbor:'city', ski:'mountain' };
  for (const c of cats) { if (m[c]) return m[c]; }
  return 'city';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  try {
    const windyKey = process.env.WINDY_API_KEY;
    if (!windyKey) return { statusCode: 503, body: JSON.stringify({ error: 'Clé Windy manquante', fallback: true }) };

    const p = event.queryStringParameters || {};
    let { lat, lng, radius, q, limit, offset } = p;
    radius = radius || 50; limit = Math.min(parseInt(limit || 50), 50); offset = parseInt(offset || 0);

    // Geocode si recherche textuelle
    if (q && (!lat || !lng)) {
      const owKey = process.env.OPENWEATHER_API_KEY;
      if (owKey) {
        const gr = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${owKey}`);
        const gd = await gr.json();
        if (gd?.length > 0) { lat = gd[0].lat; lng = gd[0].lon; }
      }
    }

    const params = new URLSearchParams({ limit, offset, include: 'location,player,urls' });
    if (lat && lng) params.set('nearby', `${lat},${lng},${radius}`);

    const ck = `wc:${params.toString()}`;
    const c = cache.get(ck);
    if (c && Date.now() < c.exp) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }, body: JSON.stringify(c.data) };
    }

    const resp = await fetch(`https://api.windy.com/webcams/api/v3/webcams?${params}`, {
      headers: { 'x-windy-api-key': windyKey },
    });
    if (!resp.ok) throw new Error(`Windy ${resp.status}`);
    const data = await resp.json();

    const webcams = (data.webcams || []).map(w => ({
      id: `windy_${w.webcamId}`, name: w.title || '', city: w.location?.city || '',
      country: w.location?.country || '', continent: w.location?.continent || '',
      lat: w.location?.latitude, lng: w.location?.longitude,
      category: mapCat(w.categories || []), status: w.status === 'active' ? 'online' : 'offline',
      embed: w.player?.day?.embed || '', thumbnail: w.urls?.current?.desktop || '',
    }));

    const result = { webcams, total: data.total || webcams.length, offset };
    cache.set(ck, { data: result, exp: Date.now() + TTL });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' }, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Erreur webcams', fallback: true }) };
  }
};

// ══════════════════════════════════════════════
// Vercel Serverless — /api/webcams
// ══════════════════════════════════════════════

const cache = new Map();
const CACHE_TTL = 3600_000; // 1h

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.exp) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  cache.set(key, { data, exp: Date.now() + CACHE_TTL });
}

function mapCategory(categories) {
  const m = { beach:'beach', city:'city', mountain:'mountain', nature:'nature',
              forest:'nature', lake:'nature', landscape:'nature', harbor:'city',
              airport:'city', traffic:'city', ski:'mountain', sportarea:'mountain' };
  for (const c of (categories || [])) { if (m[c]) return m[c]; }
  return 'city';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const windyKey = process.env.WINDY_API_KEY;
    if (!windyKey) {
      return res.status(503).json({ error: 'Clé Windy manquante', fallback: true });
    }

    const { lat, lng, radius = 50, country, limit = 50, offset = 0, q, orderby } = req.query;

    // Si recherche textuelle, géocoder d'abord via OpenWeather
    let searchLat = lat, searchLon = lng;
    if (q && (!lat || !lng)) {
      const owKey = process.env.OPENWEATHER_API_KEY;
      if (owKey) {
        const gc = new AbortController();
        const gt = setTimeout(() => gc.abort(), 5000);
        try {
          const geoResp = await fetch(
            `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${owKey}`,
            { signal: gc.signal }
          );
          clearTimeout(gt);
          const geoData = await geoResp.json();
          if (geoData && geoData.length > 0) {
            searchLat = geoData[0].lat;
            searchLon = geoData[0].lon;
          }
        } catch { clearTimeout(gt); }
      }
    }

    const params = new URLSearchParams();
    params.set('limit', Math.min(parseInt(limit), 50));
    params.set('offset', parseInt(offset));
    params.set('include', 'location,player,urls');
    if (orderby) params.set('orderby', orderby);
    // Windy API: radius max = 250 km
    const safeRadius = Math.min(parseInt(radius) || 50, 250);
    if (searchLat && searchLon) params.set('nearby', `${searchLat},${searchLon},${safeRadius}`);
    if (country) params.set('country', country.toUpperCase());

    const cacheKey = `wc:${params.toString()}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const url = `https://api.windy.com/webcams/api/v3/webcams?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      headers: { 'x-windy-api-key': windyKey },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`Windy ${response.status}: ${await response.text()}`);
    const data = await response.json();

    const webcams = (data.webcams || []).map(w => ({
      id: `windy_${w.webcamId}`,
      name: w.title || 'Sans titre',
      city: w.location?.city || '',
      country: w.location?.country || '',
      continent: w.location?.continent || '',
      lat: w.location?.latitude,
      lng: w.location?.longitude,
      category: mapCategory(w.categories),
      status: w.status === 'active' ? 'online' : 'offline',
      embed: `https://webcams.windy.com/webcams/public/embed/player/${w.webcamId}/day`,
      thumbnail: w.urls?.current?.desktop || w.urls?.current?.mobile || '',
    }));

    const result = { webcams, total: data.total || webcams.length, offset: parseInt(offset) };
    setCache(cacheKey, result);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.json(result);

  } catch (err) {
    console.error('[Webcams]', err.message);
    res.status(502).json({ error: 'Erreur webcams', fallback: true });
  }
};

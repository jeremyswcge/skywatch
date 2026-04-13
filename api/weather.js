// ══════════════════════════════════════════════
// Vercel Serverless — /api/weather
// ══════════════════════════════════════════════

function isRealKey(k) {
  if (!k) return false;
  return !['your_','xxx','changeme','replace','placeholder','test','demo','example'].some(p => k.toLowerCase().includes(p));
}

// Cache en mémoire (persiste le temps du cold start ~5min)
const cache = new Map();
const CACHE_TTL = 600_000; // 10 min

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.exp) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(key, { data, exp: Date.now() + CACHE_TTL });
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

    const key = process.env.OPENWEATHER_API_KEY;
    if (!isRealKey(key)) return res.status(503).json({ error: 'Clé API manquante', fallback: true });

    const cacheKey = `w:${parseFloat(lat).toFixed(2)}:${parseFloat(lon).toFixed(2)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${key}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`OW ${resp.status}`);
    const data = await resp.json();

    const result = {
      temp: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      temp_min: Math.round(data.main.temp_min),
      temp_max: Math.round(data.main.temp_max),
      humidity: data.main.humidity,
      description: data.weather[0]?.description || '',
      icon: data.weather[0]?.icon || '01d',
      wind_speed: Math.round((data.wind?.speed || 0) * 3.6),
      clouds: data.clouds?.all || 0,
      visibility: data.visibility ? Math.round(data.visibility / 1000) : null,
      city: data.name,
      country: data.sys?.country,
    };

    setCache(cacheKey, result);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(result);

  } catch (err) {
    console.error('[Weather]', err.message);
    res.status(502).json({ error: 'Erreur météo', fallback: true });
  }
};

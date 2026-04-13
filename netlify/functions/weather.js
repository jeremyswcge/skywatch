// Netlify Function — Weather API proxy
const fetch = require('node-fetch');

const cache = new Map();
const TTL = 600_000;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  try {
    const { lat, lon } = event.queryStringParameters || {};
    if (!lat || !lon) return { statusCode: 400, body: JSON.stringify({ error: 'lat et lon requis' }) };

    const key = process.env.OPENWEATHER_API_KEY;
    if (!key) return { statusCode: 503, body: JSON.stringify({ error: 'Clé manquante', fallback: true }) };

    const ck = `w:${parseFloat(lat).toFixed(2)}:${parseFloat(lon).toFixed(2)}`;
    const c = cache.get(ck);
    if (c && Date.now() < c.exp) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }, body: JSON.stringify(c.data) };
    }

    const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${key}`);
    if (!resp.ok) throw new Error(`OW ${resp.status}`);
    const d = await resp.json();

    const result = {
      temp: Math.round(d.main.temp), feels_like: Math.round(d.main.feels_like),
      humidity: d.main.humidity, description: d.weather[0]?.description || '',
      icon: d.weather[0]?.icon || '01d', wind_speed: Math.round((d.wind?.speed || 0) * 3.6),
      clouds: d.clouds?.all || 0, city: d.name, country: d.sys?.country,
    };

    cache.set(ck, { data: result, exp: Date.now() + TTL });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' }, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Erreur météo', fallback: true }) };
  }
};

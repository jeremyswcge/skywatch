// ══════════════════════════════════════════════════════════════
// SKYWATCH — Backend Server
// Express + Cache intelligent + Rate limiting + API proxying
// ══════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIGURATION ───────────────────────────────────────────
function isRealKey(key) {
  if (!key) return false;
  const placeholders = ['your_', 'xxx', 'changeme', 'replace', 'placeholder', 'test', 'demo', 'example'];
  return !placeholders.some(p => key.toLowerCase().includes(p));
}

const CONFIG = {
  openweatherKey: isRealKey(process.env.OPENWEATHER_API_KEY) ? process.env.OPENWEATHER_API_KEY : '',
  windyKey: isRealKey(process.env.WINDY_API_KEY) ? process.env.WINDY_API_KEY : '',
  cacheTTL: {
    weather: parseInt(process.env.CACHE_TTL_WEATHER) || 600,   // 10 min
    webcams: parseInt(process.env.CACHE_TTL_WEBCAMS) || 3600,  // 1h
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

// ─── CACHE IN-MEMORY ─────────────────────────────────────────
// Cache LRU simple avec TTL — production : remplacer par Redis
class MemoryCache {
  constructor(maxSize = 500) {
    this.store = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data, ttlSeconds) {
    // Éviction LRU si plein
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now(),
    });
  }

  clear() {
    this.store.clear();
  }

  stats() {
    let valid = 0, expired = 0;
    for (const [, entry] of this.store) {
      if (Date.now() > entry.expiresAt) expired++;
      else valid++;
    }
    return { total: this.store.size, valid, expired };
  }
}

const cache = new MemoryCache(500);

// ─── MIDDLEWARE ───────────────────────────────────────────────

// Sécurité HTTP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "*.basemaps.cartocdn.com", "*.tile.openstreetmap.org", "images-webcams.windy.com"],
      frameSrc: ["'self'", "www.youtube.com", "youtube.com", "webcams.windy.com", "*.earthcam.com"],
      connectSrc: ["'self'"],
    },
  },
}));

// CORS
app.use(cors({ origin: CONFIG.corsOrigin }));

// Rate limiting global
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans quelques minutes.' },
});
app.use('/api/', limiter);

// Rate limiting strict pour les APIs externes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Limite API atteinte, réessayez dans 1 minute.' },
});

// JSON parsing
app.use(express.json());

// Fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Logging minimal
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const cached = res.getHeader('X-Cache') === 'HIT';
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)${cached ? ' [CACHE]' : ''}`);
    });
  }
  next();
});


// ══════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════

// ─── GET /api/weather ────────────────────────────────────────
// Météo en temps réel via OpenWeather
// Query: ?lat=48.85&lon=2.29 ou ?lat=48.85&lon=2.29&units=metric
app.get('/api/weather', apiLimiter, async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Paramètres lat et lon requis' });
    }

    // Vérification clé API
    if (!CONFIG.openweatherKey) {
      return res.status(503).json({
        error: 'Clé OpenWeather non configurée',
        fallback: true,
      });
    }

    // Arrondir les coords pour optimiser le cache (± ~1km)
    const cacheKey = `weather:${parseFloat(lat).toFixed(2)}:${parseFloat(lon).toFixed(2)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Appel OpenWeather
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${CONFIG.openweatherKey}`;
    const response = await fetch(url, { timeout: 5000 });

    if (!response.ok) {
      throw new Error(`OpenWeather API error: ${response.status}`);
    }

    const data = await response.json();

    // Formater la réponse
    const result = {
      temp: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      temp_min: Math.round(data.main.temp_min),
      temp_max: Math.round(data.main.temp_max),
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      description: data.weather[0]?.description || '',
      icon: data.weather[0]?.icon || '01d',
      wind_speed: Math.round((data.wind?.speed || 0) * 3.6), // m/s → km/h
      wind_deg: data.wind?.deg || 0,
      clouds: data.clouds?.all || 0,
      visibility: data.visibility ? Math.round(data.visibility / 1000) : null,
      sunrise: data.sys?.sunrise,
      sunset: data.sys?.sunset,
      city: data.name,
      country: data.sys?.country,
      timestamp: Date.now(),
    };

    // Mettre en cache
    cache.set(cacheKey, result, CONFIG.cacheTTL.weather);
    res.set('X-Cache', 'MISS');
    res.json(result);

  } catch (err) {
    console.error('[Weather Error]', err.message);
    res.status(502).json({ error: 'Impossible de récupérer la météo', fallback: true });
  }
});

// ─── GET /api/weather/batch ──────────────────────────────────
// Météo pour plusieurs positions en une seule requête
// Body: { positions: [{lat, lon, id}, ...] }
app.post('/api/weather/batch', apiLimiter, async (req, res) => {
  try {
    const { positions } = req.body;
    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ error: 'Tableau positions requis' });
    }

    if (!CONFIG.openweatherKey) {
      return res.status(503).json({ error: 'Clé OpenWeather non configurée', fallback: true });
    }

    // Limiter à 20 positions par batch
    const batch = positions.slice(0, 20);
    const results = {};

    await Promise.allSettled(batch.map(async (pos) => {
      const cacheKey = `weather:${parseFloat(pos.lat).toFixed(2)}:${parseFloat(pos.lon).toFixed(2)}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        results[pos.id] = cached;
        return;
      }

      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${pos.lat}&lon=${pos.lon}&units=metric&lang=fr&appid=${CONFIG.openweatherKey}`;
        const resp = await fetch(url, { timeout: 5000 });
        if (resp.ok) {
          const data = await resp.json();
          const result = {
            temp: Math.round(data.main.temp),
            feels_like: Math.round(data.main.feels_like),
            humidity: data.main.humidity,
            description: data.weather[0]?.description || '',
            icon: data.weather[0]?.icon || '01d',
            wind_speed: Math.round((data.wind?.speed || 0) * 3.6),
            city: data.name,
          };
          cache.set(cacheKey, result, CONFIG.cacheTTL.weather);
          results[pos.id] = result;
        }
      } catch (e) { /* skip failed */ }
    }));

    res.json({ results, count: Object.keys(results).length });
  } catch (err) {
    console.error('[Weather Batch Error]', err.message);
    res.status(502).json({ error: 'Erreur batch météo' });
  }
});


// ─── GET /api/webcams ────────────────────────────────────────
// Webcams via Windy API v3
// Query: ?lat=48.85&lng=2.29&radius=50 (km)
//        ?country=FR
//        ?category=city
//        ?limit=50&offset=0
app.get('/api/webcams', apiLimiter, async (req, res) => {
  try {
    if (!CONFIG.windyKey) {
      return res.status(503).json({
        error: 'Clé Windy non configurée — données de démonstration utilisées',
        fallback: true,
      });
    }

    const { lat, lng, radius = 50, country, category, limit = 50, offset = 0 } = req.query;

    // Construire la requête Windy
    let endpoint = 'https://api.windy.com/webcams/api/v3/webcams';
    const params = new URLSearchParams();
    params.set('limit', Math.min(parseInt(limit), 50));
    params.set('offset', parseInt(offset));
    params.set('include', 'location,player,urls');

    if (lat && lng) {
      params.set('nearby', `${lat},${lng},${radius}`);
    }
    if (country) {
      params.set('country', country.toUpperCase());
    }
    if (category) {
      params.set('category', category);
    }

    const cacheKey = `webcams:${params.toString()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    const url = `${endpoint}?${params.toString()}`;
    const response = await fetch(url, {
      headers: { 'x-windy-api-key': CONFIG.windyKey },
      timeout: 8000,
    });

    if (!response.ok) {
      throw new Error(`Windy API error: ${response.status}`);
    }

    const data = await response.json();

    // Transformer les données
    const webcams = (data.webcams || []).map(w => ({
      id: `windy_${w.webcamId}`,
      name: w.title || 'Sans titre',
      city: w.location?.city || '',
      country: w.location?.country || '',
      continent: w.location?.continent || '',
      lat: w.location?.latitude,
      lng: w.location?.longitude,
      category: mapWindyCategory(w.categories || []),
      status: w.status === 'active' ? 'online' : 'offline',
      embed: w.player?.day?.embed || w.player?.lifetime?.embed || '',
      thumbnail: w.urls?.current?.desktop || w.urls?.current?.preview || '',
      lastUpdate: w.lastUpdatedOn,
    }));

    const result = {
      webcams,
      total: data.total || webcams.length,
      offset: parseInt(offset),
      limit: parseInt(limit),
    };

    cache.set(cacheKey, result, CONFIG.cacheTTL.webcams);
    res.set('X-Cache', 'MISS');
    res.json(result);

  } catch (err) {
    console.error('[Webcams Error]', err.message);
    res.status(502).json({ error: 'Impossible de récupérer les webcams', fallback: true });
  }
});

// ─── GET /api/webcams/search ─────────────────────────────────
// Recherche textuelle de webcams
app.get('/api/webcams/search', apiLimiter, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Paramètre q requis (min 2 caractères)' });
    }

    if (!CONFIG.windyKey) {
      return res.status(503).json({ error: 'Clé Windy non configurée', fallback: true });
    }

    const cacheKey = `search:${q.toLowerCase().trim()}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Windy API v3 n'a pas de recherche textuelle directe,
    // on utilise country ou nearby comme fallback
    // Pour une vraie recherche, on peut utiliser un geocoder d'abord
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${CONFIG.openweatherKey}`;
    const geoResp = await fetch(geoUrl, { timeout: 5000 });
    const geoData = await geoResp.json();

    if (!geoData || geoData.length === 0) {
      return res.json({ webcams: [], total: 0 });
    }

    const { lat, lon } = geoData[0];
    const webcamUrl = `https://api.windy.com/webcams/api/v3/webcams?nearby=${lat},${lon},100&limit=${Math.min(parseInt(limit), 50)}&include=location,player,urls`;

    const wcResp = await fetch(webcamUrl, {
      headers: { 'x-windy-api-key': CONFIG.windyKey },
      timeout: 8000,
    });

    if (!wcResp.ok) throw new Error(`Windy error: ${wcResp.status}`);
    const wcData = await wcResp.json();

    const webcams = (wcData.webcams || []).map(w => ({
      id: `windy_${w.webcamId}`,
      name: w.title || 'Sans titre',
      city: w.location?.city || '',
      country: w.location?.country || '',
      lat: w.location?.latitude,
      lng: w.location?.longitude,
      category: mapWindyCategory(w.categories || []),
      status: w.status === 'active' ? 'online' : 'offline',
      embed: w.player?.day?.embed || '',
      thumbnail: w.urls?.current?.desktop || '',
    }));

    const result = { webcams, total: wcData.total || webcams.length, query: q };
    cache.set(cacheKey, result, CONFIG.cacheTTL.webcams);
    res.set('X-Cache', 'MISS');
    res.json(result);

  } catch (err) {
    console.error('[Search Error]', err.message);
    res.status(502).json({ error: 'Erreur de recherche', fallback: true });
  }
});


// ─── GET /api/status ─────────────────────────────────────────
// Health check + statut cache
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    apis: {
      openweather: CONFIG.openweatherKey ? 'configured' : 'missing',
      windy: CONFIG.windyKey ? 'configured' : 'missing',
    },
    cache: cache.stats(),
    uptime: Math.round(process.uptime()),
  });
});

// ─── GET /api/cache/clear ────────────────────────────────────
// Vider le cache (admin)
app.post('/api/cache/clear', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache vidé', stats: cache.stats() });
});


// ─── HELPERS ─────────────────────────────────────────────────
function mapWindyCategory(categories) {
  const catMap = {
    'beach': 'beach',
    'city': 'city',
    'mountain': 'mountain',
    'nature': 'nature',
    'forest': 'nature',
    'lake': 'nature',
    'landscape': 'nature',
    'water': 'nature',
    'harbor': 'city',
    'airport': 'city',
    'traffic': 'city',
    'sportarea': 'mountain',
    'ski': 'mountain',
  };
  for (const cat of categories) {
    if (catMap[cat]) return catMap[cat];
  }
  return 'city';
}


// ─── CATCH-ALL → Frontend ────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ─── ERROR HANDLER ───────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Erreur serveur interne' });
});


// ─── START ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║         SKYWATCH — Server v2.0           ║
  ║──────────────────────────────────────────║
  ║  🌐  http://localhost:${PORT}               ║
  ║  📡  OpenWeather: ${CONFIG.openweatherKey ? '✅ OK' : '❌ Manquante'}            ║
  ║  🎥  Windy:       ${CONFIG.windyKey ? '✅ OK' : '❌ Manquante'}            ║
  ╚══════════════════════════════════════════╝
  `);
});

module.exports = app;

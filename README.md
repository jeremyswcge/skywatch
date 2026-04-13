# 🛰 SKYWATCH — Global Webcam Explorer

> Explorez des webcams en direct du monde entier avec météo temps réel, carte interactive et design immersif.

![Version](https://img.shields.io/badge/version-2.0.0-cyan)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## ⚡ Démarrage rapide

### 1. Cloner & installer

```bash
git clone https://github.com/votre-user/skywatch.git
cd skywatch
npm install
```

### 2. Configurer les clés API

```bash
cp .env.example .env
```

Éditez `.env` et ajoutez vos clés :

| API | Gratuit | Lien d'inscription |
|-----|---------|---------------------|
| **OpenWeather** | ✅ 1000 appels/jour | [openweathermap.org/api](https://openweathermap.org/api) |
| **Windy Webcams** | ✅ 1000 appels/jour | [api.windy.com](https://api.windy.com) |

> **Sans clé API ?** L'app fonctionne en mode démo avec 42 webcams intégrées.

### 3. Lancer

```bash
npm start
# → http://localhost:3000
```

---

## 🏗 Architecture du projet

```
skywatch/
├── server.js              # Backend Express (cache, rate limit, API proxy)
├── package.json
├── .env.example            # Template de configuration
├── vercel.json             # Config déploiement Vercel
├── netlify.toml            # Config déploiement Netlify
│
├── api/                    # Serverless functions (Vercel)
│   ├── weather.js          # Proxy OpenWeather
│   └── webcams.js          # Proxy Windy Webcams
│
├── netlify/functions/      # Serverless functions (Netlify)
│   ├── weather.js
│   └── webcams.js
│
└── public/
    └── index.html          # Frontend complet (SPA)
```

---

## 🔑 APIs utilisées

### OpenWeather API (météo temps réel)
- **Endpoint** : `api.openweathermap.org/data/2.5/weather`
- **Données** : température, ressenti, humidité, vent, nuages, visibilité
- **Gratuit** : 1000 appels/jour, pas de carte de crédit requise
- **Inscription** : [openweathermap.org/api](https://openweathermap.org/api)
- **Cache** : 10 minutes (configurable via `CACHE_TTL_WEATHER`)

### Windy Webcams API v3
- **Endpoint** : `api.windy.com/webcams/api/v3/webcams`
- **Données** : position, flux vidéo, thumbnails, catégories
- **Gratuit** : 1000 appels/jour
- **Inscription** : [api.windy.com](https://api.windy.com)
- **Cache** : 1 heure (configurable via `CACHE_TTL_WEBCAMS`)

### Autres services (frontend, pas de clé requise)
- **Leaflet.js** : carte interactive open source
- **CartoDB Dark Matter** : tuiles de carte sombres (gratuit)
- **YouTube Embeds** : flux vidéo publics (données de démonstration)

---

## 🚀 Déploiement

### Option A : Vercel (recommandé)

```bash
# 1. Installer Vercel CLI
npm i -g vercel

# 2. Déployer
vercel

# 3. Ajouter les variables d'environnement
vercel env add OPENWEATHER_API_KEY
vercel env add WINDY_API_KEY

# 4. Redéployer
vercel --prod
```

Les fonctions `api/weather.js` et `api/webcams.js` sont automatiquement détectées comme serverless functions.

### Option B : Netlify

```bash
# 1. Installer Netlify CLI
npm i -g netlify-cli

# 2. Déployer
netlify deploy --prod

# 3. Ajouter les variables dans le dashboard Netlify
# Settings → Environment variables → OPENWEATHER_API_KEY, WINDY_API_KEY
```

Les fonctions `netlify/functions/*.js` sont automatiquement déployées.

### Option C : VPS / Serveur classique

```bash
# Avec PM2 (recommandé)
npm install -g pm2
pm2 start server.js --name skywatch
pm2 save

# Ou avec systemd
# Créer un service systemd pointant vers `node /path/to/skywatch/server.js`
```

### Option D : Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t skywatch .
docker run -p 3000:3000 --env-file .env skywatch
```

---

## 🔒 Sécurité

- ✅ Les clés API ne sont **jamais exposées** côté client
- ✅ Rate limiting : 200 req/15min (global), 30 req/min (API)
- ✅ Headers de sécurité via Helmet.js
- ✅ CORS configurable
- ✅ Validation des paramètres sur chaque route
- ✅ Aucun accès à des sources privées ou non autorisées
- ✅ Conformité RGPD : pas de collecte de données personnelles

---

## 🧠 Fonctionnalités

| Fonctionnalité | Statut |
|----------------|--------|
| 🌍 Carte interactive Leaflet + clustering | ✅ |
| 🔎 Recherche intelligente avec autocomplete | ✅ |
| 🎥 Lecteur vidéo avec navigation ←/→ | ✅ |
| ⭐ Favoris persistants (localStorage) | ✅ |
| 🌤 Météo temps réel OpenWeather | ✅ |
| 📡 Webcams dynamiques via Windy API | ✅ |
| 🎲 Explorateur aléatoire | ✅ |
| 🏷 Filtres : ville, nature, montagne, plage | ✅ |
| 📱 Responsive mobile + desktop | ✅ |
| ⛶ Mode plein écran | ✅ |
| ⌨ Raccourcis clavier | ✅ |
| 🔄 Cache intelligent avec TTL | ✅ |
| 🛡 Rate limiting + sécurité | ✅ |
| 🔀 Fallback auto si API indisponible | ✅ |
| 🌙 Dark mode natif | ✅ |

---

## 📡 Endpoints API du backend

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/weather?lat=X&lon=Y` | GET | Météo pour une position |
| `/api/weather/batch` | POST | Météo pour plusieurs positions |
| `/api/webcams?lat=X&lng=Y&radius=50` | GET | Webcams proches |
| `/api/webcams?q=paris&limit=20` | GET | Recherche de webcams |
| `/api/status` | GET | Santé du serveur + statut APIs |
| `/api/cache/clear` | POST | Vider le cache |

---

## 💡 Améliorations futures suggérées

1. **Redis** pour le cache en production (remplacer le cache in-memory)
2. **Système de comptes** avec Supabase Auth pour synchroniser les favoris
3. **Notifications** quand une webcam favorite revient en ligne
4. **Mode timelapse** : images archivées des dernières 24h
5. **Widget météo étendu** : prévisions 5 jours, radar précipitations
6. **PWA** : installation sur mobile avec accès hors-ligne
7. **Partage social** : liens directs vers une webcam spécifique
8. **Statistiques** : webcams les plus vues, tendances
9. **Multi-langue** : i18n (EN, FR, ES, DE)
10. **WebSocket** : mise à jour temps réel des statuts online/offline

---

## 📄 Licence

MIT — Utilisation libre pour projets personnels et commerciaux.

---

Créé avec 🛰 par SKYWATCH

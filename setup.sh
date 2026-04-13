#!/bin/bash
# ══════════════════════════════════════════════
# SKYWATCH — Script d'installation rapide
# ══════════════════════════════════════════════
set -e

echo "🛰  SKYWATCH — Installation"
echo "══════════════════════════════════════════"

# 1. Install dependencies
echo "📦 Installation des dépendances..."
npm install --production

# 2. Create .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📝 Fichier .env créé — pensez à ajouter vos clés API"
  echo "   → OPENWEATHER_API_KEY : https://openweathermap.org/api"
  echo "   → WINDY_API_KEY       : https://api.windy.com"
else
  echo "✅ Fichier .env existant conservé"
fi

echo ""
echo "══════════════════════════════════════════"
echo "🚀 Choisissez votre mode de déploiement :"
echo ""
echo "  1) Local     → npm start"
echo "  2) Vercel    → vercel --prod"
echo "  3) Netlify   → netlify deploy --prod"
echo "  4) Docker    → docker build -t skywatch . && docker run -p 3000:3000 skywatch"
echo ""
echo "══════════════════════════════════════════"
echo "🛰  Installation terminée !"

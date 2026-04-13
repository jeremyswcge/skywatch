// ══════════════════════════════════════════════
// Vercel Serverless — /api/status
// ══════════════════════════════════════════════

function isRealKey(key) {
  if (!key) return false;
  const placeholders = ['your_', 'xxx', 'changeme', 'replace', 'placeholder', 'test', 'demo', 'example'];
  return !placeholders.some(p => key.toLowerCase().includes(p));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    status: 'ok',
    version: '2.0.0',
    platform: 'vercel',
    apis: {
      openweather: isRealKey(process.env.OPENWEATHER_API_KEY) ? 'configured' : 'missing',
      windy: isRealKey(process.env.WINDY_API_KEY) ? 'configured' : 'missing',
    },
  });
};

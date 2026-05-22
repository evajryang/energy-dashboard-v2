// Vercel Serverless Function: /api/stocks
// Fetches real-time data from Yahoo Finance for all 286 energy stocks
import yahooFinance from 'yahoo-finance2';
import { SYMBOLS, SYMBOL_META } from './_symbols.js';

// Suppress the survey notice
yahooFinance.suppressNotices(['yahooSurvey']);

export default async function handler(req, res) {
  // Allow CORS for any origin (so other tools could use this API too)
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Cache result for 5 minutes on CDN edge (Vercel) — avoids hammering Yahoo
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    // Yahoo Finance: batch query is limited, so we chunk into groups of 50
    const CHUNK = 50;
    const chunks = [];
    for (let i = 0; i < SYMBOLS.length; i += CHUNK) {
      chunks.push(SYMBOLS.slice(i, i + CHUNK));
    }

    // Fetch all chunks in parallel
    const results = await Promise.all(
      chunks.map(chunk => 
        yahooFinance.quote(chunk).catch(err => {
          console.error('Chunk failed:', chunk, err.message);
          return [];
        })
      )
    );

    // Flatten and reshape into the format our front-end expects
    const stocks = [];
    for (const batch of results) {
      const items = Array.isArray(batch) ? batch : [batch];
      for (const s of items) {
        if (!s || !s.symbol) continue;
        const meta = SYMBOL_META[s.symbol] || {};
        stocks.push({
          symbol: s.symbol,
          name: meta.name || s.longName || s.shortName || s.symbol,
          price: s.regularMarketPrice ?? 0,
          change: s.regularMarketChangePercent ?? 0,
          mcap: s.marketCap ? s.marketCap / 1_000_000 : 0, // convert to millions
          sector: meta.sector || 'oil-gas'
        });
      }
    }

    // Sort by mcap descending for consistency
    stocks.sort((a, b) => b.mcap - a.mcap);

    res.status(200).json({
      stocks,
      count: stocks.length,
      fetchedAt: new Date().toISOString(),
      source: 'Yahoo Finance (delayed ~15 minutes)'
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ 
      error: err.message,
      hint: 'Yahoo Finance API may be temporarily unavailable. Static fallback will be used.'
    });
  }
}

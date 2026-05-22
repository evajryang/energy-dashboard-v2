import { SYMBOLS, SYMBOL_META } from './_symbols.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
        const CHUNK = 40;
        const chunks = [];
        for (let i = 0; i < SYMBOLS.length; i += CHUNK) {
                chunks.push(SYMBOLS.slice(i, i + CHUNK));
        }

      const headers = {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json',
              'Accept-Language': 'en-US,en;q=0.9'
      };

      const results = await Promise.all(
              chunks.map(async (chunk) => {
                        const symbols = chunk.join(',');
                        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
                        try {
                                    const r = await fetch(url, { headers });
                                    if (!r.ok) return [];
                                    const json = await r.json();
                                    return json?.quoteResponse?.result || [];
                        } catch (e) {
                                    return [];
                        }
              })
            );

      const stocks = [];
        for (const batch of results) {
                for (const s of batch) {
                          if (!s || !s.symbol) continue;
                          const meta = SYMBOL_META[s.symbol] || {};
                          stocks.push({
                                      symbol: s.symbol,
                                      name: meta.name || s.longName || s.shortName || s.symbol,
                                      price: s.regularMarketPrice ?? 0,
                                      change: s.regularMarketChangePercent ?? 0,
                                      mcap: s.marketCap ? s.marketCap / 1_000_000 : 0,
                                      sector: meta.sector || 'oil-gas'
                          });
                }
        }

      stocks.sort((a, b) => b.mcap - a.mcap);

      if (stocks.length === 0) {
              return res.status(503).json({ error: 'Yahoo Finance returned no data' });
      }

      res.status(200).json({
              stocks,
              count: stocks.length,
              fetchedAt: new Date().toISOString(),
              source: 'Yahoo Finance (delayed ~15 minutes)'
      });
  } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
  }
}

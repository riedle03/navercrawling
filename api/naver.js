/**
 * api/naver.js — Vercel Serverless Function
 * 네이버 검색 API CORS 프록시
 * 브라우저 → 이 함수 → 네이버 API
 */
export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { query, display = '100', start = '1', sort = 'sim' } = req.query;

  if (!query) {
    return res.status(400).json({ error: '검색어(query)가 필요합니다.' });
  }

  // 클라이언트가 전달한 API 키 사용 (헤더로 전달)
  const clientId     = req.headers['x-naver-client-id'];
  const clientSecret = req.headers['x-naver-client-secret'];

  if (!clientId || !clientSecret) {
    return res.status(401).json({ error: '네이버 API 키가 없습니다.' });
  }

  const naverUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=${sort}`;

  try {
    const response = await fetch(naverUrl, {
      headers: {
        'X-Naver-Client-Id':     clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: '네이버 API 호출 실패', detail: err.message });
  }
}

// 서버 응답을 돕는 작은 함수들 (Vercel과 내 컴퓨터 테스트 서버 양쪽에서 동작)

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel은 미리 읽어 둔다
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function handleError(res, err) {
  console.error(err);
  if (err.code === 'NO_KEY') {
    return sendJson(res, 500, { error: '서버에 API 키가 설정되지 않았어요.', code: 'NO_KEY' });
  }
  if (err.code === 'BAD_IMAGE') {
    return sendJson(res, 400, { error: '사진을 읽지 못했어요. 다시 찍어주세요.', code: 'BAD_IMAGE' });
  }
  if (err.status === 401) {
    return sendJson(res, 500, { error: 'API 키가 올바르지 않아요.', code: 'BAD_KEY' });
  }
  if (err.status === 429) {
    return sendJson(res, 429, { error: '요청이 많아요. 잠시 후 다시 해주세요.', code: 'RATE_LIMIT' });
  }
  return sendJson(res, 500, { error: '분석 중 문제가 생겼어요. 다시 찍어주세요.', code: 'SERVER' });
}

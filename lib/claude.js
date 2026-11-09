// Claude API 호출을 한곳에 모아 둔 파일.
// API 키는 코드에 쓰지 않고, 배포 서비스의 환경 변수 ANTHROPIC_API_KEY에서 읽는다.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.TRIPICK_MODEL || 'claude-sonnet-5-5';

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY 환경 변수가 없습니다.');
    err.code = 'NO_KEY';
    throw err;
  }
  if (!client) {
    const opts = { apiKey: process.env.ANTHROPIC_API_KEY };
    // 워크스페이스에 묶이지 않은 키라면 워크스페이스 ID를 함께 보내야 한다.
    if (process.env.ANTHROPIC_WORKSPACE_ID) {
      opts.defaultHeaders = { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID };
    }
    client = new Anthropic(opts);
  }
  return client;
}

// "data:image/jpeg;base64,...." 형태를 미디어 타입과 데이터로 나눈다.
export function splitDataUrl(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(dataUrl || '');
  if (!m) {
    const err = new Error('이미지 형식이 올바르지 않습니다.');
    err.code = 'BAD_IMAGE';
    throw err;
  }
  return { mediaType: m[1], data: m[2] };
}

// 답변 텍스트에서 첫 번째 JSON 객체를 꺼낸다.
export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 답변에서 JSON을 찾지 못했습니다.');
  return JSON.parse(text.slice(start, end + 1));
}

// 이미지 한 장 + 지시문을 보내고 JSON으로 받는다.
export async function askWithImage({ dataUrl, system, prompt, maxTokens = 800 }) {
  const { mediaType, data } = splitDataUrl(dataUrl);
  const msg = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return extractJson(text);
}

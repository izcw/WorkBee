async function testOpenAIConnection({ baseUrl, model, apiKey, fetchImpl = fetch }) {
  const started = Date.now();
  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 2, stream: false }),
    });
  } catch (error) {
    throw new Error(error?.name === 'TimeoutError' ? '连接测试超时' : `无法连接模型服务：${error.message}`);
  }
  if (!response.ok) {
    const body = await response.text();
    let detail = '';
    try { const parsed = JSON.parse(body); detail = parsed?.error?.message || ''; } catch {}
    const safeDetail = String(detail).replaceAll(apiKey, '[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 240);
    throw new Error(`连接失败（HTTP ${response.status}）${safeDetail ? `：${safeDetail}` : ''}`);
  }
  return { success: true, latencyMs: Date.now() - started, message: '连接成功' };
}

module.exports = { testOpenAIConnection };

const db = require('../database');
const appEvents = require('./events');

function isCreditsError(err) {
  const status = err.status || err.response?.status;
  const msg = (err.message || '').toLowerCase();
  return status === 429 || status === 402 ||
    msg.includes('quota') || msg.includes('credit') ||
    msg.includes('insufficient') || msg.includes('billing') ||
    msg.includes('rate limit') || msg.includes('rate_limit');
}

async function markCreditsExhausted() {
  try {
    const before = await db.prepare("SELECT credits_exhausted FROM system_ai_config WHERE id = 'system'").get();
    await db.prepare("UPDATE system_ai_config SET credits_exhausted = 1 WHERE id = 'system'").run();
    console.log('[ai] ⚠️ Créditos esgotados — sistema de IA desativado até recarga');
    // Emite apenas na primeira vez para não ficar derrubando sessões repetidamente
    if (!before?.credits_exhausted) {
      appEvents.emit('credits.exhausted');
    }
  } catch {}
}

async function callAI(config, userText) {
  const provider = config.provider || 'claude';
  const systemPrompt = config.system_prompt || 'Você é um assistente prestativo do grupo.';

  try {
    switch (provider) {
      case 'claude': {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: config.api_key });
        const res = await client.messages.create({
          model: config.model || 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userText }],
        });
        return res.content[0]?.text;
      }

      case 'openai': {
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey: config.api_key });
        const res = await client.chat.completions.create({
          model: config.model || 'gpt-4o-mini',
          max_tokens: 500,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
        });
        return res.choices[0]?.message?.content;
      }

      case 'gemini': {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(config.api_key);
        const model = genAI.getGenerativeModel({
          model: config.model || 'gemini-1.5-flash',
          systemInstruction: systemPrompt,
        });
        const result = await model.generateContent(userText);
        return result.response.text();
      }

      case 'grok': {
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey: config.api_key, baseURL: 'https://api.x.ai/v1' });
        const res = await client.chat.completions.create({
          model: config.model || 'grok-beta',
          max_tokens: 500,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
        });
        return res.choices[0]?.message?.content;
      }

      case 'deepseek': {
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey: config.api_key, baseURL: 'https://api.deepseek.com' });
        const res = await client.chat.completions.create({
          model: config.model || 'deepseek-chat',
          max_tokens: 500,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
        });
        return res.choices[0]?.message?.content;
      }

      default:
        throw new Error(`Provedor desconhecido: ${provider}`);
    }
  } catch (err) {
    if (isCreditsError(err)) await markCreditsExhausted();
    throw err;
  }
}

// Analisa uma imagem (buffer) para detectar conteúdo impróprio
async function callAIWithImage(config, imageBuffer, mimeType) {
  const provider = config.provider || 'claude';
  const systemPrompt = config.system_prompt || '';
  const base64 = imageBuffer.toString('base64');

  try {
    switch (provider) {
      case 'claude': {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: config.api_key });
        const res = await client.messages.create({
          model: config.model || 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
              { type: 'text', text: 'Analise esta imagem.' },
            ],
          }],
        });
        return res.content[0]?.text;
      }

      case 'openai':
      case 'grok': {
        const OpenAI = require('openai');
        const baseURL = provider === 'grok' ? 'https://api.x.ai/v1' : undefined;
        const client = new OpenAI({ apiKey: config.api_key, ...(baseURL ? { baseURL } : {}) });
        const res = await client.chat.completions.create({
          model: config.model || 'gpt-4o-mini',
          max_tokens: 10,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                { type: 'text', text: 'Analise esta imagem.' },
              ],
            },
          ],
        });
        return res.choices[0]?.message?.content;
      }

      case 'gemini': {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(config.api_key);
        const model = genAI.getGenerativeModel({
          model: config.model || 'gemini-1.5-flash',
          systemInstruction: systemPrompt,
        });
        const result = await model.generateContent([
          { inlineData: { data: base64, mimeType } },
          'Analise esta imagem.',
        ]);
        return result.response.text();
      }

      default:
        throw new Error(`Provedor sem suporte a imagem: ${provider}`);
    }
  } catch (err) {
    if (isCreditsError(err)) await markCreditsExhausted();
    throw err;
  }
}

module.exports = { callAI, callAIWithImage };

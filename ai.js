const crypto = require('crypto');
const MAX_FALLBACK_SUMMARY_CHARS = 240;

function normalizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

function summarize(text, maxSentences = 3) {
  const sentences = splitSentences(text);
  return sentences.slice(0, maxSentences).join(' ') || normalizeText(text).slice(0, MAX_FALLBACK_SUMMARY_CHARS);
}

function explain(text, level) {
  const content = summarize(text, 4);
  if (level === 'beginner') {
    return `Simple explanation: ${content}`;
  }
  if (level === 'advanced') {
    return `Technical explanation: ${content}`;
  }
  return `Clear explanation: ${content}`;
}

function transform(text, tone) {
  const base = normalizeText(text);
  if (!base) return '';

  if (tone === 'professional') {
    return base
      .replace(/\bi\b/gi, 'I')
      .replace(/\bdon't\b/gi, 'do not')
      .replace(/\bcan't\b/gi, 'cannot');
  }
  if (tone === 'friendly') {
    return `${base} Thanks for taking a look!`;
  }
  if (tone === 'persuasive') {
    return `${base} This is the fastest way to get reliable results.`;
  }
  return base;
}

function keyPoints(text) {
  const sentences = splitSentences(text);
  return sentences.slice(0, 5).map((s, idx) => `${idx + 1}. ${s}`);
}

function actionItems(text) {
  return splitSentences(text)
    .filter((s) => /\b(need|must|should|todo|fix|update|create|send|review)\b/i.test(s))
    .slice(0, 5)
    .map((s) => s.replace(/[.!?]$/, ''));
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function optimizePrompt({ mode, level, style, tone }) {
  return {
    instruction: `Mode=${mode}; Level=${level}; Style=${style}; Tone=${tone}`,
    maxTokens: mode === 'summarize' ? 250 : 400,
  };
}

function buildStructuredOutput({ inputText, mode, level, style, tone, memory }) {
  const clean = normalizeText(inputText).slice(0, 5000);
  const promptConfig = optimizePrompt({ mode, level, style, tone });

  const summary = summarize(clean, style === 'concise' ? 2 : 4);
  const explanation = explain(clean, level);
  const transformed = transform(clean, tone);

  return {
    meta: {
      mode,
      level,
      style,
      tone,
      usedMemoryHints: memory.slice(0, 3),
      tokenEstimate: estimateTokens(clean),
      promptConfig,
    },
    sections: {
      summary,
      explanation,
      transformed,
      keyPoints: keyPoints(clean),
      actionItems: actionItems(clean),
    },
    quality: {
      confidence: clean.length > 20 ? 0.88 : 0.68,
      warnings: clean.length < 20 ? ['Input too short for deep processing.'] : [],
    },
  };
}

function cacheKey(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

module.exports = {
  buildStructuredOutput,
  cacheKey,
};

import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';

// Load process 1860 environment
const rawEnv = fs.readFileSync('/proc/1860/environ', 'utf-8');
const entries = rawEnv.split('\0');
for (const entry of entries) {
  const idx = entry.indexOf('=');
  if (idx > 0) {
    const k = entry.substring(0, idx);
    const v = entry.substring(idx + 1);
    process.env[k] = v;
  }
}

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  console.log(`Testing Gemini API with model: ${model}, key prefix: ${apiKey?.substring(0, 8)}...`);

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model,
      contents: 'Respond with exactly: {"status":"live_gemini_active"}',
    });
    console.log('Gemini Live Response Success:');
    console.log(response.text);
    return { success: true, text: response.text };
  } catch (err: any) {
    console.error('Gemini Live API Error:');
    console.error('Message:', err.message);
    console.error('Status:', err.status);
    console.error('Code:', err.code);
    return { success: false, error: err.message, status: err.status };
  }
}

testGemini();

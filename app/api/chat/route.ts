import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, verifyCsrfAndOrigin } from '@/lib/security';
import { isSafeHttpUrl, validateChatPayload } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const csrf = verifyCsrfAndOrigin(req);
    if (!csrf.ok) {
      return NextResponse.json({ error: 'Forbidden: Cross-origin request blocked.' }, { status: 403 });
    }

    const ip = getClientIp(req);
    const rate = checkRateLimit(`chat:${ip}`, 20, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down and try again shortly.' },
        { status: 429 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured on the server.' },
        { status: 500 }
      );
    }

    const rawBody = await req.json().catch(() => null);
    const validated = validateChatPayload(rawBody);
    if (!validated.valid) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { messages, mode, currency, latestHistory } = validated.data;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let modelName = 'gemini-3.7-flash';
    if (mode === 'fast') {
      modelName = 'gemini-3.1-flash-lite';
    } else if (mode === 'complex') {
      modelName = 'gemini-3.7-flash';
    }

    const systemInstruction = `You are RetailBot, a highly intelligent AI assistant integrated with live Google Search.

Core Capabilities:
1. Google Search Grounding for live and retail/financial queries.
2. Retail & Calculator Max guidance: EMI, wishlist savings goals, discounts, units, currency conversions, and history tracking.
3. Clean Markdown formatting.

Active App Context:
- Preferred Currency Symbol: ${currency}
- Latest Recorded History Calculation: ${latestHistory ? JSON.stringify(latestHistory) : 'None'}`;

    const formattedContents = messages.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    }));

    const response = await ai.models.generateContent({
      model: modelName,
      contents: formattedContents,
      config: {
        systemInstruction,
        temperature: 0.7,
        tools: [{ googleSearch: {} }],
      },
    });

    let replyText = response.text || 'I apologize, but I was unable to generate a response. Please try again.';

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const sources: { title: string; url: string }[] = [];

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk?.web?.uri && chunk?.web?.title && isSafeHttpUrl(chunk.web.uri)) {
          if (!sources.some((s) => s.url === chunk.web.uri)) {
            sources.push({
              title: String(chunk.web.title).slice(0, 120),
              url: chunk.web.uri,
            });
          }
        }
      });
    }

    if (sources.length > 0) {
      replyText +=
        '\n\n---\n**Google Search References:**\n' +
        sources.map((s) => `- [${s.title}](${s.url})`).join('\n');
    }

    return NextResponse.json({ text: replyText, sources });
  } catch (error: any) {
    console.error('Error in /api/chat route:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process request with Gemini AI.' },
      { status: 500 }
    );
  }
}

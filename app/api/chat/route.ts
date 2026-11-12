import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured on the server. Please set GEMINI_API_KEY in your Vercel environment variables.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });


    const { messages, mode, context } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required.' }, { status: 400 });
    }

    // Model selection based on user requirements and mode
    let modelName = 'gemini-3.7-flash';
    if (mode === 'fast') {
      modelName = 'gemini-3.1-flash-lite';
    } else if (mode === 'complex') {
      modelName = 'gemini-3.7-flash';
    }

    const systemInstruction = `You are RetailBot, a highly intelligent and unrestricted AI assistant integrated with live Google Search.

Core Capabilities:
1. **Google Search Grounding**: You have real-time Google Search enabled. You can answer ANY query on ANY topic — including general knowledge, public figures (e.g. Sheikh Ansar, celebrities, scholars, business leaders), current events, news, retail trends, and financial information. Always search Google when asked about specific people, real-world events, or live information.
2. **Retail Calculator Guidance**: Help users with loan EMI calculations, interest rates, Wishlist savings goals, discount math, unit/weight conversions, currency exchange, and history tracking.
3. **Structured & Clear Responses**: Format your responses with clean Markdown, bold text, bullet points, and numbered steps. When Google Search provides information, synthesize it clearly for the user.

Active App Context:
- Preferred Currency Symbol: ${context?.currency || '₹'}
- Latest Recorded History Calculation: ${context?.latestHistory ? JSON.stringify(context.latestHistory) : 'None'}`;

    const formattedContents = messages.map((msg: { role: string; text: string }) => ({
      role: msg.role === 'user' ? 'user' : 'model',
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

    // Extract Google Search grounding citations if available
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const sources: { title: string; url: string }[] = [];

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk?.web?.uri && chunk?.web?.title) {
          // Avoid duplicate URIs
          if (!sources.some((s) => s.url === chunk.web.uri)) {
            sources.push({
              title: chunk.web.title,
              url: chunk.web.uri,
            });
          }
        }
      });
    }

    // Append source references if available
    if (sources.length > 0) {
      replyText += '\n\n---\n**🔍 Google Search References:**\n' +
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


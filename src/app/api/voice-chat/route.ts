import { NextResponse } from 'next/server';

async function searchWikipedia(query: string) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/search-wikipedia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await response.json();
    return data.results?.[0] || null;
  } catch (error) {
    console.error('Wikipedia search failed:', error);
    return null;
  }
}

function needsSearch(message: string): boolean {
  const searchKeywords = [
    'what is', 'who is', 'when did', 'where is', 'how does', 
    'tell me about', 'information about', 'explain', 'define',
    'describe', 'history of', 'facts about', 'details about'
  ];
  return searchKeywords.some(keyword => message.toLowerCase().includes(keyword));
}

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'Message missing' }, { status: 400 });
    }

    let systemPrompt = "You are a helpful AI assistant. Answer the user's question clearly and concisely.";
    
    // Check if we need to search for information
    if (needsSearch(message)) {
      const searchResult = await searchWikipedia(message);
      if (searchResult) {
        systemPrompt += `\n\nHere is relevant information from Wikipedia:\nTitle: ${searchResult.title}\nSummary: ${searchResult.summary}\nSource: ${searchResult.url}\n\nUse this information to help answer the user's question. Be sure to mention that the information comes from Wikipedia when relevant.`;
      }
    }

    const payload = {
      model: 'anthropic/claude-sonnet-4',
      messages: [
        {
          role: 'system',
          content: [{ type: 'text', text: systemPrompt }]
        },
        {
          role: 'user',
          content: [{ type: 'text', text: message }],
        },
      ],
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenRouter API error:', err);
      return NextResponse.json({ error: 'Failed to get AI response' }, { status: response.status });
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Voice chat API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

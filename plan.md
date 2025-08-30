Below is a detailed plan outlining every file to modify or create, the error handling, and the best practices to build a production‐ready voice chat agent using the browser's Web Speech APIs for Speech-to-Text (STT) and Text-to-Speech (TTS), the OpenRouter LLM for processing user queries, and Wikipedia API for internet search capabilities.

---

### 1. Environment Setup

- **Create .env.local**  
  - File: .env.local (project root)  
  - Add the following line to store your sensitive API key securely:  
    ```
    OPENROUTER_API_KEY=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
    ```  
  - Ensure this file is gitignored.

---

### 2. Wikipedia Search API Endpoint

- **Create Wikipedia Search API Route**  
  - File: src/app/api/search-wikipedia/route.ts  
  - Steps:  
    1. Accept only POST requests and validate the incoming JSON payload (it must include a "query" field).  
    2. Use Wikipedia API endpoint: `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` for page summaries.  
    3. Also use Wikipedia search endpoint: `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json` to find relevant pages.  
    4. Return structured search results with title, summary, and URL.  
    5. Handle cases where no results are found or API errors occur.

*Example snippet for Wikipedia search route (src/app/api/search-wikipedia/route.ts):*  
```typescript
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: 'Query missing' }, { status: 400 });
    }

    // Search for Wikipedia pages
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.query?.search?.length) {
      return NextResponse.json({ results: [] });
    }

    // Get summary for the first result
    const firstResult = searchData.query.search[0];
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstResult.title)}`;
    const summaryResponse = await fetch(summaryUrl);
    const summaryData = await summaryResponse.json();

    return NextResponse.json({
      results: [{
        title: summaryData.title,
        summary: summaryData.extract,
        url: summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(firstResult.title)}`
      }]
    });
  } catch (error) {
    return NextResponse.json({ error: 'Search error' }, { status: 500 });
  }
}
```

---

### 3. Enhanced API Endpoint for Voice Chat with Search

- **Create Next.js API Route with Search Integration**  
  - File: src/app/api/voice-chat/route.ts  
  - Steps:  
    1. Accept only POST requests and validate the incoming JSON payload (it must include a "message" field).  
    2. First, analyze the user message to determine if it requires current information or factual lookup.  
    3. If search is needed, call the Wikipedia search API to get relevant information.  
    4. Include the search results in the system prompt when calling OpenRouter.  
    5. Use a try/catch block to call the OpenRouter endpoint `https://openrouter.ai/api/v1/chat/completions`.  
    6. Set proper headers including the Authorization header (using process.env.OPENROUTER_API_KEY) and Content-Type application/json.  
    7. Construct a JSON body with enhanced system prompt that includes search results and the default model `anthropic/claude-sonnet-4`.  
    8. Return the assistant's response in JSON format.  
    9. Handle errors by returning appropriate HTTP status codes and error messages.

*Example snippet for enhanced voice chat route (src/app/api/voice-chat/route.ts):*  
```typescript
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
  } catch {
    return null;
  }
}

function needsSearch(message: string): boolean {
  const searchKeywords = ['what is', 'who is', 'when did', 'where is', 'how does', 'tell me about', 'information about', 'explain', 'define'];
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
        systemPrompt += `\n\nHere is relevant information from Wikipedia:\nTitle: ${searchResult.title}\nSummary: ${searchResult.summary}\nSource: ${searchResult.url}\n\nUse this information to help answer the user's question.`;
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
      return NextResponse.json({ error: err }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

---

### 4. Voice Chat UI Component

- **Create VoiceChat Component**  
  - File: src/components/VoiceChat.tsx  
  - Steps:  
    1. Import React hooks (useState, useEffect, useRef) and use proper TypeScript types.  
    2. Set up states for conversation history (an array with objects containing role and text), isListening, isProcessing, and error messages.  
    3. Initialize the Web Speech API for Speech-to-Text using either `window.SpeechRecognition` or `webkitSpeechRecognition` with error checking.  
    4. Create handlers:  
       - A "startListening" function to initiate speech recognition.  
       - A "stopListening" (or recognition.onend) function to capture the recognized text.  
       - A "sendMessage" function that calls the created API endpoint ("/api/voice-chat") with the user message.  
       - A "speakText" function that uses the SpeechSynthesis API to read aloud the assistant reply.  
    5. Update conversation history appropriately, displaying both user inputs and assistant responses.  
    6. Include error handling to display error messages if (a) the browser doesn't support speech APIs, (b) API call fails, or (c) recognition errors occur.
    7. Use modern, stylistic design with Tailwind CSS for the UI:  
       - A header area ("Voice Chat Agent with Wikipedia Search").  
       - A scrollable chat history panel showing conversation bubbles styled differently for user and assistant.  
       - A well-designed control panel with a prominent "Start Listening" button (that toggles to "Stop Listening" when active).  
       - Visual indicators when Wikipedia search is being performed.
    8. Ensure accessibility by providing ARIA labels on interactive elements.

---

### 5. Integration Page for the Voice Chat Agent

- **Add a New Page to Display the Voice Chat Agent**  
  - File: src/app/voice-chat/page.tsx  
  - Steps:  
    1. Import the VoiceChat component from the components folder.  
    2. Render the component as the main content of the page.  
    3. Ensure the page inherits global styles from globals.css for consistency.

*Example page file:*  
```tsx
import React from 'react';
import VoiceChat from '@/components/VoiceChat';

const VoiceChatPage: React.FC = () => {
  return (
    <div>
      <VoiceChat />
    </div>
  );
};

export default VoiceChatPage;
```

---

### 6. Testing and Error Handling Best Practices

- **In the API Routes:**  
  - Validate input and handle network errors and non-OK responses from OpenRouter and Wikipedia APIs.  
  - Use console.error for server-side logging (if needed) without exposing sensitive details in responses.
  - Handle Wikipedia API rate limits and connection errors gracefully.

- **In the UI Component:**  
  - Detect browser support for SpeechRecognition and SpeechSynthesis; display a friendly error if not supported.  
  - Show real-time feedback such as "Processing..." and "Searching Wikipedia..." when waiting for responses.  
  - Update conversation history reliably and ensure error messages are visible to the user.
  - Handle cases where Wikipedia search returns no results.

- **UI/UX Consistency:**  
  - Use modern typography, spacing, and colors that are consistent with the rest of the application.  
  - Ensure the voice chat area is responsive and the conversation history scrolls properly.
  - Provide visual feedback when Wikipedia search is active.

---

### Summary

- Created a secure environment variable file (.env.local) to store the OpenRouter API key.  
- Developed a Wikipedia search API route in src/app/api/search-wikipedia/route.ts for fetching information from Wikipedia.  
- Enhanced the voice chat API route in src/app/api/voice-chat/route.ts to integrate Wikipedia search when needed, calls OpenRouter's endpoint with enriched context, and handles errors robustly.  
- Designed a modern, stylistic VoiceChat component in src/components/VoiceChat.tsx that leverages Web Speech API and Speech Synthesis for STT and TTS.  
- Integrated a new page in src/app/voice-chat/page.tsx to host the voice chat agent.  
- Added intelligent search detection to automatically search Wikipedia when users ask factual questions.  
- Ensured comprehensive error handling and UI/UX best practices for a real-world, production-ready voice chat agent with internet search capabilities.

 After the plan approval, I will breakdown the plan into logical steps and create a tracker (TODO.md) to track the execution of steps in the plan. I will overwrite this file every time to update the completed steps.

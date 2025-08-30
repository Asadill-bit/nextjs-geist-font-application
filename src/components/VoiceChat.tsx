'use client';

import React, { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

// Type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognition extends EventTarget {
  new (): SpeechRecognition;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

const VoiceChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-stop listening after 10 seconds of inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isListening) {
      timeout = setTimeout(() => {
        stopListening();
        setError('Listening timed out. Please try again.');
      }, 10000);
    }
    return () => clearTimeout(timeout);
  }, [isListening]);

  // Initialize Speech Recognition
  const startListening = () => {
    setError('');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    // Check if speech synthesis is speaking and stop it
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    
    recognition.onstart = () => {
      setIsListening(true);
      setError('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) {
        const newMessage: Message = {
          role: 'user',
          text: transcript,
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, newMessage]);
        sendMessage(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setError(`Speech recognition error: ${event.error}. Please try again.`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const sendMessage = async (userMessage: string) => {
    setIsProcessing(true);
    setIsSearching(true);
    
    try {
      const res = await fetch('/api/voice-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      });

      setIsSearching(false);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}: Failed to process the message`);
      }

      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Extract the assistant's response from OpenRouter format
      const reply = data.choices?.[0]?.message?.content || 'No reply received';
      
      const assistantMessage: Message = {
        role: 'assistant',
        text: reply,
        timestamp: new Date()
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
      speakText(reply);
      
    } catch (err: any) {
      console.error('Send message error:', err);
      setError(err.message || 'Error sending message. Please try again.');
      setIsSearching(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
        setError('Text-to-speech failed. Please try again.');
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      setError('Text-to-speech not supported in this browser.');
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError('');
    stopSpeaking();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Voice Chat Agent
          </h1>
          <p className="text-lg text-gray-600">
            Powered by AI with Wikipedia Search
          </p>
        </div>

        {/* Chat Container */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Chat Messages */}
          <div className="h-96 overflow-y-auto p-6 space-y-4 bg-gray-50">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-20">
                <div className="text-6xl mb-4">🎤</div>
                <p className="text-lg">Click "Start Listening" to begin your conversation</p>
                <p className="text-sm mt-2">Ask me anything! I can search Wikipedia for factual information.</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-800 shadow-md border'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <p className={`text-xs mt-2 ${
                      msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {msg.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            
            {/* Status Indicators */}
            {isSearching && (
              <div className="flex justify-start">
                <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-2xl">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
                    <span className="text-sm">Searching Wikipedia...</span>
                  </div>
                </div>
              </div>
            )}
            
            {isProcessing && !isSearching && (
              <div className="flex justify-start">
                <div className="bg-blue-100 border border-blue-300 text-blue-800 px-4 py-2 rounded-2xl">
                  <div className="flex items-center space-x-2">
                    <div className="animate-pulse rounded-full h-4 w-4 bg-blue-600"></div>
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Error Display */}
          {error && (
            <div className="px-6 py-3 bg-red-50 border-t border-red-200">
              <div className="flex items-center space-x-2 text-red-700">
                <span className="text-lg">⚠️</span>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="p-6 bg-white border-t border-gray-200">
            <div className="flex items-center justify-center space-x-4">
              {/* Main Voice Button */}
              {!isListening ? (
                <button
                  onClick={startListening}
                  disabled={isProcessing}
                  className="flex items-center space-x-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-8 py-4 rounded-full font-semibold text-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none"
                >
                  <span className="text-2xl">🎤</span>
                  <span>Start Listening</span>
                </button>
              ) : (
                <button
                  onClick={stopListening}
                  className="flex items-center space-x-3 bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-full font-semibold text-lg transition-all duration-200 animate-pulse"
                >
                  <span className="text-2xl">🔴</span>
                  <span>Stop Listening</span>
                </button>
              )}

              {/* Stop Speaking Button */}
              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-full font-medium transition-all duration-200"
                >
                  <span className="text-lg">🔇</span>
                  <span>Stop Speaking</span>
                </button>
              )}

              {/* Clear Chat Button */}
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-full font-medium transition-all duration-200"
                >
                  <span className="text-lg">🗑️</span>
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Status Text */}
            <div className="text-center mt-4">
              {isListening && (
                <p className="text-blue-600 font-medium animate-pulse">
                  🎙️ Listening... Speak now!
                </p>
              )}
              {isProcessing && !isListening && (
                <p className="text-gray-600">
                  Processing your message...
                </p>
              )}
              {isSpeaking && (
                <p className="text-green-600 font-medium">
                  🔊 Speaking response...
                </p>
              )}
              {!isListening && !isProcessing && !isSpeaking && (
                <p className="text-gray-500 text-sm">
                  Ready to chat! Click the microphone to start.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Features Info */}
        <div className="mt-8 text-center text-gray-600 text-sm">
          <p>✨ Features: Voice Recognition • AI Responses • Wikipedia Search • Text-to-Speech</p>
          <p className="mt-1">💡 Try asking: "What is artificial intelligence?" or "Tell me about the solar system"</p>
          <p className="mt-1 text-xs text-gray-400">
            Note: Works best in Chrome, Edge, or Safari. Microphone permission required.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VoiceChat;

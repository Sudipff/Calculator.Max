'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Zap,
  HelpCircle,
  RotateCcw,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  ChevronRight,
  Info,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { VibrationType } from '../app/page';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface ChatBotProps {
  currency: string;
  latestHistoryItem?: {
    type: string;
    details: string;
    result: string;
  } | null;
  triggerVibration?: (type?: VibrationType) => void;
}

type ModelMode = 'fast' | 'general' | 'complex';

const SUGGESTIONS = [
  'How do I calculate EMI with down payment?',
  'Search latest retail inflation trends',
  'How do I set up a Wishlist goal?',
  'Help me troubleshoot my calculation',
];

export default function ChatBot({ currency, latestHistoryItem, triggerVibration }: ChatBotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hello! 👋 I'm **RetailBot**, your AI support & search assistant powered by Gemini with live **Google Search Engine Grounding**.\n\nI can answer **ANY question** — whether you need help with loan calculations, retail savings tips, or want me to search Google for news or market facts! How can I assist you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<ModelMode>('general');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    if (triggerVibration) triggerVibration('click');

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setErrorMsg(null);

    // Format for backend API
    const apiMessages = updatedMessages
      .filter((m) => m.id !== 'welcome' || updatedMessages.length === 1)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text,
      }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
          mode: mode,
          context: {
            currency,
            latestHistory: latestHistoryItem || null,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to receive response from AI assistant');
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: data.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
      if (triggerVibration) triggerVibration('success');
    } catch (err: any) {
      console.error('Chat error:', err);
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      if (triggerVibration) triggerVibration('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (triggerVibration) triggerVibration('reset');
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        text: 'Conversation reset! How can I help you with your calculations or support queries?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setErrorMsg(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[480px] max-h-[720px] bg-slate-50/60 rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Top Banner & Control Bar */}
      <div className="bg-white border-b border-slate-200/80 p-3.5 sm:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-slate-800 text-sm sm:text-base">RetailBot Search AI</h2>
              <span className="text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                Google Search Active
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Live web search grounding & loan calculations</p>
          </div>
        </div>

        {/* Mode Selector & Reset */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode('fast')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                mode === 'fast'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Fast speed (Gemini 3.1 Flash Lite)"
            >
              <Zap className="w-3 h-3" />
              <span>Fast</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('general')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                mode === 'general'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Standard support (Gemini 3.5 Flash)"
            >
              <span>Standard</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('complex')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                mode === 'complex'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Deep reasoning for complex math & troubleshooting"
            >
              <HelpCircle className="w-3 h-3" />
              <span>Deep Math</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleClearHistory}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Reset Chat"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context Badge if active history exists */}
      {latestHistoryItem && (
        <div className="bg-blue-50/80 border-b border-blue-100 px-3.5 py-2 flex items-center justify-between text-xs text-blue-800">
          <div className="flex items-center gap-2 truncate">
            <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">
              <strong>Active Context:</strong> {latestHistoryItem.type} — {latestHistoryItem.result}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSendMessage(`Can you explain my recent ${latestHistoryItem.type} calculation: ${latestHistoryItem.details} -> ${latestHistoryItem.result}?`)}
            className="text-[11px] font-bold text-blue-700 hover:underline shrink-0 ml-2"
          >
            Ask about this
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 ${
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user'
                  ? 'bg-slate-800 text-white'
                  : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm'
              }`}
            >
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 shadow-sm text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-none'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              ) : (
                <div className="prose prose-slate prose-sm max-w-none dark:prose-invert leading-relaxed space-y-2">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              )}

              <div
                className={`text-[10px] mt-1.5 text-right ${
                  msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-none p-3.5 shadow-sm text-sm flex items-center gap-2 text-slate-500">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              </div>
              <span className="text-xs font-semibold text-slate-400">RetailBot is thinking...</span>
            </div>
          </div>
        )}

        {/* Error Callout */}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center justify-between text-rose-700 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => handleSendMessage()}
              className="text-xs font-bold underline hover:text-rose-900 shrink-0 ml-2"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      {messages.length < 5 && !isLoading && (
        <div className="px-3 py-2 bg-slate-100/80 border-t border-slate-200/60 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 ml-1" />
          <span className="text-[11px] font-bold text-slate-500 shrink-0">Quick questions:</span>
          {SUGGESTIONS.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(suggestion)}
              className="text-xs bg-white hover:bg-blue-50 hover:text-blue-600 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full whitespace-nowrap transition-colors shrink-0 shadow-2xs"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="p-3 bg-white border-t border-slate-200/80">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask RetailBot about calculations, loans, or troubleshooting..."
            disabled={isLoading}
            className="flex-1 bg-slate-100 hover:bg-slate-50 focus:bg-white text-slate-800 text-sm rounded-xl px-4 py-2.5 border border-transparent focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white disabled:text-slate-400 flex items-center justify-center transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

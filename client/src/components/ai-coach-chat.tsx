import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Session, Metric, GoalEvent } from "@shared/schema";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  sessions: Session[];
  metrics: Metric[];
  goal?: GoalEvent;
  activeWeek: number;
}

export function AiCoachChat({ sessions, metrics, goal, activeWeek }: Props) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGreetingLoading, setIsGreetingLoading] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToBottom, 100);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  const loadGreeting = async () => {
    if (hasOpened) return;
    setHasOpened(true);
    setIsGreetingLoading(true);
    try {
      const res = await fetch("/api/coach/greeting", { credentials: "include" });
      const data = await res.json();
      setMessages([{ role: "assistant", content: data.greeting || "Hey! I'm Peak, your training coach. What's on your mind?" }]);
    } catch {
      setMessages([{ role: "assistant", content: "Hey! I'm Peak, your training coach. How's training going — anything I can help with?" }]);
    } finally {
      setIsGreetingLoading(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    loadGreeting();
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get response");
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      const isTimeout = err.name === "AbortError";
      toast({
        title: isTimeout ? "Coach timed out" : "Couldn't reach your coach",
        description: isTimeout ? "Try again in a moment." : err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickPrompts = [
    "How should I prepare for my next session?",
    "I'm feeling tired today — what do you recommend?",
    "Explain zone 2 training to me",
    "Can you adjust this week's plan?",
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setIsOpen(false)} />
      )}

      <div
        className={cn(
          "fixed z-50 transition-all duration-300 ease-out",
          isOpen
            ? "inset-0 sm:inset-auto sm:bottom-28 sm:right-4 sm:w-[400px] sm:h-[600px]"
            : "bottom-24 right-4"
        )}
      >
        {isOpen ? (
          <div className="flex flex-col h-full bg-brand-panel border border-brand-border rounded-2xl shadow-[0_0_60px_rgba(65,209,255,0.15)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border bg-brand-panel/95 backdrop-blur-md shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-[0_0_12px_rgba(65,209,255,0.4)]">
                  <Bot size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-brand-text text-sm">Coach Peak</h3>
                  <p className="text-[10px] text-brand-primary uppercase tracking-widest font-bold">
                    {isLoading ? "Thinking..." : "Your AI Training Coach"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-brand-muted hover:text-brand-text hover:bg-brand-panel-2 transition-colors"
                data-testid="button-close-coach"
              >
                <ChevronDown size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
              {isGreetingLoading && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_8px_rgba(65,209,255,0.3)]">
                    <Bot size={14} className="text-white" />
                  </div>
                  <div className="bg-brand-panel-2 border border-brand-border rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-2 h-2 rounded-full bg-brand-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-brand-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-brand-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_8px_rgba(65,209,255,0.3)]">
                      <Bot size={14} className="text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[82%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                      msg.role === "user"
                        ? "bg-brand-primary/20 border border-brand-primary/30 text-brand-text rounded-tr-sm"
                        : "bg-brand-panel-2 border border-brand-border text-brand-text rounded-tl-sm"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_8px_rgba(65,209,255,0.3)]">
                    <Bot size={14} className="text-white" />
                  </div>
                  <div className="bg-brand-panel-2 border border-brand-border rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-2 h-2 rounded-full bg-brand-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-brand-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-brand-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              {messages.length === 1 && !isLoading && (
                <div className="space-y-2 mt-2">
                  <p className="text-[10px] uppercase tracking-widest text-brand-muted font-bold text-center">Quick starters</p>
                  {quickPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInput(prompt);
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className="w-full text-left text-xs text-brand-muted bg-brand-bg border border-brand-border/60 hover:border-brand-primary/40 hover:text-brand-text px-3 py-2 rounded-lg transition-all"
                      data-testid={`button-quick-prompt-${i}`}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 pb-4 pt-3 border-t border-brand-border shrink-0">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask your coach anything..."
                  rows={1}
                  className="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-sm text-brand-text placeholder-brand-muted/50 focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none max-h-28 overflow-auto leading-relaxed"
                  style={{ height: "auto" }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = Math.min(target.scrollHeight, 112) + "px";
                  }}
                  data-testid="input-coach-message"
                  disabled={isLoading || isGreetingLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading || isGreetingLoading}
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all",
                    input.trim() && !isLoading
                      ? "bg-gradient-primary shadow-[0_0_12px_rgba(65,209,255,0.4)] hover:shadow-[0_0_20px_rgba(65,209,255,0.6)] text-white"
                      : "bg-brand-panel-2 text-brand-muted"
                  )}
                  data-testid="button-send-coach"
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
              <p className="text-[9px] text-brand-muted/60 text-center mt-2">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={handleOpen}
            className="w-14 h-14 rounded-full bg-gradient-primary shadow-[0_0_20px_rgba(65,209,255,0.5)] hover:shadow-[0_0_30px_rgba(65,209,255,0.7)] flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            data-testid="button-open-coach"
            title="Talk to your coach"
          >
            <MessageCircle size={24} className="text-white" />
          </button>
        )}
      </div>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  askDataAgentAction,
} from "@/lib/dataAgentActions";
import type { DataAgentTable } from "@/lib/dataAgentParse";
import { Button, Input } from "@/components/ui";

const INSIGHTS_CHAT_STORAGE_KEY = "roveplanner.insights.chat-v1";

type ChatMessage = {
  role: "user" | "agent" | "error";
  text: string;
  table?: DataAgentTable | null;
};

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    (row.role === "user" || row.role === "agent" || row.role === "error") &&
    typeof row.text === "string"
  );
}

function readStoredMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(INSIGHTS_CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMessage);
  } catch {
    return [];
  }
}

function writeStoredMessages(messages: ChatMessage[]) {
  try {
    if (messages.length === 0) {
      sessionStorage.removeItem(INSIGHTS_CHAT_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(INSIGHTS_CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Ignore quota / private mode failures.
  }
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function AnswerTable({ table }: { table: DataAgentTable }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-border-subtle">
      <table className="min-w-full border-collapse text-left text-sm text-text-primary">
        <thead className="bg-bg-muted">
          <tr>
            {table.headers.map((header, headerIndex) => (
              <th
                key={headerIndex}
                className="border-b border-border-subtle px-3 py-1.5 font-medium"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border-b border-border-subtle px-3 py-1.5 align-top"
                >
                  {formatCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages(readStoredMessages());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeStoredMessages(messages);
  }, [messages, ready]);

  useEffect(() => {
    if (!ready) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, ready]);

  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  const canSubmit = !loading && question.trim().length > 0;

  function resetConversation() {
    if (loading) return;
    setMessages([]);
    setQuestion("");
    writeStoredMessages([]);
    inputRef.current?.focus();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;

    const history = messages
      .filter(
        (message): message is ChatMessage & { role: "user" | "agent" } =>
          (message.role === "user" || message.role === "agent") &&
          Boolean(message.text.trim())
      )
      .map((message) => ({ role: message.role, text: message.text }));

    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    try {
      const answer = await askDataAgentAction(text, history);
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: answer.text, table: answer.table },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          text: e instanceof Error ? e.message : "Could not get an answer",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {messages.length > 0 ? (
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={resetConversation}
          >
            New conversation
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {messages.length === 0 && !loading ? (
          <p className="text-sm text-text-primary/70">
            Ask a question about projects, customers, or allocations — e.g.
            &quot;How much is allocated on Lexit in September?&quot;
          </p>
        ) : (
          <ul className="space-y-4">
            {messages.map((message, index) => (
              <li key={index}>
                <p
                  className={`text-xs font-medium ${
                    message.role === "error"
                      ? "text-danger"
                      : "text-text-primary/60"
                  }`}
                >
                  {message.role === "user"
                    ? "You"
                    : message.role === "error"
                      ? "Error"
                      : "Agent"}
                </p>
                {message.text ? (
                  <p
                    className={`mt-1 whitespace-pre-wrap text-sm ${
                      message.role === "error"
                        ? "text-danger"
                        : "text-text-primary"
                    }`}
                  >
                    {message.text}
                  </p>
                ) : null}
                {message.table && message.table.rows.length > 0 ? (
                  <AnswerTable table={message.table} />
                ) : null}
              </li>
            ))}
            {loading ? (
              <li className="text-sm text-text-primary/70">Thinking…</li>
            ) : null}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            ref={inputRef}
            id="data-agent-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question"
            disabled={loading}
            autoComplete="off"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={!canSubmit} className="shrink-0">
          {loading ? "Sending…" : "Send"}
        </Button>
      </form>
    </div>
  );
}

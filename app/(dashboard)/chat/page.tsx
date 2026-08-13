"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { LoadingCenter } from "@/components/portal";

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
}

interface MessageData {
  _id: string;
  senderId: { _id: string; name: string; email: string } | string;
  receiverId: { _id: string; name: string; email: string } | string;
  text: string;
  read: boolean;
  createdAt: string;
}

interface Conversation {
  _id: string;
  lastMessage: MessageData;
}

function initials(name: string) {
  return name?.charAt(0).toUpperCase() || "?";
}

export default function ChatPage() {
  const { data: session, status: authStatus } = useSession();
  const userId = (session?.user as any)?.id;

  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") redirect("/login");
  }, [authStatus]);

  useEffect(() => {
    if (!userId) return;

    const init = async () => {
      setLoading(true);
      try {
        const [usersRes, convRes] = await Promise.all([
          fetch("/api/users?pageSize=200"),
          fetch("/api/messages"),
        ]);
        const usersData = await usersRes.json();
        const convData = await convRes.json();

        setUsers((usersData.users || []).filter((u: User) => u._id !== userId));
        setConversations(convData.messages || []);
      } catch {} finally {
        setLoading(false);
      }
    };
    init();
  }, [userId]);

  useEffect(() => {
    if (!selectedUser) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/messages?with=${selectedUser._id}`);
        const data = await res.json();
        setMessages(data.messages || []);
      } catch {}
    };
    fetchMessages();
    pollingRef.current = setInterval(fetchMessages, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!text.trim() || !selectedUser) return;

      const msgText = text.trim();
      setText("");

      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiverId: selectedUser._id, text: msgText }),
        });
        if (res.ok) {
          const data = await res.json();
          setMessages((prev) => [...prev, data.message]);
        }
      } catch {}
    },
    [text, selectedUser]
  );

  const getLastMessage = (otherUserId: string) => {
    const conv = conversations.find((c) => c._id === otherUserId);
    return conv?.lastMessage;
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const contactList = [
    ...new Map(
      filteredUsers.map((u) => ({
        user: u,
        lastMessage: getLastMessage(u._id),
      })).map((item) => [item.user._id, item])
    ).values(),
  ].sort((a, b) => {
    if (a.lastMessage && b.lastMessage)
      return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
    if (a.lastMessage) return -1;
    if (b.lastMessage) return 1;
    return a.user.name.localeCompare(b.user.name);
  });

  if (authStatus === "loading") return <LoadingCenter />;

  const sidebarHidden = !!selectedUser;
  const mainHidden = !selectedUser;

  return (
    <div className="chat-shell">
      {/* Contact sidebar */}
      <div className={`chat-sidebar${sidebarHidden ? " is-hidden" : ""}`}>
        <div className="chat-sidebar-head">
          <h2>Team Chat</h2>
          <div className="search-wrap">
            <svg className="search-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Search teammates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div className="chat-contacts">
          {loading ? (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 56, borderRadius: 12 }} />
              ))}
            </div>
          ) : contactList.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <div className="icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
              </div>
              <p style={{ fontWeight: 600, color: "var(--fg)" }}>No contacts</p>
              <p>No teammates found matching your search.</p>
            </div>
          ) : (
            contactList.map(({ user, lastMessage }) => (
              <button
                key={user._id}
                onClick={() => setSelectedUser(user)}
                className={`chat-contact-btn${selectedUser?._id === user._id ? " active" : ""}`}
              >
                <div className="avatar avatar-sm" style={{ background: "linear-gradient(135deg, #2878f0, #0ea5e9)" }}>
                  {initials(user.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--fg)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.name}
                    </p>
                    {lastMessage && (
                      <span style={{ fontSize: 10, color: "var(--fg-subtle)", flexShrink: 0 }}>
                        {new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lastMessage ? lastMessage.text : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className={`chat-main${mainHidden ? " is-hidden" : ""}`}>
        {selectedUser ? (
          <>
            <div className="chat-main-head">
              <button
                onClick={() => setSelectedUser(null)}
                className="icon-btn chat-back-btn"
                aria-label="Back to contacts"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
              </button>
              <div className="avatar avatar-sm" style={{ background: "linear-gradient(135deg, #2878f0, #0ea5e9)" }}>
                {initials(selectedUser.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", margin: 0 }}>{selectedUser.name}</p>
                <p style={{ fontSize: 11.5, color: "var(--fg-muted)", margin: 0, textTransform: "capitalize" }}>{selectedUser.role}</p>
              </div>
            </div>

            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <div className="tile tile-blue">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                  </div>
                  <p style={{ fontWeight: 700, color: "var(--fg)", margin: 0 }}>Start the conversation</p>
                  <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0 }}>Say hello to {selectedUser.name.split(" ")[0]}!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine =
                    (typeof msg.senderId === "object" ? msg.senderId._id : msg.senderId) === userId;
                  return (
                    <div key={msg._id} className={`chat-bubble ${isMine ? "mine" : "theirs"}`}>
                      <p style={{ margin: 0 }}>{msg.text}</p>
                      <p className="chat-bubble-time" style={{ margin: 0 }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-bar">
              <form onSubmit={sendMessage} className="chat-input-form">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type a message..."
                  className="input"
                  style={{ flex: 1 }}
                />
                <button type="submit" disabled={!text.trim()} className="chat-send-btn" aria-label="Send">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="chat-empty">
            <div className="tile tile-blue" style={{ width: 56, height: 56, borderRadius: 16 }}>
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--fg)", margin: 0 }}>Company Chat</h2>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0, maxWidth: 280 }}>
              Select a teammate from the list to start messaging. Messages sync across sessions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

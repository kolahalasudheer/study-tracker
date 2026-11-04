import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Send, Users, User, Lock, MessageSquare, Clock, Sparkles } from "lucide-react";
import { useAuth } from "./AuthContext";
import { supabase, supabaseConfigured } from "./supabase";
import { formatTimeIST, formatDateKey, todayKey } from "./dateUtils";

function getDmRoomId(uid1, uid2) {
  if (!uid1 || !uid2) return "general";
  const sorted = [uid1, uid2].sort();
  return `dm:${sorted[0]}:${sorted[1]}`;
}

function formatMessageTime(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "";
  }
}

function getMessageDateGroup(isoString) {
  if (!isoString) return "Today";
  try {
    const d = new Date(isoString);
    const dateStr = d.toISOString().slice(0, 10);
    const tKey = todayKey();
    if (dateStr === tKey) return "Today";
    return formatDateKey(dateStr, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return "Today";
  }
}

export default function StudyChat({
  user,
  userName = "You",
  buddies = [],
}) {
  const { fetchChatMessages, sendChatMessage } = useAuth();

  // Friends list (excluding yourself)
  const friends = useMemo(() => buddies.filter((b) => !b.isYou && b.uid), [buddies]);

  // Selected room: "general" OR friend's uid
  const [selectedRoom, setSelectedRoom] = useState("general");
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const messagesEndRef = useRef(null);
  const subscriptionRef = useRef(null);

  // Active buddy if in 1-on-1 DM
  const activeBuddy = useMemo(() => {
    if (selectedRoom === "general") return null;
    return friends.find((f) => f.uid === selectedRoom) || null;
  }, [selectedRoom, friends]);

  // Compute exact room_id for database
  const activeRoomId = useMemo(() => {
    if (selectedRoom === "general" || !activeBuddy) return "general";
    return getDmRoomId(user?.id, activeBuddy.uid);
  }, [selectedRoom, activeBuddy, user?.id]);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Load initial messages for active room
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchChatMessages(activeRoomId).then((data) => {
      if (isMounted) {
        setMessages(data || []);
        setLoading(false);
        setTimeout(() => scrollToBottom(false), 50);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeRoomId, fetchChatMessages, scrollToBottom]);

  // Set up Supabase Realtime subscription for incoming messages
  useEffect(() => {
    if (!supabaseConfigured || !user) return;

    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
    }

    const channel = supabase
      .channel(`chat-room-${activeRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "study_chat_messages",
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          const newMsg = payload.new;
          if (newMsg) {
            setMessages((prev) => {
              // Avoid duplicate if optimistic insert already has it
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            setTimeout(() => scrollToBottom(true), 50);
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [activeRoomId, supabaseConfigured, user, scrollToBottom]);

  // Handle message sending
  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    setInputText("");
    setSending(true);

    const recipientId = activeBuddy ? activeBuddy.uid : null;

    // Optimistic UI update
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      room_id: activeRoomId,
      sender_id: user?.id || "local-user",
      recipient_id: recipientId,
      sender_name: userName,
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 30);

    const result = await sendChatMessage({
      roomId: activeRoomId,
      recipientId,
      content: trimmed,
      senderName: userName,
    });

    setSending(false);

    if (result.ok && result.data) {
      // Replace optimistic message with confirmed server message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? result.data : m))
      );
    }
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentGroup = null;

    messages.forEach((msg) => {
      const groupLabel = getMessageDateGroup(msg.created_at);
      if (!currentGroup || currentGroup.date !== groupLabel) {
        currentGroup = { date: groupLabel, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(msg);
    });

    return groups;
  }, [messages]);

  return (
    <div className="study-chat-container">
      {/* 1. ROOM SELECTOR PILLS */}
      <div className="chat-room-tabs">
        {/* GROUP LOUNGE BUTTON */}
        <button
          type="button"
          className={`chat-tab-pill ${selectedRoom === "general" ? "active" : ""}`}
          onClick={() => setSelectedRoom("general")}
        >
          <Users size={14} />
          <span>Group Lounge</span>
        </button>

        {/* 1-ON-1 FRIEND BUTTONS */}
        {friends.map((f) => {
          const isStudying = (f.todaySessions || []).some((s) => s.isLive || s.isRunning);
          return (
            <button
              key={f.uid}
              type="button"
              className={`chat-tab-pill ${selectedRoom === f.uid ? "active" : ""}`}
              onClick={() => setSelectedRoom(f.uid)}
            >
              <span className="chat-tab-avatar">
                {(f.name || "B").charAt(0).toUpperCase()}
              </span>
              <span>{f.name}</span>
              {isStudying ? (
                <span className="live-dot-pulse" title="Studying now" />
              ) : (
                <span className="idle-dot" />
              )}
            </button>
          );
        })}
      </div>

      {/* 2. CHAT CARD */}
      <div className="chat-main-card glass-card">
        {/* HEADER */}
        <div className="chat-card-header">
          <div className="chat-header-info">
            <div className="chat-header-avatar">
              {activeBuddy ? (
                <span>{(activeBuddy.name || "B").charAt(0).toUpperCase()}</span>
              ) : (
                <Users size={18} color="#4f46e5" />
              )}
            </div>
            <div>
              <h3 className="chat-header-title">
                {activeBuddy ? activeBuddy.name : "Study Group Lounge"}
              </h3>
              <p className="chat-header-status">
                {activeBuddy ? (
                  activeBuddy.todaySessions?.some((s) => s.isLive || s.isRunning) ? (
                    <span className="status-live">🟢 Studying Now</span>
                  ) : (
                    <span className="status-private"><Lock size={10} /> Private 1-on-1 Chat</span>
                  )
                ) : (
                  <span>All connected study buddies</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 3. MESSAGES FEED */}
        <div className="chat-messages-area">
          {loading ? (
            <div className="chat-loading-state">
              <span className="chat-loading-txt">Loading conversation...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty-state">
              <MessageSquare size={36} color="#cbd5e1" />
              <h4>No messages yet</h4>
              <p>
                {activeBuddy
                  ? `Say hello to ${activeBuddy.name} to start your study discussion!`
                  : "Start a group discussion with your study buddies!"}
              </p>
            </div>
          ) : (
            groupedMessages.map((group, gIdx) => (
              <div key={group.date || gIdx} className="chat-date-group">
                <div className="chat-date-divider">
                  <span>{group.date}</span>
                </div>

                {group.items.map((msg) => {
                  const isYou = msg.sender_id === user?.id || msg.sender_id === "local-user";
                  return (
                    <div
                      key={msg.id}
                      className={`chat-bubble-row ${isYou ? "you" : "buddy"}`}
                    >
                      {!isYou && (
                        <div className="chat-bubble-avatar">
                          {(msg.sender_name || "B").charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="chat-bubble-content">
                        {!isYou && selectedRoom === "general" && (
                          <div className="chat-sender-name">{msg.sender_name}</div>
                        )}
                        <div className="chat-bubble-text">{msg.content}</div>
                        <div className="chat-bubble-time">
                          {formatMessageTime(msg.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 4. CLEAN MESSAGE INPUT BAR */}
        <form onSubmit={handleSend} className="chat-input-bar">
          <input
            type="text"
            className="chat-input-field"
            placeholder={activeBuddy ? `Message ${activeBuddy.name}...` : "Message group lounge..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={sending}
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!inputText.trim() || sending}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

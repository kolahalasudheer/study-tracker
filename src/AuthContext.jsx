import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { supabase, supabaseConfigured } from "./supabase";
import { computeStudyStats, resolveDisplayName, mergeActiveTimer, buildDayLogsFromSessions } from "./statsUtils";

const DEFAULT_STATE = {
  sessions: [],
  subjects: [],
  targetHours: 4,
  targetHistory: {},
  checklist: [],
  activeTimer: null,
  displayName: "",
  buddyUids: [],
};

const LOCAL_KEYS = {
  sessions: "study-sessions-v1",
  subjects: "study-subjects-v1",
  targetHours: "study-target-v1",
  targetHistory: "study-target-history-v1",
  targetUpdatedAt: "study-target-updated-v1",
  checklist: "study-checklist-v1",
  activeTimer: "study-active-timer-v1",
  displayName: "study-profile-name-v1",
};

function generateBuddyCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function mapStatsRow(row) {
  return {
    uid: row.user_id,
    name: row.name,
    todayMinutes: row.today_minutes,
    weekMinutes: row.week_minutes,
    streak: row.streak,
    totalMinutes: row.total_minutes,
    buddyCode: row.buddy_code,
    todaySessions: row.today_sessions || [],
    weekDaily: row.week_daily || [],
    updatedAt: row.updated_at,
  };
}

function readLocalState() {
  const state = { ...DEFAULT_STATE };
  try {
    const s = localStorage.getItem(LOCAL_KEYS.sessions);
    if (s) state.sessions = JSON.parse(s);
  } catch {
    /* ignore */
  }
  try {
    const subs = localStorage.getItem(LOCAL_KEYS.subjects);
    if (subs) {
      const parsed = JSON.parse(subs);
      if (parsed.length) state.subjects = parsed;
    }
  } catch {
    /* ignore */
  }
  try {
    const t = localStorage.getItem(LOCAL_KEYS.targetHours);
    if (t) state.targetHours = JSON.parse(t);
  } catch {
    /* ignore */
  }
  try {
    const h = localStorage.getItem(LOCAL_KEYS.targetHistory);
    if (h) state.targetHistory = JSON.parse(h);
  } catch {
    /* ignore */
  }
  try {
    const tu = localStorage.getItem(LOCAL_KEYS.targetUpdatedAt);
    if (tu) state.targetUpdatedAt = JSON.parse(tu);
  } catch {
    /* ignore */
  }
  try {
    const cl = localStorage.getItem(LOCAL_KEYS.checklist);
    if (cl) state.checklist = JSON.parse(cl);
  } catch {
    /* ignore */
  }
  try {
    const a = localStorage.getItem(LOCAL_KEYS.activeTimer);
    if (a) state.activeTimer = JSON.parse(a);
  } catch {
    /* ignore */
  }
  try {
    const n = localStorage.getItem(LOCAL_KEYS.displayName);
    if (n) state.displayName = n;
  } catch {
    /* ignore */
  }
  return state;
}

function writeLocalState(state) {
  try {
    localStorage.setItem(LOCAL_KEYS.sessions, JSON.stringify(state.sessions));
    localStorage.setItem(LOCAL_KEYS.subjects, JSON.stringify(state.subjects));
    localStorage.setItem(LOCAL_KEYS.targetHours, JSON.stringify(state.targetHours));
    localStorage.setItem(LOCAL_KEYS.targetHistory, JSON.stringify(state.targetHistory));
    if (state.targetUpdatedAt) {
      localStorage.setItem(LOCAL_KEYS.targetUpdatedAt, JSON.stringify(state.targetUpdatedAt));
    }
    localStorage.setItem(LOCAL_KEYS.checklist, JSON.stringify(state.checklist));
    if (state.activeTimer) {
      localStorage.setItem(LOCAL_KEYS.activeTimer, JSON.stringify(state.activeTimer));
    } else {
      localStorage.removeItem(LOCAL_KEYS.activeTimer);
    }
    if (state.displayName) {
      localStorage.setItem(LOCAL_KEYS.displayName, state.displayName);
    }
  } catch {
    /* ignore */
  }
}

function mergeTargetFields(primary = {}, secondary = {}) {
  const primaryAt = primary.targetUpdatedAt || 0;
  const secondaryAt = secondary.targetUpdatedAt || 0;
  const newer = secondaryAt > primaryAt ? secondary : primary;
  const older = newer === primary ? secondary : primary;

  let targetHours = newer.targetHours ?? older.targetHours ?? DEFAULT_STATE.targetHours;
  if (
    !newer.targetUpdatedAt &&
    (targetHours == null || targetHours === DEFAULT_STATE.targetHours) &&
    older.targetHours != null &&
    older.targetHours !== DEFAULT_STATE.targetHours
  ) {
    targetHours = older.targetHours;
  }

  return {
    targetHours,
    targetHistory: { ...(older.targetHistory || {}), ...(newer.targetHistory || {}) },
    targetUpdatedAt: Math.max(primaryAt, secondaryAt) || undefined,
  };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [cloudState, setCloudState] = useState(null);
  const [buddyCode, setBuddyCode] = useState("");
  const [buddyStats, setBuddyStats] = useState([]);
  const [syncError, setSyncError] = useState(false);
  const cloudStateRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const channelRef = useRef(null);
  const statsChannelRef = useRef(null);
  const watchedIdsRef = useRef([]);
  const buddyCodeRef = useRef("");

  useEffect(() => {
    cloudStateRef.current = cloudState;
  }, [cloudState]);

  useEffect(() => {
    buddyCodeRef.current = buddyCode;
  }, [buddyCode]);

  const getConnectedBuddyIds = useCallback(async (uid) => {
    const ids = new Set([uid]);
    const { data: outbound } = await supabase.from("buddy_links").select("buddy_id").eq("user_id", uid);
    const { data: inbound } = await supabase.from("buddy_links").select("user_id").eq("buddy_id", uid);
    (outbound || []).forEach((r) => ids.add(r.buddy_id));
    (inbound || []).forEach((r) => ids.add(r.user_id));
    return [...ids];
  }, []);

  const ensureBuddyCode = useCallback(async (uid, name) => {
    const { data: existing } = await supabase.from("public_stats").select("buddy_code, name").eq("user_id", uid).maybeSingle();
    if (existing?.buddy_code) {
      setBuddyCode(existing.buddy_code);
      if (name && !existing.name) {
        await supabase.from("public_stats").update({ name }).eq("user_id", uid);
      }
      return existing.buddy_code;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateBuddyCode();
      const { error: codeError } = await supabase.from("buddy_codes").insert({ code, user_id: uid });
      if (codeError) continue;

      const { error: statsError } = await supabase.from("public_stats").upsert({
        user_id: uid,
        buddy_code: code,
        name: name || "",
        today_minutes: 0,
        week_minutes: 0,
        streak: 0,
        total_minutes: 0,
        today_sessions: [],
        week_daily: [],
      });
      if (!statsError) {
        setBuddyCode(code);
        return code;
      }
    }
    return "";
  }, []);

  const loadBuddyStats = useCallback(
    async (uid) => {
      const ids = await getConnectedBuddyIds(uid);
      watchedIdsRef.current = ids;
      const { data, error } = await supabase.from("public_stats").select("*").in("user_id", ids);
      if (error) {
        setSyncError(true);
        return;
      }
      const entries = (data || []).map(mapStatsRow);
      entries.sort((a, b) => (b.weekMinutes || 0) - (a.weekMinutes || 0));
      setBuddyStats(entries);
    },
    [getConnectedBuddyIds]
  );

  const setupStatsRealtime = useCallback(
    (uid) => {
      if (statsChannelRef.current) supabase.removeChannel(statsChannelRef.current);

      statsChannelRef.current = supabase
        .channel(`public-stats-${uid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "public_stats" }, (payload) => {
          const changedId = payload.new?.user_id || payload.old?.user_id;
          if (watchedIdsRef.current.includes(changedId)) {
            if (payload.new && payload.new.user_id) {
              const updatedEntry = mapStatsRow(payload.new);
              setBuddyStats((prev) => {
                const exists = prev.some((b) => b.uid === updatedEntry.uid);
                const next = exists
                  ? prev.map((b) => (b.uid === updatedEntry.uid ? updatedEntry : b))
                  : [...prev, updatedEntry];
                return next.sort((a, b) => (b.weekMinutes || 0) - (a.weekMinutes || 0));
              });
            } else {
              loadBuddyStats(uid);
            }
          }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "buddy_links" }, () => {
          loadBuddyStats(uid);
        })
        .subscribe();
    },
    [loadBuddyStats]
  );

  const syncDayLogs = useCallback(async (uid, sessions) => {
    if (!uid || !sessions?.length) return true;
    const logs = buildDayLogsFromSessions(sessions);
    if (!logs.length) return true;

    const rows = logs.map((log) => ({
      user_id: uid,
      day: log.date,
      total_minutes: log.totalMinutes,
      by_subject: log.bySubject,
      sessions: log.sessions,
      updated_at: new Date().toISOString(),
    }));

    // Upsert in chunks to avoid payload limits
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from("study_day_logs").upsert(chunk, { onConflict: "user_id,day" });
      if (error) {
        console.warn("study_day_logs sync failed:", error.message);
        setSyncError(true);
        return false;
      }
    }
    return true;
  }, []);

  const fetchDayLogs = useCallback(async (targetUserId, fromDate, toDate) => {
    if (!targetUserId || !supabaseConfigured) return [];
    let query = supabase
      .from("study_day_logs")
      .select("day, total_minutes, by_subject, sessions, updated_at")
      .eq("user_id", targetUserId)
      .order("day", { ascending: true });

    if (fromDate) query = query.gte("day", fromDate);
    if (toDate) query = query.lte("day", toDate);

    const { data, error } = await query;
    if (error) {
      console.warn("fetchDayLogs failed:", error.message);
      return [];
    }
    return (data || []).map((row) => ({
      date: row.day,
      totalMinutes: row.total_minutes || 0,
      bySubject: row.by_subject || {},
      sessions: row.sessions || [],
      updatedAt: row.updated_at,
    }));
  }, []);

  const upsertPublicStats = useCallback(async (uid, stats) => {
    const { error } = await supabase.from("public_stats").upsert({
      user_id: uid,
      name: stats.name,
      today_minutes: stats.todayMinutes,
      week_minutes: stats.weekMinutes,
      streak: stats.streak,
      total_minutes: stats.totalMinutes,
      today_sessions: stats.todaySessions || [],
      week_daily: stats.weekDaily || [],
      buddy_code: buddyCodeRef.current || undefined,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setSyncError(true);
      return false;
    }
    return true;
  }, []);

  const publishStats = useCallback(
    async (stats) => {
      if (!user) return;
      const ok = await upsertPublicStats(user.id, stats);
      if (ok) {
        if (stats.sessions) await syncDayLogs(user.id, stats.sessions);
        await loadBuddyStats(user.id);
      }
    },
    [user, upsertPublicStats, syncDayLogs, loadBuddyStats]
  );

  const publishFromState = useCallback(
    async (authUser, state) => {
      const name = resolveDisplayName(authUser, state.displayName);
      const stats = computeStudyStats(state.sessions || []);
      if (await upsertPublicStats(authUser.id, { name, ...stats })) {
        await syncDayLogs(authUser.id, state.sessions || []);
        await loadBuddyStats(authUser.id);
      }
    },
    [upsertPublicStats, syncDayLogs, loadBuddyStats]
  );

  const bootstrapUser = useCallback(
    async (authUser) => {
      const uid = authUser.id;
      const { data: row } = await supabase.from("user_app_state").select("state").eq("user_id", uid).maybeSingle();

      let state;
      const local = readLocalState();
      if (!row) {
        const name = resolveDisplayName(authUser, local.displayName);
        state = { ...local, displayName: name, buddyUids: [] };
        await supabase.from("user_app_state").upsert({
          user_id: uid,
          state,
          updated_at: new Date().toISOString(),
        });
      } else {
        state = { ...DEFAULT_STATE, ...row.state, ...mergeTargetFields(row.state, local) };
        const cloudTimer = row.state?.activeTimer ?? null;
        const mergedTimer = mergeActiveTimer(state.activeTimer, local.activeTimer);
        const timerChanged = JSON.stringify(mergedTimer ?? null) !== JSON.stringify(cloudTimer);
        const targetChanged =
          state.targetHours !== row.state?.targetHours ||
          JSON.stringify(state.targetHistory || {}) !== JSON.stringify(row.state?.targetHistory || {});
        state = { ...state, activeTimer: mergedTimer ?? null };
        const name = resolveDisplayName(authUser, state.displayName);
        if (name !== state.displayName || timerChanged || targetChanged) {
          state = { ...state, displayName: name };
          await supabase.from("user_app_state").upsert({
            user_id: uid,
            state,
            updated_at: new Date().toISOString(),
          });
        }
      }

      writeLocalState(state);
      setCloudState(state);

      const name = state.displayName;
      await ensureBuddyCode(uid, name);

      if (channelRef.current) supabase.removeChannel(channelRef.current);

      channelRef.current = supabase
        .channel(`user-state-${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_app_state", filter: `user_id=eq.${uid}` },
          (payload) => {
            const incoming = { ...DEFAULT_STATE, ...(payload.new?.state || {}) };
            const local = readLocalState();
            const current = cloudStateRef.current || local;
            const mergedTimer = incoming.activeTimer === null ? null : mergeActiveTimer(incoming.activeTimer, local.activeTimer);
            const next = {
              ...incoming,
              ...mergeTargetFields(incoming, current),
              activeTimer: mergedTimer,
            };
            cloudStateRef.current = next;
            setCloudState(next);
            writeLocalState(next);
            loadBuddyStats(uid);
          }
        )
        .subscribe();

      await loadBuddyStats(uid);
      setupStatsRealtime(uid);

      await publishFromState(authUser, state);

      setAuthReady(true);
    },
    [ensureBuddyCode, loadBuddyStats, setupStatsRealtime, publishFromState]
  );

  useEffect(() => {
    if (!supabaseConfigured) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) bootstrapUser(session.user);
      else setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);

      if (!session?.user) {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
        if (statsChannelRef.current) {
          supabase.removeChannel(statsChannelRef.current);
          statsChannelRef.current = null;
        }
        setCloudState(null);
        setBuddyCode("");
        setBuddyStats([]);
        setAuthReady(true);
        return;
      }

      await bootstrapUser(session.user);
    });

    return () => {
      subscription.unsubscribe();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (statsChannelRef.current) supabase.removeChannel(statsChannelRef.current);
    };
  }, [bootstrapUser]);

  const savePartial = useCallback(
    (partial) => {
      const run = async () => {
        const base = user ? cloudStateRef.current || readLocalState() : readLocalState();
        const merged = { ...base, ...partial };
        if (partial.activeTimer === null) {
          merged.activeTimer = null;
          try {
            localStorage.removeItem(LOCAL_KEYS.activeTimer);
          } catch {
            /* ignore */
          }
        }
        cloudStateRef.current = merged;
        writeLocalState(merged);
        setCloudState(merged);
        if (!user) return true;

        try {
          const { error } = await supabase.from("user_app_state").upsert({
            user_id: user.id,
            state: merged,
            updated_at: new Date().toISOString(),
          });
          if (error) {
            setSyncError(true);
            return false;
          }
          if (partial.displayName) {
            await publishFromState(user, merged);
          }
          return true;
        } catch {
          setSyncError(true);
          return false;
        }
      };

      const queued = saveQueueRef.current.then(run, run);
      saveQueueRef.current = queued.then(
        () => undefined,
        () => undefined
      );
      return queued;
    },
    [user, publishFromState]
  );

  const addBuddy = useCallback(
    async (code) => {
      if (!user || !code.trim()) return { ok: false, error: "Enter a buddy code" };
      const normalized = code.trim().toUpperCase();
      try {
        const { data: match, error } = await supabase.from("buddy_codes").select("user_id").eq("code", normalized).maybeSingle();
        if (error || !match) return { ok: false, error: "Code not found" };
        const buddyUid = match.user_id;
        if (buddyUid === user.id) return { ok: false, error: "That is your own code" };

        const { error: linkError } = await supabase.from("buddy_links").upsert({ user_id: user.id, buddy_id: buddyUid });
        if (linkError) return { ok: false, error: "Could not add buddy" };

        await loadBuddyStats(user.id);
        setupStatsRealtime(user.id);
        return { ok: true };
      } catch {
        setSyncError(true);
        return { ok: false, error: "Could not add buddy" };
      }
    },
    [user, loadBuddyStats, setupStatsRealtime]
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) return { ok: false, error: "Supabase not configured" };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseConfigured) return;
    await supabase.auth.signOut();
  }, []);

  const fetchChatMessages = useCallback(
    async (roomId = "general") => {
      if (!supabaseConfigured || !user) {
        try {
          const cached = localStorage.getItem(`study-chat-${roomId}`);
          return cached ? JSON.parse(cached) : [];
        } catch {
          return [];
        }
      }
      try {
        const { data, error } = await supabase
          .from("study_chat_messages")
          .select("*")
          .eq("room_id", roomId)
          .order("created_at", { ascending: true })
          .limit(150);

        if (error) {
          console.warn("fetchChatMessages error:", error);
          const cached = localStorage.getItem(`study-chat-${roomId}`);
          return cached ? JSON.parse(cached) : [];
        }
        try {
          localStorage.setItem(`study-chat-${roomId}`, JSON.stringify(data || []));
        } catch {}
        return data || [];
      } catch {
        return [];
      }
    },
    [user]
  );

  const sendChatMessage = useCallback(
    async ({ roomId = "general", recipientId = null, content, senderName }) => {
      if (!content || !content.trim()) return { ok: false, error: "Empty message" };
      const trimmed = content.trim();
      const sName = senderName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Student";

      const localMsg = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        room_id: roomId,
        sender_id: user?.id || "local-user",
        recipient_id: recipientId,
        sender_name: sName,
        content: trimmed,
        created_at: new Date().toISOString(),
      };

      if (!supabaseConfigured || !user) {
        try {
          const key = `study-chat-${roomId}`;
          const current = JSON.parse(localStorage.getItem(key) || "[]");
          const next = [...current, localMsg];
          localStorage.setItem(key, JSON.stringify(next));
        } catch {}
        return { ok: true, data: localMsg };
      }

      try {
        const { data, error } = await supabase
          .from("study_chat_messages")
          .insert({
            room_id: roomId,
            sender_id: user.id,
            recipient_id: recipientId,
            sender_name: sName,
            content: trimmed,
          })
          .select()
          .single();

        if (error) {
          console.warn("sendChatMessage error:", error);
          return { ok: false, error: error.message };
        }
        return { ok: true, data: data || localMsg };
      } catch (err) {
        return { ok: false, error: err?.message || "Failed to send message" };
      }
    },
    [user]
  );

  const value = {
    user,
    authReady,
    supabaseConfigured,
    cloudState,
    buddyCode,
    buddyStats,
    syncError,
    savePartial,
    publishStats,
    syncDayLogs,
    fetchDayLogs,
    fetchChatMessages,
    sendChatMessage,
    addBuddy,
    signInWithGoogle,
    signOut,
    refreshBuddies: () => user && loadBuddyStats(user.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { readLocalState, DEFAULT_STATE };

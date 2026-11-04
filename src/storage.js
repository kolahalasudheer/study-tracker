const PRIVATE_PREFIX = "study-private:";
const SHARED_PREFIX = "study-shared:";

function privateKey(key) {
  return `${PRIVATE_PREFIX}${key}`;
}

function sharedKey(key) {
  return `${SHARED_PREFIX}${key}`;
}

async function apiFetch(path, options) {
  try {
    const res = await fetch(path, options);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const storage = {
  async get(key, shared = false) {
    if (shared) {
      const data = await apiFetch(`/api/leaderboard/${encodeURIComponent(key)}`);
      if (data?.value != null) return { key, value: data.value };
      const local = localStorage.getItem(sharedKey(key));
      return local != null ? { key, value: local } : null;
    }
    const val = localStorage.getItem(privateKey(key));
    return val != null ? { key, value: val } : null;
  },

  async set(key, value, shared = false) {
    if (shared) {
      const ok = await apiFetch(`/api/leaderboard/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      localStorage.setItem(sharedKey(key), value);
      return ok != null;
    }
    localStorage.setItem(privateKey(key), value);
    return true;
  },

  async delete(key, shared = false) {
    if (shared) {
      await apiFetch(`/api/leaderboard/${encodeURIComponent(key)}`, { method: "DELETE" });
      localStorage.removeItem(sharedKey(key));
      return true;
    }
    localStorage.removeItem(privateKey(key));
    return true;
  },

  async list(prefix, shared = false) {
    if (shared) {
      const data = await apiFetch(`/api/leaderboard?prefix=${encodeURIComponent(prefix)}`);
      if (data?.keys) return { keys: data.keys };
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(`${SHARED_PREFIX}${prefix}`)) {
          keys.push(k.slice(SHARED_PREFIX.length));
        }
      }
      return { keys };
    }
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${PRIVATE_PREFIX}${prefix}`)) {
        keys.push(k.slice(PRIVATE_PREFIX.length));
      }
    }
    return { keys };
  },
};

if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;

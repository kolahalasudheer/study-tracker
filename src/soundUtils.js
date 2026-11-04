/**
 * Web Audio API procedural sound system for Study Tracker.
 * Synthesizes a warm, pleasant musical chime alarm (rich marimba / bell chime)
 * that repeats continuously until explicitly dismissed by the user.
 *
 * Characteristics:
 * - "Pleasant sound, not too heavy, not too light"
 * - Clear ascending C-Major / E-Pentatonic bell sequence
 * - Natural mallet attack + warm acoustic decay
 * - Repeats every 2.4 seconds until stopped
 */

let activeAlarmInterval = null;
let sharedAudioCtx = null;
let activeGainNodes = [];

function getAudioContext() {
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Prime/unlock the AudioContext on user interaction so background alarms play reliably.
 */
export function unlockAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  } catch {}
}

/**
 * Play a single pleasant bell/marimba chime motif.
 */
function playPleasantMotif(ctx, type = "focus_complete") {
  if (!ctx || ctx.state === "closed") return;

  // Harmonious, soothing notes:
  // Focus complete: Ascending bright chime (C5 -> E5 -> G5 -> C6)
  // Break complete: Calming gentle chime (G5 -> E5 -> C5)
  const notes =
    type === "focus_complete"
      ? [
          { freq: 523.25, time: 0.00, dur: 0.65, vol: 0.26 }, // C5
          { freq: 659.25, time: 0.18, dur: 0.65, vol: 0.28 }, // E5
          { freq: 783.99, time: 0.36, dur: 0.70, vol: 0.30 }, // G5
          { freq: 1046.50, time: 0.54, dur: 0.95, vol: 0.32 }, // C6
        ]
      : [
          { freq: 783.99, time: 0.00, dur: 0.65, vol: 0.26 }, // G5
          { freq: 659.25, time: 0.20, dur: 0.70, vol: 0.28 }, // E5
          { freq: 523.25, time: 0.40, dur: 0.95, vol: 0.30 }, // C5
        ];

  const now = ctx.currentTime;

  notes.forEach(({ freq, time, dur, vol }) => {
    const noteStart = now + time;

    // 1. Fundamental tone: pure warm sine wave
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, noteStart);

    // 2. Harmonic overtone: gentle triangle wave (octave higher, very soft for acoustic body)
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 2, noteStart);

    // Gain nodes for natural mallet percussion envelope
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    // Fundamental envelope: quick 12ms soft attack, organic exponential decay
    gain1.gain.setValueAtTime(0.0001, noteStart);
    gain1.gain.linearRampToValueAtTime(vol, noteStart + 0.014);
    gain1.gain.exponentialRampToValueAtTime(0.0001, noteStart + dur);

    // Overtone envelope: softer, decays faster (wood/metal resonance decay)
    gain2.gain.setValueAtTime(0.0001, noteStart);
    gain2.gain.linearRampToValueAtTime(vol * 0.22, noteStart + 0.010);
    gain2.gain.exponentialRampToValueAtTime(0.0001, noteStart + dur * 0.45);

    osc1.connect(gain1);
    osc2.connect(gain2);

    gain1.connect(ctx.destination);
    gain2.connect(ctx.destination);

    activeGainNodes.push(gain1, gain2);

    osc1.start(noteStart);
    osc2.start(noteStart);

    osc1.stop(noteStart + dur);
    osc2.stop(noteStart + dur);
  });
}

/**
 * Start playing the continuous pleasant chime alarm.
 * Repeats every 2.4 seconds until stopContinuousAlarm() is called.
 */
export function startContinuousAlarm(type = "focus_complete") {
  stopContinuousAlarm();

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        playPleasantMotif(ctx, type);
      }).catch(() => {});
    } else {
      playPleasantMotif(ctx, type);
    }

    // Repeat every 2.4 seconds continuously until user stops it
    activeAlarmInterval = setInterval(() => {
      const activeCtx = getAudioContext();
      if (activeCtx && activeCtx.state !== "closed") {
        playPleasantMotif(activeCtx, type);
      }
    }, 2400);
  } catch (err) {
    console.warn("Could not start continuous alarm:", err);
  }
}

/**
 * Stop and silence the continuous alarm immediately.
 */
export function stopContinuousAlarm() {
  if (activeAlarmInterval) {
    clearInterval(activeAlarmInterval);
    activeAlarmInterval = null;
  }

  // Smoothly fade out any currently ringing notes within 30ms to prevent audio clicks
  if (activeGainNodes.length > 0 && sharedAudioCtx) {
    try {
      const now = sharedAudioCtx.currentTime;
      activeGainNodes.forEach((g) => {
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.linearRampToValueAtTime(0.0001, now + 0.03);
        } catch {}
      });
    } catch {}
    activeGainNodes = [];
  }
}

/**
 * Play a single preview motif (plays once, then stops).
 */
export function playChime(type = "focus_complete") {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume().then(() => playPleasantMotif(ctx, type)).catch(() => {});
      } else {
        playPleasantMotif(ctx, type);
      }
    }
  } catch {}
}

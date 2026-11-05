// Builds an HC Webhook payload like a real phone sends: one night with stages,
// a day of steps, heart rate, HRV, SpO2 and breathing. Times are UTC (BST = UTC+1).
function rand(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296; }

function night(wakeYmd, opts = {}) {
  const r = rand(opts.seed || 7);
  // 01:29 to 10:24 local by default
  const start = new Date(wakeYmd + 'T00:29:00Z').getTime() - (opts.earlier || 0) * 60000;
  const end = new Date(wakeYmd + 'T09:24:00Z').getTime() - (opts.shorter || 0) * 60000;
  const plan = [['light', 25], ['deep', 30], ['light', 40], ['rem', 20], ['awake', 4], ['light', 35], ['deep', 25], ['light', 30], ['rem', 30],
    ['light', 45], ['deep', 20], ['light', 40], ['rem', 25], ['awake', 8], ['light', 50], ['deep', 15], ['light', 40], ['rem', 25], ['light', 60]];
  const stages = [];
  let t = start;
  for (const [stage, mins] of plan) {
    if (t >= end) break;
    const m = Math.max(2, Math.round(mins * (0.85 + r() * 0.3)));
    const e = Math.min(end, t + m * 60000);
    stages.push({ stage, start_time: new Date(t).toISOString(), end_time: new Date(e).toISOString(), duration_seconds: (e - t) / 1000 });
    t = e;
  }
  if (t < end) stages.push({ stage: 'light', start_time: new Date(t).toISOString(), end_time: new Date(end).toISOString(), duration_seconds: (end - t) / 1000 });
  return { session_end_time: new Date(end).toISOString(), duration_seconds: (end - start) / 1000, stages };
}

function day(ymd, opts = {}) {
  const r = rand(opts.seed || 3);
  const steps = [], hr = [], hrv = [], o2 = [], rr = [];
  const stepScale = opts.steps === undefined ? 1 : opts.steps;
  for (let m = 0; m < (opts.untilMin || 24 * 60); m += 15) {
    const h = m / 60, iso = new Date(new Date(ymd + 'T00:00:00Z').getTime() + (m - 60) * 60000).toISOString(); // local midnight = 23:00Z
    const awake = h >= 10.5 && h < 23.5;
    if (awake) steps.push({ count: Math.round((h > 15 && h < 18 ? 900 : 180) * r() * stepScale), start_time: iso, end_time: iso });
    hr.push({ time: iso, avg: Math.round((awake ? 72 : 55) + r() * 12 + (h > 16 && h < 17.5 ? 45 : 0)), min: 50, max: 140, bpm: 70 });
    if (!awake && m % 60 === 0) { hrv.push({ time: iso, rmssd_millis: (opts.hrv || 48) + r() * 8 }); o2.push({ time: iso, percentage: 95 + r() * 3 }); rr.push({ time: iso, rate: 14 + r() * 2 }); }
  }
  return {
    timestamp: new Date().toISOString(), app_version: '1.0',
    steps, heart_rate: hr, heart_rate_variability: hrv, oxygen_saturation: o2, respiratory_rate: rr,
    resting_heart_rate: [{ bpm: opts.rhr || 58, time: ymd + 'T08:00:00Z' }],
    sleep: opts.noSleep ? undefined : [night(ymd, opts)],
    exercise: opts.gym ? [{ type: 'strength_training', start_time: ymd + 'T15:40:00Z', end_time: ymd + 'T16:55:00Z', duration_seconds: 4500 }] : undefined
  };
}

module.exports = { night, day };

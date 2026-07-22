import { supabase } from "./supabase";

// Data-access layer for Phase 2. Maps between the app's object shapes (unchanged
// from the old localStorage era) and the Supabase row/column names, and wraps the
// CRUD calls. The exercise arrays stay JSONB, so they pass through untouched.

const numOrNull = v => (v === "" || v == null || isNaN(Number(v))) ? null : Number(v);
const numOrZero = v => { const n = Number(v); return isNaN(n) ? 0 : n; };

// ---- workouts (was sl_workouts) ----
export function rowToWorkout(r) {
  return {
    id: r.id, title: r.title, tag: r.tag, emoji: r.emoji, source: r.source,
    duration: r.duration_min, level: r.level, influencer: r.influencer,
    isOwn: r.is_own, videoId: r.video_id, youtubeId: r.video_id,
    thumbnailUrl: r.thumbnail_url, notes: r.notes,
    exerciseList: r.exercise_list || [],
  };
}
export function workoutToRow(w, userId) {
  return {
    user_id: userId,
    title: w.title ?? "Untitled workout",
    tag: w.tag ?? null, emoji: w.emoji ?? null, source: w.source ?? null,
    duration_min: numOrNull(w.duration), level: w.level ?? null,
    influencer: w.influencer ?? null, is_own: !!w.isOwn,
    video_id: w.videoId ?? w.youtubeId ?? null, thumbnail_url: w.thumbnailUrl ?? null,
    notes: w.notes ?? null, exercise_list: w.exerciseList ?? [],
    legacy_id: typeof w.id === "number" ? w.id : null,
  };
}

// ---- sessions (was sl_history) ----
export function rowToSession(r) {
  return {
    id: r.id, workoutId: r.workout_id, workoutTitle: r.workout_title,
    date: r.performed_at, duration: r.duration_sec, totalVolume: r.total_volume,
    exercises: r.exercises || [],
  };
}
export function sessionToRow(s, userId, workoutId) {
  return {
    user_id: userId, workout_id: workoutId ?? null,
    workout_title: s.workoutTitle ?? "Workout",
    performed_at: s.date ?? new Date().toISOString(),
    duration_sec: numOrZero(s.duration), total_volume: numOrNull(s.totalVolume),
    exercises: s.exercises ?? [],
    legacy_id: typeof s.id === "number" ? s.id : null,
  };
}

// ---- own_exercises (custom exercise library; was ephemeral React state) ----
export function rowToOwnEx(r) {
  return {
    id: r.id, name: r.name, muscleGroup: r.muscle_group,
    defaultSets: r.default_sets, defaultReps: r.default_reps,
    defaultWeight: r.default_weight, notes: r.notes, videoUrl: r.video_url,
  };
}
export function ownExToRow(e, userId) {
  return {
    user_id: userId, name: e.name ?? "Exercise", muscle_group: e.muscleGroup ?? null,
    default_sets: e.defaultSets ?? null, default_reps: e.defaultReps ?? null,
    default_weight: e.defaultWeight ?? null, notes: e.notes ?? null,
    video_url: e.videoUrl ?? null,
  };
}

// ---- reads ----
export async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data; // may be null for a beat right after signup until the trigger fires
}
export async function fetchAll() {
  const [w, s, o] = await Promise.all([
    supabase.from("workouts").select("*").order("created_at", { ascending: false }),
    supabase.from("sessions").select("*").order("performed_at", { ascending: false }),
    supabase.from("own_exercises").select("*").order("created_at", { ascending: false }),
  ]);
  if (w.error) throw w.error;
  if (s.error) throw s.error;
  if (o.error) throw o.error;
  return {
    workouts: w.data.map(rowToWorkout),
    history: s.data.map(rowToSession),
    ownExercises: o.data.map(rowToOwnEx),
  };
}

// ---- writes ----
export async function insertWorkout(w, userId) {
  const { data, error } = await supabase.from("workouts").insert(workoutToRow(w, userId)).select().single();
  if (error) throw error;
  return rowToWorkout(data);
}
export async function deleteWorkout(id) {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}
export async function insertSession(s, userId, workoutId) {
  const { data, error } = await supabase.from("sessions").insert(sessionToRow(s, userId, workoutId)).select().single();
  if (error) throw error;
  return rowToSession(data);
}
export async function insertOwnExercise(e, userId) {
  const { data, error } = await supabase.from("own_exercises").insert(ownExToRow(e, userId)).select().single();
  if (error) throw error;
  return rowToOwnEx(data);
}
export async function deleteOwnExercise(id) {
  const { error } = await supabase.from("own_exercises").delete().eq("id", id);
  if (error) throw error;
}
export async function setProfileOnboarded(userId) {
  const { error } = await supabase.from("profiles").update({ onboarded: true }).eq("id", userId);
  if (error) throw error;
}

// ---- one-time localStorage -> account import ----
// Inserts the browser's old workouts, remaps each session's numeric workoutId to the
// new uuid, then stamps profiles.migrated_local_at so it never runs twice.
export async function importLocalData(userId, local) {
  const workouts = local.workouts || [];
  const history = local.history || [];
  const idMap = {}; // old Date.now() id -> new uuid

  if (workouts.length) {
    const rows = workouts.map(w => workoutToRow(w, userId));
    const { data, error } = await supabase.from("workouts").insert(rows).select("id, legacy_id");
    if (error) throw error;
    for (const row of data) if (row.legacy_id != null) idMap[row.legacy_id] = row.id;
  }
  if (history.length) {
    const rows = history.map(s => {
      const mapped = typeof s.workoutId === "number" ? (idMap[s.workoutId] ?? null) : (s.workoutId ?? null);
      return sessionToRow(s, userId, mapped);
    });
    const { error } = await supabase.from("sessions").insert(rows);
    if (error) throw error;
  }
  const { error: mErr } = await supabase.from("profiles")
    .update({ migrated_local_at: new Date().toISOString() }).eq("id", userId);
  if (mErr) throw mErr;

  return { workouts: workouts.length, sessions: history.length };
}

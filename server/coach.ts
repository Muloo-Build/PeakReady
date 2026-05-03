import { GoogleGenAI } from "@google/genai";
import type { Session, Metric, GoalEvent, StravaActivity } from "@shared/schema";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
});

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CoachContext {
  goal?: GoalEvent | null;
  sessions: Session[];
  metrics: Metric[];
  stravaActivities: StravaActivity[];
  activeWeek: number;
}

function buildSystemPrompt(ctx: CoachContext): string {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  let goalContext = "No goal event set yet — ask the athlete what they're training for.";
  if (ctx.goal) {
    const eventDate = new Date(ctx.goal.startDate);
    const weeksUntil = Math.max(0, Math.round((eventDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    goalContext = `Goal Event: "${ctx.goal.name}" on ${ctx.goal.startDate} (${weeksUntil} week${weeksUntil !== 1 ? "s" : ""} away)`;
    if (ctx.goal.distanceKm) goalContext += `, ${ctx.goal.distanceKm}km`;
    if (ctx.goal.elevationMeters) goalContext += `, ${ctx.goal.elevationMeters}m elevation`;
    if (ctx.goal.location) goalContext += ` — ${ctx.goal.location}`;
  }

  const totalWeeks = ctx.sessions.length > 0 ? Math.max(...ctx.sessions.map((s) => s.week)) : 0;
  const weekSessions = ctx.sessions.filter((s) => s.week === ctx.activeWeek);
  const completedCount = weekSessions.filter((s) => s.completed).length;
  const upcomingSessions = weekSessions.filter((s) => !s.completed);

  const weekDetail = weekSessions.length > 0
    ? weekSessions.map((s) => {
        let line = `  ${s.day}: [${s.type}] "${s.description}" ${s.minutes}min`;
        if (s.zone && s.zone !== "N/A") line += ` ${s.zone}`;
        if (s.completed) {
          line += " ✓ COMPLETED";
          if (s.rpe) line += ` (RPE ${s.rpe}/10)`;
          if (s.notes) line += ` — "${s.notes}"`;
        }
        return line;
      }).join("\n")
    : "  No sessions scheduled for this week.";

  const overallCompleted = ctx.sessions.filter((s) => s.completed).length;
  const overallTotal = ctx.sessions.length;
  const planSummary = overallTotal > 0
    ? `Overall: ${overallCompleted}/${overallTotal} sessions done (${Math.round((overallCompleted / overallTotal) * 100)}%)`
    : "No training plan loaded.";

  const recentMetrics = [...ctx.metrics]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 7);

  const metricsText = recentMetrics.length > 0
    ? recentMetrics.map((m) => {
        const parts: string[] = [`  ${m.date}:`];
        if (m.weightKg) parts.push(`${Number(m.weightKg).toFixed(1)}kg`);
        if (m.restingHr) parts.push(`resting HR ${m.restingHr}bpm`);
        if (m.fatigue) parts.push(`fatigue ${m.fatigue}/10`);
        if (m.rideMinutes) parts.push(`rode ${m.rideMinutes}min`);
        if (m.longRideKm) parts.push(`long ride ${m.longRideKm}km`);
        if (m.notes) parts.push(`"${m.notes}"`);
        return parts.join(" ");
      }).join("\n")
    : "  No metrics logged yet.";

  const recentStrava = [...ctx.stravaActivities]
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .slice(0, 4);

  const stravaText = recentStrava.length > 0
    ? recentStrava.map((a) => {
        const parts: string[] = [`  "${a.name}" (${new Date(a.startDate).toLocaleDateString()})`];
        if (a.distance) parts.push(`${(Number(a.distance) / 1000).toFixed(1)}km`);
        if (a.movingTime) parts.push(`${Math.round(Number(a.movingTime) / 60)}min`);
        if (a.totalElevationGain) parts.push(`+${a.totalElevationGain}m`);
        if (a.averageHeartrate) parts.push(`avg HR ${a.averageHeartrate}bpm`);
        if (a.averageWatts) parts.push(`avg ${a.averageWatts}W`);
        if (a.sufferScore) parts.push(`suffer ${a.sufferScore}`);
        return parts.join(", ");
      }).join("\n")
    : "  No Strava activities synced yet.";

  return `You are "Peak" — an expert mountain bike and cycling performance coach embedded in the PeakReady training app. You are warm, direct, and genuinely invested in this athlete's success.

TODAY: ${today}
ATHLETE'S TRAINING CONTEXT:
${goalContext}
Training Plan: Week ${ctx.activeWeek} of ${totalWeeks} — ${planSummary}

THIS WEEK (Week ${ctx.activeWeek}):
${weekDetail}

RECENT HEALTH METRICS (last 7 entries):
${metricsText}

RECENT STRAVA ACTIVITIES:
${stravaText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR COACHING APPROACH:

1. USE THEIR DATA — Reference their actual sessions, RPE scores, fatigue levels, and Strava rides. Make them feel you're watching their progress closely.

2. ASK SMART QUESTIONS — Since there's no Apple/Android health sync, you gather information by asking:
   - Sleep quality and hours
   - Energy levels and motivation
   - Muscle soreness or tightness (especially legs, lower back)
   - Hydration and nutrition
   - Life stress outside training
   - How specific sessions felt

3. GIVE ACTIONABLE ADVICE — When you have enough context, give specific, practical recommendations:
   - "Your fatigue is at 8/10 — I'd suggest swapping tomorrow's ride to an easy 30-min spin"
   - "Based on your last Strava ride, your zone 2 HR looks good — let's push that long ride up by 15km"

4. EXPLAIN EXERCISES — When asked about any exercise:
   - Setup and starting position
   - The movement step by step
   - What muscles/energy systems it targets
   - Common mistakes to avoid
   - Why it helps for MTB/cycling specifically

5. MOTIVATION & SUPPORT — Celebrate completions, normalize hard days, help them stay consistent.

RESPONSE STYLE:
- Conversational and human, never robotic or clinical
- 2-4 sentences unless explaining a complex exercise or technique
- Always end with a question OR a specific next action OR an observation about their data
- Never give generic advice when you have specific data to reference
- Keep it coaching, not lecturing`;
}

export async function getCoachReply(
  messages: ChatMessage[],
  ctx: CoachContext
): Promise<string> {
  const systemPrompt = buildSystemPrompt(ctx);

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" as const : "user" as const,
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 800,
      temperature: 0.75,
    },
  });

  return response.text?.trim() || "I'm having trouble responding right now. Please try again.";
}

export function buildGreeting(ctx: CoachContext): string {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? "Morning" : hour < 17 ? "Hey" : "Evening";

  const weekSessions = ctx.sessions.filter((s) => s.week === ctx.activeWeek);
  const completed = weekSessions.filter((s) => s.completed);
  const upcoming = weekSessions.filter((s) => !s.completed);

  const latestMetric = [...ctx.metrics]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const latestStrava = [...ctx.stravaActivities]
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];

  let message = `${timeOfDay}! I'm Peak, your training coach. `;

  if (ctx.goal) {
    const weeksUntil = Math.max(0, Math.round(
      (new Date(ctx.goal.startDate).getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ));
    if (weeksUntil <= 2) {
      message += `${ctx.goal.name} is just ${weeksUntil} week${weeksUntil !== 1 ? "s" : ""} away — it's taper time. `;
    } else if (weeksUntil <= 8) {
      message += `${weeksUntil} weeks until ${ctx.goal.name} — we're in the build phase now. `;
    } else {
      message += `${weeksUntil} weeks to ${ctx.goal.name} — good amount of runway to build your engine. `;
    }
  }

  if (latestMetric?.fatigue && Number(latestMetric.fatigue) >= 8) {
    message += `I noticed your fatigue is at ${latestMetric.fatigue}/10 — that's high. How are you feeling in the legs today? Any heaviness or soreness?`;
  } else if (latestStrava && completed.length > 0) {
    const lastRide = latestStrava.name;
    message += `I can see your last Strava ride was "${lastRide}" — nice work. ${upcoming.length > 0 ? `You've got ${upcoming.length} session${upcoming.length > 1 ? "s" : ""} left this week.` : "Week's looking solid."} How's recovery going?`;
  } else if (upcoming.length > 0) {
    const next = upcoming[0];
    message += `You've got ${weekSessions.length > 0 ? `${completed.length}/${weekSessions.length} done this week` : "your plan loaded"}. Next up is ${next.day}'s ${next.description}. How are you feeling heading into it — any soreness or fatigue I should know about?`;
  } else if (ctx.sessions.length === 0) {
    message += `Looks like you don't have a training plan loaded yet. Want me to help you build one, or tell me about your goal and I can give you some direction?`;
  } else {
    message += `Week ${ctx.activeWeek} is looking good. What's on your mind — anything about your training I can help with today?`;
  }

  return message;
}

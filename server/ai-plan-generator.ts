import { GoogleGenAI } from "@google/genai";
import type { InsertSession } from "@shared/schema";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
});

export interface PlanRequest {
  eventName: string;
  eventDate: string;
  eventDistance?: number;
  eventElevation?: number;
  fitnessLevel: "beginner" | "intermediate" | "advanced";
  goals: string[];
  currentWeight?: number;
  targetWeight?: number;
  daysPerWeek: number;
  hoursPerWeek: number;
  equipment: "gym" | "home_full" | "home_minimal" | "no_equipment";
  injuries?: string;
  additionalNotes?: string;
}

const WEEKDAY_SCHEDULES: Record<number, string[]> = {
  3: ["Tuesday", "Thursday", "Saturday"],
  4: ["Monday", "Wednesday", "Friday", "Saturday"],
  5: ["Monday", "Tuesday", "Thursday", "Friday", "Saturday"],
  6: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  7: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

function buildPrompt(req: PlanRequest): string {
  const now = new Date();
  const eventDate = new Date(req.eventDate);
  const weeksUntilEvent = Math.max(1, Math.round((eventDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const totalWeeks = Math.min(weeksUntilEvent, 16);

  const days = WEEKDAY_SCHEDULES[req.daysPerWeek] || WEEKDAY_SCHEDULES[4];
  const minutesPerSession = Math.floor((req.hoursPerWeek * 60) / req.daysPerWeek);

  const equipmentDesc: Record<string, string> = {
    gym: "Full gym (barbells, dumbbells, cable machines, leg press)",
    home_full: "Home gym (dumbbells, resistance bands, pull-up bar, bench)",
    home_minimal: "Minimal (resistance bands, bodyweight only)",
    no_equipment: "Bodyweight only — no equipment",
  };

  const exerciseExamples =
    req.equipment === "no_equipment" || req.equipment === "home_minimal"
      ? "push-ups, squats, lunges, planks, glute bridges, step-ups, wall sits, single-leg deadlifts"
      : req.equipment === "home_full"
        ? "dumbbell squats, dumbbell lunges, resistance band pulls, dumbbell rows, bench press, pull-ups"
        : "barbell squats, deadlifts, leg press, cable rows, bench press, lat pulldowns, leg curls";

  return `You are an expert cycling coach. Generate a ${totalWeeks}-week structured training plan as a JSON array.

EVENT: "${req.eventName}" on ${req.eventDate} (${weeksUntilEvent} weeks away)${req.eventDistance ? `, ${req.eventDistance}km` : ""}${req.eventElevation ? `, ${req.eventElevation}m elevation` : ""}
ATHLETE: ${req.fitnessLevel}, ${req.daysPerWeek} days/week (~${minutesPerSession} min/session), goals: ${req.goals.join(", ")}
EQUIPMENT: ${equipmentDesc[req.equipment]}${req.injuries ? `\nLIMITATIONS: ${req.injuries}` : ""}${req.additionalNotes ? `\nNOTES: ${req.additionalNotes}` : ""}

STRICT RULES:
- Exactly ${req.daysPerWeek} sessions per week for all ${totalWeeks} weeks (total: ${totalWeeks * req.daysPerWeek} sessions)
- Each week's sessions use these days IN ORDER: ${days.join(", ")}
- Session durations: approximately ${minutesPerSession} minutes (vary ±20 for rest/long days)
- Periodization: weeks 1-${Math.floor(totalWeeks * 0.5)} base, weeks ${Math.floor(totalWeeks * 0.5) + 1}-${Math.floor(totalWeeks * 0.85)} build, final weeks taper
- Strength exercises ONLY from: ${exerciseExamples}
- "details" must be plain text, no markdown, max 3 sentences: warmup → main set → cooldown

Return a JSON array of exactly ${totalWeeks * req.daysPerWeek} objects. Each object:
{
  "weekNumber": <integer 1-${totalWeeks}>,
  "day": <one of: ${days.map((d) => `"${d}"`).join(", ")}>,
  "type": <"Ride" | "Long Ride" | "Strength" | "Rest">,
  "description": <short title string>,
  "minutes": <integer>,
  "zone": <"Zone 1" | "Zone 2" | "Zone 3" | "Zone 4" | "Zone 5" | "N/A">,
  "details": <plain text instructions>
}`;
}

export async function generateAIPlan(req: PlanRequest): Promise<InsertSession[]> {
  const prompt = buildPrompt(req);

  const weeksUntilEvent = Math.max(1, Math.round((new Date(req.eventDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)));
  const totalWeeks = Math.min(weeksUntilEvent, 16);
  const expectedCount = totalWeeks * req.daysPerWeek;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      maxOutputTokens: 16384,
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const text = response.text || "";
  console.log(`AI response: ${text.length} chars, expected ~${expectedCount} sessions`);

  if (!text.trim()) {
    throw new Error("AI returned an empty response. Please try again.");
  }

  let parsed: any[];
  try {
    parsed = JSON.parse(text.trim());
  } catch (e: any) {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonMatch = (codeBlockMatch ? codeBlockMatch[1] : text).match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("AI response (first 500 chars):", text.substring(0, 500));
      throw new Error("AI did not return a valid JSON plan. Please try again.");
    }
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error("Failed to parse AI response. Please try again.");
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI returned an empty plan. Please try again.");
  }

  const days = WEEKDAY_SCHEDULES[req.daysPerWeek] || WEEKDAY_SCHEDULES[4];
  const validTypes = ["Ride", "Long Ride", "Strength", "Rest"];
  const validZones = ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5", "N/A"];

  const sessions: InsertSession[] = parsed.map((s: any, i: number) => {
    const weekNum = Math.max(1, Math.min(totalWeeks, Number(s.weekNumber || s.week) || 1));
    const sessionInWeek = parsed.slice(0, i).filter((x: any) =>
      (Number(x.weekNumber || x.week) || 1) === weekNum
    ).length;
    const assignedDay = validTypes.includes(s.type) && s.day && days.includes(s.day)
      ? s.day
      : days[Math.min(sessionInWeek, days.length - 1)];

    return {
      id: `ai-w${weekNum}-s${i + 1}`,
      week: weekNum,
      day: assignedDay,
      type: validTypes.includes(s.type) ? s.type : "Ride",
      description: String(s.description || "Training Session").substring(0, 100),
      minutes: Math.max(15, Math.min(300, Number(s.minutes) || 60)),
      zone: validZones.includes(s.zone) ? s.zone : null,
      elevation: null,
      strength: s.type === "Strength",
      completed: false,
      completedAt: null,
      rpe: null,
      notes: null,
      detailsMarkdown: String(s.details || s.detailsMarkdown || "").substring(0, 1000),
      scheduledDate: null,
    };
  });

  console.log(`Generated ${sessions.length} sessions across weeks 1-${totalWeeks}`);
  return sessions;
}

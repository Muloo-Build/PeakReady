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

function buildPrompt(req: PlanRequest): string {
  const now = new Date();
  const eventDate = new Date(req.eventDate);
  const weeksUntilEvent = Math.max(1, Math.round((eventDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const totalWeeks = Math.min(weeksUntilEvent, 16);

  const equipmentDesc: Record<string, string> = {
    gym: "Full gym access (barbells, dumbbells, cable machines, leg press, etc.)",
    home_full: "Home gym with dumbbells, resistance bands, pull-up bar, and bench",
    home_minimal: "Minimal home equipment (resistance bands, bodyweight exercises)",
    no_equipment: "No equipment at all (bodyweight only)",
  };

  const exerciseExamples =
    req.equipment === "no_equipment" || req.equipment === "home_minimal"
      ? "push-ups, squats, lunges, planks, glute bridges, step-ups, wall sits, single-leg deadlifts, burpees, mountain climbers"
      : req.equipment === "home_full"
        ? "dumbbell squats, dumbbell lunges, resistance band pulls, dumbbell rows, bench press, pull-ups, dumbbell deadlifts"
        : "barbell squats, deadlifts, leg press, cable rows, bench press, lat pulldowns, leg curls";

  return `You are an expert cycling coach. Create a ${totalWeeks}-week training plan.

EVENT: ${req.eventName} on ${req.eventDate} (${weeksUntilEvent} weeks away)
${req.eventDistance ? `Distance: ${req.eventDistance}km` : ""}
${req.eventElevation ? `Elevation: ${req.eventElevation}m` : ""}

ATHLETE: ${req.fitnessLevel} level, ${req.daysPerWeek} days/week, ${req.hoursPerWeek} hours/week
Equipment: ${equipmentDesc[req.equipment]}
Goals: ${req.goals.join(", ")}
${req.currentWeight ? `Weight: ${req.currentWeight}kg` : ""}${req.targetWeight ? ` -> ${req.targetWeight}kg target` : ""}
${req.injuries ? `Limitations: ${req.injuries}` : ""}
${req.additionalNotes ? `Notes: ${req.additionalNotes}` : ""}

Return a JSON array of sessions. Each object must have:
- "weekNumber": number (1-${totalWeeks})
- "type": "Ride" | "Long Ride" | "Strength" | "Rest"
- "description": short title (e.g. "Zone 2 Base Ride")
- "minutes": duration number
- "zone": "Zone 1" | "Zone 2" | "Zone 3" | "Zone 4" | "Zone 5" | "N/A"
- "details": brief workout instructions (2-4 sentences, no markdown)

Rules:
- ${req.daysPerWeek} sessions per week, within ${req.hoursPerWeek} total hours
- Periodization: base -> intensity -> taper
- Strength exercises only with available equipment (${exerciseExamples})
- Keep "details" concise: warmup, main set, cooldown in plain text
- Progressive overload across weeks

Return ONLY a JSON array, no other text.`;
}

export async function generateAIPlan(req: PlanRequest): Promise<InsertSession[]> {
  const prompt = buildPrompt(req);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      maxOutputTokens: 16384,
      temperature: 0.7,
      responseMimeType: "application/json",
    },
  });

  const text = response.text || "";
  console.log("AI response length:", text.length, "chars");

  let cleaned = text.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("AI response (first 500 chars):", text.substring(0, 500));
    throw new Error("AI did not return a valid training plan. Please try again.");
  }

  let parsed: any[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    console.error("JSON parse error:", e.message);
    console.error("Attempted to parse (first 500 chars):", jsonMatch[0].substring(0, 500));
    throw new Error("Failed to parse AI response. Please try again.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI returned an empty plan. Please try again.");
  }

  const validTypes = ["Ride", "Long Ride", "Strength", "Rest"];
  const validZones = ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5", "N/A"];
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const sessions: InsertSession[] = parsed.map((s: any, i: number) => {
    const weekNum = Number(s.weekNumber || s.week) || 1;
    const sessionInWeek = parsed.filter((x: any) => (Number(x.weekNumber || x.week) || 1) === weekNum).indexOf(s);

    return {
      id: s.id || `ai-w${weekNum}-s${i + 1}`,
      week: weekNum,
      day: s.day || dayNames[Math.min(sessionInWeek, 6)] || "Monday",
      type: validTypes.includes(s.type) ? s.type : "Ride",
      description: String(s.description || "Training Session"),
      minutes: Number(s.scheduledMinutes || s.minutes) || 60,
      zone: validZones.includes(s.zone) ? s.zone : null,
      elevation: null,
      strength: s.type === "Strength",
      completed: false,
      completedAt: null,
      rpe: null,
      notes: null,
      detailsMarkdown: String(s.detailsMarkdown || s.details || ""),
      scheduledDate: null,
    };
  });

  return sessions;
}

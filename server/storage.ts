import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  sessions,
  metrics,
  serviceItems,
  goalEvents,
  appSettings,
  stravaActivities,
  type Session,
  type InsertSession,
  type Metric,
  type InsertMetric,
  type ServiceItem,
  type InsertServiceItem,
  type GoalEvent,
  type InsertGoalEvent,
  type StravaActivity,
  type InsertStravaActivity,
} from "@shared/schema";

export interface IStorage {
  getSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | undefined>;
  upsertSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined>;
  upsertManySessions(sessionList: InsertSession[]): Promise<void>;
  deleteAllSessions(): Promise<void>;

  getMetrics(): Promise<Metric[]>;
  createMetric(metric: InsertMetric): Promise<Metric>;

  getServiceItems(): Promise<ServiceItem[]>;
  upsertServiceItem(item: InsertServiceItem): Promise<ServiceItem>;
  updateServiceItem(id: string, updates: Partial<ServiceItem>): Promise<ServiceItem | undefined>;

  getGoal(): Promise<GoalEvent | null>;
  upsertGoal(goal: InsertGoalEvent): Promise<GoalEvent>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  getStravaActivities(): Promise<StravaActivity[]>;
  upsertStravaActivity(activity: InsertStravaActivity): Promise<StravaActivity>;
  deleteAllStravaActivities(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getSessions(): Promise<Session[]> {
    return db.select().from(sessions);
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session;
  }

  async upsertSession(session: InsertSession): Promise<Session> {
    const [result] = await db
      .insert(sessions)
      .values(session)
      .onConflictDoUpdate({
        target: sessions.id,
        set: session,
      })
      .returning();
    return result;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined> {
    const [result] = await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, id))
      .returning();
    return result;
  }

  async upsertManySessions(sessionList: InsertSession[]): Promise<void> {
    if (sessionList.length === 0) return;
    const CHUNK = 50;
    for (let i = 0; i < sessionList.length; i += CHUNK) {
      const chunk = sessionList.slice(i, i + CHUNK);
      await db.insert(sessions).values(chunk).onConflictDoNothing();
    }
  }

  async deleteAllSessions(): Promise<void> {
    await db.delete(sessions);
  }

  async getMetrics(): Promise<Metric[]> {
    return db.select().from(metrics);
  }

  async createMetric(metric: InsertMetric): Promise<Metric> {
    const [result] = await db.insert(metrics).values(metric).returning();
    return result;
  }

  async getServiceItems(): Promise<ServiceItem[]> {
    return db.select().from(serviceItems);
  }

  async upsertServiceItem(item: InsertServiceItem): Promise<ServiceItem> {
    const [result] = await db
      .insert(serviceItems)
      .values(item)
      .onConflictDoUpdate({
        target: serviceItems.id,
        set: item,
      })
      .returning();
    return result;
  }

  async updateServiceItem(id: string, updates: Partial<ServiceItem>): Promise<ServiceItem | undefined> {
    const [result] = await db
      .update(serviceItems)
      .set(updates)
      .where(eq(serviceItems.id, id))
      .returning();
    return result;
  }

  async getGoal(): Promise<GoalEvent | null> {
    const goals = await db.select().from(goalEvents);
    return goals[0] ?? null;
  }

  async upsertGoal(goal: InsertGoalEvent): Promise<GoalEvent> {
    const existing = await this.getGoal();
    if (existing) {
      await db.delete(goalEvents).where(eq(goalEvents.id, existing.id));
    }
    const [result] = await db.insert(goalEvents).values(goal).returning();
    return result;
  }

  async getSetting(key: string): Promise<string | null> {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key));
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value },
      });
  }

  async getStravaActivities(): Promise<StravaActivity[]> {
    return db.select().from(stravaActivities);
  }

  async upsertStravaActivity(activity: InsertStravaActivity): Promise<StravaActivity> {
    const [result] = await db
      .insert(stravaActivities)
      .values(activity)
      .onConflictDoUpdate({
        target: stravaActivities.id,
        set: activity,
      })
      .returning();
    return result;
  }

  async deleteAllStravaActivities(): Promise<void> {
    await db.delete(stravaActivities);
  }
}

export const storage = new DatabaseStorage();

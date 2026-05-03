import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Home,
  CalendarDays,
  Activity,
  Wrench,
  MountainSnow,
  User,
} from "lucide-react";
import { Dashboard } from "@/pages/dashboard";
import { TrainingPlan } from "@/pages/training-plan";
import { Metrics } from "@/pages/metrics";
import { ServiceTracker } from "@/pages/service-tracker";
import { EventTracker } from "@/pages/event-tracker";
import { LoginPage } from "@/pages/login";
import { AiCoachChat } from "@/components/ai-coach-chat";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Session, Metric, ServiceItem, GoalEvent } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

type Tab = "dashboard" | "plan" | "metrics" | "service" | "events";

function MainApp() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [activeWeek, setActiveWeek] = useState(1);

  const { data: savedWeek } = useQuery<{ value: string | null }>({
    queryKey: ["/api/settings", "activeWeek"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (savedWeek?.value) {
      const parsed = parseInt(savedWeek.value, 10);
      if (parsed >= 1 && parsed <= 12) setActiveWeek(parsed);
    }
  }, [savedWeek]);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
    enabled: isAuthenticated,
  });

  const { data: metrics = [], isLoading: metricsLoading } = useQuery<Metric[]>({
    queryKey: ["/api/metrics"],
    enabled: isAuthenticated,
  });

  const { data: serviceItems = [], isLoading: serviceLoading } = useQuery<ServiceItem[]>({
    queryKey: ["/api/service-items"],
    enabled: isAuthenticated,
  });

  const { data: goal, isLoading: goalLoading } = useQuery<GoalEvent | null>({
    queryKey: ["/api/goal"],
    enabled: isAuthenticated,
  });

  const handleWeekChange = async (week: number) => {
    setActiveWeek(week);
    try {
      await apiRequest("PUT", "/api/settings/activeWeek", { value: week.toString() });
    } catch {}
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-primary animate-pulse" />
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-brand-text">
              Peak
            </span>
            <span className="text-xl font-bold text-gradient-primary">Ready</span>
          </div>
          <div className="text-brand-muted text-xs uppercase tracking-widest font-bold">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const isLoading = sessionsLoading || metricsLoading || serviceLoading || goalLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-primary animate-pulse" />
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-brand-text">
              Peak
            </span>
            <span className="text-xl font-bold text-gradient-primary">Ready</span>
          </div>
          <div className="text-brand-muted text-xs uppercase tracking-widest font-bold">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-brand-text font-sans pb-24">
      <header className="glass-panel rounded-none border-x-0 border-t-0 p-4 z-50 flex items-center justify-between">
        <div className="w-9" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <MountainSnow size={18} className="text-brand-bg" />
          </div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-app-title">
            Peak<span className="text-gradient-primary">Ready</span>
          </h1>
        </div>
        <button
          onClick={() => logout()}
          className="w-9 h-9 rounded-full flex items-center justify-center text-brand-muted hover:text-brand-text transition-colors overflow-hidden"
          title="Sign out"
          data-testid="button-logout"
        >
          {user?.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="w-9 h-9 rounded-full object-cover"
              data-testid="img-user-avatar"
            />
          ) : (
            <User size={18} />
          )}
        </button>
      </header>

      <main className="max-w-lg mx-auto w-full pb-4 pt-4 relative">
        {activeTab === "dashboard" && (
          <Dashboard
            sessions={sessions}
            metrics={metrics}
            goal={goal || undefined}
            activeWeek={activeWeek}
            onWeekChange={handleWeekChange}
          />
        )}
        {activeTab === "plan" && (
          <TrainingPlan sessions={sessions} activeWeek={activeWeek} goal={goal || undefined} />
        )}
        {activeTab === "metrics" && <Metrics metrics={metrics} />}
        {activeTab === "service" && (
          <ServiceTracker serviceItems={serviceItems} />
        )}
        {activeTab === "events" && (
          <EventTracker goal={goal || undefined} />
        )}
      </main>

      <AiCoachChat
        sessions={sessions}
        metrics={metrics}
        goal={goal || undefined}
        activeWeek={activeWeek}
      />

      <nav className="fixed bottom-0 w-full glass-panel rounded-none border-x-0 border-b-0 px-4 py-3 flex justify-between items-center z-30 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
        <NavItem
          icon={<Home size={22} />}
          label="Dash"
          isActive={activeTab === "dashboard"}
          onClick={() => setActiveTab("dashboard")}
          testId="nav-dashboard"
        />
        <NavItem
          icon={<CalendarDays size={22} />}
          label="Plan"
          isActive={activeTab === "plan"}
          onClick={() => setActiveTab("plan")}
          testId="nav-plan"
        />
        <NavItem
          icon={<MountainSnow size={24} />}
          label="Events"
          isActive={activeTab === "events"}
          isHighlight={true}
          onClick={() => setActiveTab("events")}
          testId="nav-events"
        />
        <NavItem
          icon={<Activity size={22} />}
          label="Metrics"
          isActive={activeTab === "metrics"}
          onClick={() => setActiveTab("metrics")}
          testId="nav-metrics"
        />
        <NavItem
          icon={<Wrench size={22} />}
          label="Bike"
          isActive={activeTab === "service"}
          onClick={() => setActiveTab("service")}
          testId="nav-service"
        />
      </nav>
    </div>
  );
}

function NavItem({
  icon,
  label,
  isActive,
  isHighlight,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  isHighlight?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center w-14 transition-all duration-300 relative",
        isActive && !isHighlight
          ? "text-brand-primary font-medium drop-shadow-[0_0_8px_rgba(65,209,255,0.8)]"
          : "text-brand-muted",
        isHighlight && "text-brand-text"
      )}
      data-testid={testId}
    >
      {isHighlight && (
        <div className="absolute inset-0 bg-gradient-primary blur-lg opacity-20 -z-10 rounded-full scale-150" />
      )}
      <div
        className={cn(
          "mb-1 flex items-center justify-center",
          isActive && !isHighlight && "scale-110",
          isHighlight &&
            "p-3 rounded-full bg-gradient-primary shadow-[0_0_15px_rgba(189,52,254,0.5)] -mt-6 ring-4 ring-brand-bg",
          isActive &&
            isHighlight &&
            "scale-110 shadow-[0_0_25px_rgba(65,209,255,0.8)] ring-brand-panel"
        )}
      >
        {icon}
      </div>
      <span
        className={cn(
          "text-[10px] uppercase tracking-wider",
          isHighlight && "mt-1"
        )}
      >
        {label}
      </span>
    </button>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <MainApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

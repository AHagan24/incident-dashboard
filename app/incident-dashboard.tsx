"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from "react";
import posthog from "posthog-js";
import { io, type Socket } from "socket.io-client";
import type {
  IncidentPriority,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
} from "@/lib/types";

type IncidentResponse = {
  incidents: IncidentRecord[];
};

type IncidentMutationResponse = {
  incident: IncidentRecord;
  message?: string;
};

type Toast = {
  id: number;
  message: string;
  tone: "success" | "error";
};

type FormState = {
  title: string;
  description: string;
  priority: IncidentPriority;
  severity: IncidentSeverity;
  status: IncidentStatus;
  service: string;
  assignee: string;
};

type StatusFilter = IncidentStatus | "All";
type PriorityFilter = IncidentPriority | "All";
type SeverityFilter = IncidentSeverity | "All";

const defaultForm: FormState = {
  title: "",
  description: "",
  priority: "P2",
  severity: "High",
  status: "Open",
  service: "",
  assignee: "",
};

const statusTone: Record<IncidentStatus, string> = {
  Open: "bg-red-500/15 text-red-200 ring-red-400/30",
  Investigating: "bg-amber-500/15 text-amber-100 ring-amber-300/30",
  Monitoring: "bg-sky-500/15 text-sky-100 ring-sky-300/30",
  Resolved: "bg-emerald-500/15 text-emerald-100 ring-emerald-300/30",
};

const priorityTone: Record<IncidentPriority, string> = {
  P1: "bg-red-500/15 text-red-100 ring-red-400/30",
  P2: "bg-orange-500/15 text-orange-100 ring-orange-400/30",
  P3: "bg-yellow-500/15 text-yellow-100 ring-yellow-300/30",
  P4: "bg-slate-500/15 text-slate-100 ring-slate-300/30",
};

const severityTone: Record<IncidentSeverity, string> = {
  Critical: "bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-400/30",
  High: "bg-rose-500/15 text-rose-100 ring-rose-400/30",
  Medium: "bg-sky-500/15 text-sky-100 ring-sky-300/30",
  Low: "bg-emerald-500/15 text-emerald-100 ring-emerald-300/30",
};

const statusFilters: readonly StatusFilter[] = [
  "All",
  "Open",
  "Investigating",
  "Monitoring",
  "Resolved",
];

const priorityFilters: readonly PriorityFilter[] = ["All", "P1", "P2", "P3", "P4"];
const severityFilters: readonly SeverityFilter[] = [
  "All",
  "Critical",
  "High",
  "Medium",
  "Low",
];

export default function IncidentDashboard() {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingIncidentId, setUpdatingIncidentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("All");
  const [activePriority, setActivePriority] = useState<PriorityFilter>("All");
  const [activeSeverity, setActiveSeverity] = useState<SeverityFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef<number[]>([]);

  function showToast(message: string, tone: Toast["tone"]) {
    const id = toastIdRef.current++;
    setToasts((current) => [...current, { id, message, tone }]);

    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);

    toastTimeoutsRef.current.push(timeoutId);
  }

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, []);

  const refreshIncidents = useEffectEvent(async () => {
    try {
      setError(null);
      const response = await fetch("/api/incidents", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Failed to load incidents");
      }

      const data = (await response.json()) as IncidentResponse;
      setIncidents(data.incidents);
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to load incidents";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    refreshIncidents();
    posthog.capture("incident_dashboard_viewed");
  }, [refreshIncidents]);

  useEffect(() => {
    let socket: Socket | undefined;

    try {
      socket = io({
        path: "/socket.io",
      });

      socket.on("incident:created", (incident: IncidentRecord) => {
        setIncidents((current) => {
          const next = current.filter((item) => item._id !== incident._id);
          return [incident, ...next];
        });
      });

      socket.on("incident:updated", (incident: IncidentRecord) => {
        setIncidents((current) =>
          current.map((item) => (item._id === incident._id ? incident : item)),
        );
      });

      socket.on("connect_error", () => {
        setError((current) => current ?? "Live updates are temporarily offline.");
      });
    } catch {
      setError((current) => current ?? "Live updates are temporarily offline.");
    }

    return () => {
      socket?.disconnect();
    };
  }, []);

  const filteredIncidents = incidents.filter((incident) => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const matchesStatus =
      activeStatus === "All" || incident.status === activeStatus;
    const matchesPriority =
      activePriority === "All" || incident.priority === activePriority;
    const matchesSeverity =
      activeSeverity === "All" || incident.severity === activeSeverity;
    const matchesSearch =
      normalizedSearch.length === 0 ||
      [incident.title, incident.service, incident.assignee].some((value) =>
        value?.toLowerCase().includes(normalizedSearch),
      );

    return matchesStatus && matchesPriority && matchesSeverity && matchesSearch;
  });

  const hasActiveSecondaryFilters =
    activePriority !== "All" ||
    activeSeverity !== "All" ||
    searchQuery.trim().length > 0;

  const statusSummary = {
    Open: 0,
    Investigating: 0,
    Monitoring: 0,
    Resolved: 0,
  } satisfies Record<IncidentStatus, number>;

  incidents.forEach((incident) => {
    statusSummary[incident.status] += 1;
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message ?? "Failed to create incident");
      }

      posthog.capture("incident_created", {
        priority: form.priority,
        severity: form.severity,
        status: form.status,
        service: form.service || "unspecified",
      });
      showToast("Incident created and broadcast.", "success");

      startTransition(() => {
        setForm(defaultForm);
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to create incident";

      setError(message);
      showToast(message, "error");
      posthog.capture("incident_create_failed", { message });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, status: IncidentStatus) {
    setUpdatingIncidentId(id);
    setError(null);

    try {
      const response = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = (await response.json()) as IncidentMutationResponse;

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to update incident");
      }

      setIncidents((current) =>
        current.map((incident) =>
          incident._id === id ? data.incident : incident,
        ),
      );
      showToast(`Status updated to ${status}.`, "success");
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Failed to update incident";
      setError(message);
      showToast(message, "error");
    } finally {
      setUpdatingIncidentId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.22),_transparent_28%),linear-gradient(180deg,#111827_0%,#0f172a_45%,#020617_100%)] text-white">
      <ToastViewport toasts={toasts} />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-red-950/20 backdrop-blur sm:grid-cols-[1.7fr_1fr]">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.35em] text-red-200/80">
              Realtime Ops Center
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Live incident visibility across your services, teams, and response queue.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              MongoDB stores the source of truth, Socket.IO fans updates to every
              connected dashboard, and PostHog captures how the team is using the
              surface.
            </p>
          </div>

          <div className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/50 p-4">
            <StatCard label="Open" value={statusSummary.Open} />
            <StatCard label="Investigating" value={statusSummary.Investigating} />
            <StatCard label="Monitoring" value={statusSummary.Monitoring} />
            <StatCard label="Resolved" value={statusSummary.Resolved} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/20"
          >
            <div>
              <h2 className="text-xl font-semibold text-white">Create incident</h2>
              <p className="mt-1 text-sm text-slate-400">
                Ship updates into MongoDB and broadcast them live.
              </p>
            </div>

            <Field
              label="Title"
              required
              value={form.title}
              onChange={(value) => setForm((current) => ({ ...current, title: value }))}
              placeholder="Database latency spike in us-east-1"
            />

            <TextAreaField
              label="Description"
              required
              value={form.description}
              onChange={(value) =>
                setForm((current) => ({ ...current, description: value }))
              }
              placeholder="What is happening, who is impacted, and what has changed?"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Priority"
                value={form.priority}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    priority: value as IncidentPriority,
                  }))
                }
                options={["P1", "P2", "P3", "P4"]}
              />

              <SelectField
                label="Severity"
                value={form.severity}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    severity: value as IncidentSeverity,
                  }))
                }
                options={["Critical", "High", "Medium", "Low"]}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Status"
                value={form.status}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    status: value as IncidentStatus,
                  }))
                }
                options={["Open", "Investigating", "Monitoring", "Resolved"]}
              />

              <Field
                label="Service"
                value={form.service}
                onChange={(value) => setForm((current) => ({ ...current, service: value }))}
                placeholder="payments-api"
              />
            </div>

            <Field
              label="Assignee"
              value={form.assignee}
              onChange={(value) => setForm((current) => ({ ...current, assignee: value }))}
              placeholder="On-call SRE"
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-red-950"
            >
              {isSubmitting ? "Creating incident..." : "Broadcast incident"}
            </button>

            {error ? (
              <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}
          </form>

          <section className="space-y-4">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Filters
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    Narrow incidents by status, priority, and severity.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveStatus("All");
                    setActivePriority("All");
                    setActiveSeverity("All");
                    setSearchQuery("");
                  }}
                  disabled={
                    activeStatus === "All" &&
                    activePriority === "All" &&
                    activeSeverity === "All" &&
                    searchQuery.trim().length === 0
                  }
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear filters
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {statusFilters.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setActiveStatus(status)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      activeStatus === status
                        ? "border-red-300/50 bg-red-400/15 text-red-100"
                        : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Search"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search title, service, or assignee"
                />

                <SelectField
                  label="Priority"
                  value={activePriority}
                  onChange={(value) => setActivePriority(value as PriorityFilter)}
                  options={[...priorityFilters]}
                />

                <SelectField
                  label="Severity"
                  value={activeSeverity}
                  onChange={(value) => setActiveSeverity(value as SeverityFilter)}
                  options={[...severityFilters]}
                />
              </div>

              <p className="mt-4 text-sm text-slate-400">
                Showing {filteredIncidents.length} incident
                {filteredIncidents.length === 1 ? "" : "s"}
                {activeStatus !== "All" || hasActiveSecondaryFilters
                  ? ` for ${describeActiveView(
                      activeStatus,
                      activePriority,
                      activeSeverity,
                      searchQuery,
                    )}`
                  : "."}
              </p>
            </div>

            <div className="grid gap-4">
              {isLoading ? (
                <LoadingIncidentState />
              ) : filteredIncidents.length === 0 ? (
                <EmptyIncidentState
                  activeStatus={activeStatus}
                  activePriority={activePriority}
                  activeSeverity={activeSeverity}
                  searchQuery={searchQuery}
                />
              ) : (
                filteredIncidents.map((incident) => (
                  <article
                    key={incident._id}
                    className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-5 shadow-lg shadow-black/10"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${statusTone[incident.status]}`}
                          >
                            {incident.status}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${priorityTone[incident.priority]}`}
                          >
                            Priority {incident.priority}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${severityTone[incident.severity]}`}
                          >
                            {incident.severity}
                          </span>
                        </div>
                        <h3 className="text-2xl font-semibold text-white">
                          {incident.title}
                        </h3>
                      </div>

                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                        {formatTimestamp(incident.createdAt)}
                      </p>
                    </div>

                    <div className="mt-4 max-w-xs">
                      <SelectField
                        label="Update status"
                        value={incident.status}
                        onChange={(value) =>
                          void handleStatusChange(
                            incident._id,
                            value as IncidentStatus,
                          )
                        }
                        options={["Open", "Investigating", "Monitoring", "Resolved"]}
                        disabled={updatingIncidentId === incident._id}
                      />
                    </div>

                    <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
                      {incident.description}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300">
                      <MetaPill label="Service" value={incident.service || "Unassigned"} />
                      <MetaPill label="Assignee" value={incident.assignee || "Unassigned"} />
                      <MetaPill label="Reporter" value={incident.createdBy || "System"} />
                    </div>

                    <ActivityTimeline incident={incident} />
                  </article>
                ))
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function ToastViewport({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${
            toast.tone === "success"
              ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50"
              : "border-red-400/30 bg-red-500/15 text-red-50"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-red-300/40 focus:bg-white/8"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      <textarea
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={5}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-red-300/40 focus:bg-white/8"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-red-300/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
      {label}: {value}
    </span>
  );
}

function LoadingIncidentState() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5"
        >
          <div className="animate-pulse space-y-4">
            <div className="flex gap-2">
              <div className="h-7 w-24 rounded-full bg-white/10" />
              <div className="h-7 w-28 rounded-full bg-white/10" />
              <div className="h-7 w-24 rounded-full bg-white/10" />
            </div>
            <div className="h-8 w-2/3 rounded-full bg-white/10" />
            <div className="h-20 rounded-3xl bg-white/10" />
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="h-10 rounded-full bg-white/10" />
              <div className="h-10 rounded-full bg-white/10" />
              <div className="h-10 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function EmptyIncidentState({
  activeStatus,
  activePriority,
  activeSeverity,
  searchQuery,
}: {
  activeStatus: StatusFilter;
  activePriority: PriorityFilter;
  activeSeverity: SeverityFilter;
  searchQuery: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-10 text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-red-200/70">
        Quiet Queue
      </p>
      <h3 className="mt-3 text-2xl font-semibold text-white">
        {activeStatus === "All" &&
        activePriority === "All" &&
        activeSeverity === "All" &&
        searchQuery.trim().length === 0
          ? "No incidents yet."
          : `No incidents match ${describeActiveView(
              activeStatus,
              activePriority,
              activeSeverity,
              searchQuery,
            )}.`}
      </h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-300">
        New alerts will land here as soon as the team broadcasts them. You can also
        create one from the panel on the left to seed the timeline.
      </p>
    </div>
  );
}

function ActivityTimeline({ incident }: { incident: IncidentRecord }) {
  const timelineItems = buildTimeline(incident);

  return (
    <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
        Activity Timeline
      </p>
      <div className="mt-4 space-y-4">
        {timelineItems.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-red-300" />
              {index < timelineItems.length - 1 ? (
                <span className="mt-2 h-full w-px bg-white/10" />
              ) : null}
            </div>
            <div className="min-w-0 pb-1">
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="text-sm text-slate-300">{item.detail}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                {item.timestamp}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildTimeline(incident: IncidentRecord) {
  const createdAt = formatTimestamp(incident.createdAt);
  const updatedAt = formatTimestamp(incident.updatedAt);
  const reporter = incident.createdBy || "System";
  const service = incident.service || "Unassigned service";
  const assignee = incident.assignee || "Unassigned";

  return [
    {
      label: "Incident reported",
      detail: `${reporter} opened ${incident.title}.`,
      timestamp: createdAt,
    },
    {
      label: "Service impact tagged",
      detail: `Linked to ${service}.`,
      timestamp: createdAt,
    },
    {
      label: "Response owner",
      detail: `Assigned to ${assignee}.`,
      timestamp: updatedAt,
    },
    {
      label: "Current status",
      detail: `Marked ${incident.status} with ${incident.priority} priority and ${incident.severity} severity.`,
      timestamp: updatedAt,
    },
  ];
}

function describeActiveView(
  status: StatusFilter,
  priority: PriorityFilter,
  severity: SeverityFilter,
  searchQuery: string,
) {
  const filters = [status, priority, severity].filter(
    (value) => value !== "All",
  );
  const normalizedSearch = searchQuery.trim();

  if (normalizedSearch.length > 0) {
    filters.push(`search "${normalizedSearch}"`);
  }

  return filters.length > 0 ? filters.join(" + ") : "all incidents";
}

function formatTimestamp(value?: string) {
  if (!value) {
    return "Just now";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

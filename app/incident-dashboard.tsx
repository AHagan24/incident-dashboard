"use client";

import { startTransition, useEffect, useEffectEvent, useState, type FormEvent } from "react";
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

type FormState = {
  title: string;
  description: string;
  priority: IncidentPriority;
  severity: IncidentSeverity;
  status: IncidentStatus;
  service: string;
  assignee: string;
};

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
  P1: "text-red-200",
  P2: "text-orange-200",
  P3: "text-yellow-100",
  P4: "text-zinc-200",
};

export default function IncidentDashboard() {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<IncidentStatus | "All">("All");

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

  const filteredIncidents =
    activeStatus === "All"
      ? incidents
      : incidents.filter((incident) => incident.status === activeStatus);

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

      startTransition(() => {
        setForm(defaultForm);
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to create incident";

      setError(message);
      posthog.capture("incident_create_failed", { message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(248,113,113,0.22),_transparent_28%),linear-gradient(180deg,#111827_0%,#0f172a_45%,#020617_100%)] text-white">
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
            <div className="flex flex-wrap gap-2">
              {(["All", "Open", "Investigating", "Monitoring", "Resolved"] as const).map(
                (status) => (
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
                ),
              )}
            </div>

            <div className="grid gap-4">
              {isLoading ? (
                <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 text-slate-300">
                  Loading incidents...
                </div>
              ) : filteredIncidents.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.03] p-10 text-center text-slate-300">
                  No incidents match this view yet.
                </div>
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
                            className={`text-sm font-semibold ${priorityTone[incident.priority]}`}
                          >
                            {incident.priority}
                          </span>
                          <span className="text-sm text-slate-400">
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

                    <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
                      {incident.description}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300">
                      <MetaPill label="Service" value={incident.service || "Unassigned"} />
                      <MetaPill label="Assignee" value={incident.assignee || "Unassigned"} />
                      <MetaPill label="Reporter" value={incident.createdBy || "System"} />
                    </div>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-red-300/40"
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

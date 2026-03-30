export type IncidentStatus =
  | "Open"
  | "Investigating"
  | "Monitoring"
  | "Resolved";

export type IncidentPriority = "P1" | "P2" | "P3" | "P4";

export type IncidentSeverity = "Critical" | "High" | "Medium" | "Low";

export interface IncidentRecord {
  _id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  severity: IncidentSeverity;
  archived?: boolean;
  service?: string;
  assignee?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

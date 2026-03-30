import mongoose, { Schema, model, models } from "mongoose";

export interface IIncident {
  title: string;
  description: string;
  status: "Open" | "Investigating" | "Monitoring" | "Resolved";
  priority: "P1" | "P2" | "P3" | "P4";
  severity: "Critical" | "High" | "Medium" | "Low";
  archived: boolean;
  service?: string;
  assignee?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const IncidentSchema = new Schema<IIncident>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Open", "Investigating", "Monitoring", "Resolved"],
      default: "Open",
    },
    priority: {
      type: String,
      enum: ["P1", "P2", "P3", "P4"],
      default: "P3",
    },
    severity: {
      type: String,
      enum: ["Critical", "High", "Medium", "Low"],
      default: "Medium",
    },
    archived: {
      type: Boolean,
      default: false,
    },
    service: {
      type: String,
      default: "",
      trim: true,
    },
    assignee: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: String,
      default: "Addison",
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

const existingIncidentModel = models.Incident as
  | mongoose.Model<IIncident>
  | undefined;

if (existingIncidentModel && !existingIncidentModel.schema.path("archived")) {
  existingIncidentModel.schema.add({
    archived: {
      type: Boolean,
      default: false,
    },
  });
}

const Incident =
  existingIncidentModel || model<IIncident>("Incident", IncidentSchema);

export default Incident;

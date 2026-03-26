import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Incident from "@/models/Incident";
import { Types } from "mongoose";
import type {
  IncidentPriority,
  IncidentSeverity,
  IncidentStatus,
} from "@/lib/types";

export const runtime = "nodejs";

const allowedStatus: IncidentStatus[] = [
  "Open",
  "Investigating",
  "Monitoring",
  "Resolved",
];

const allowedPriority: IncidentPriority[] = ["P1", "P2", "P3", "P4"];

const allowedSeverity: IncidentSeverity[] = ["Critical", "High", "Medium", "Low"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id || !Types.ObjectId.isValid(id)) { 
      return NextResponse.json(
        { message: "Invalid incident id" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const body = await req.json();
    const incident = await Incident.findById(id);

    if (!incident) {
      return NextResponse.json(
        { message: "Incident not found" },
        { status: 404 },
      );
    }

    if (body.status !== undefined && !allowedStatus.includes(body.status)) {
      return NextResponse.json(
        { message: "Invalid status value" },
        { status: 400 },
      );
    }

    if (body.priority !== undefined && !allowedPriority.includes(body.priority)) {
      return NextResponse.json(
        { message: "Invalid priority value" },
        { status: 400 },
      );
    }

    if (body.severity !== undefined && !allowedSeverity.includes(body.severity)) {
      return NextResponse.json(
        { message: "Invalid severity value" },
        { status: 400 },
      );
    }

    if (body.title !== undefined) incident.title = body.title;
    if (body.description !== undefined) incident.description = body.description;
    if (body.status !== undefined) incident.status = body.status;
    if (body.priority !== undefined) incident.priority = body.priority;
    if (body.severity !== undefined) incident.severity = body.severity;
    if (body.service !== undefined) incident.service = body.service;
    if (body.assignee !== undefined) incident.assignee = body.assignee;

    await incident.save();

    return NextResponse.json(
      {
        message: "Incident updated successfully",
        incident,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("PATCH /api/incidents/[id] error:", error);

    return NextResponse.json(
      { message: "Failed to patch incident" },
      { status: 500 },
    );
  }
}

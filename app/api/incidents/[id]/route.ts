import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Incident from "@/models/Incident";
import { Types } from "mongoose";
import type {
  IncidentPriority,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
} from "@/lib/types";
import type { Server as SocketIOServer } from "socket.io";

export const runtime = "nodejs";

declare global {
  var io: SocketIOServer | undefined;
}

const allowedStatus: IncidentStatus[] = [
  "Open",
  "Investigating",
  "Monitoring",
  "Resolved",
];

const allowedPriority: IncidentPriority[] = ["P1", "P2", "P3", "P4"];

const allowedSeverity: IncidentSeverity[] = [
  "Critical",
  "High",
  "Medium",
  "Low",
];

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

    if (
      body.priority !== undefined &&
      !allowedPriority.includes(body.priority)
    ) {
      return NextResponse.json(
        { message: "Invalid priority value" },
        { status: 400 },
      );
    }

    if (
      body.severity !== undefined &&
      !allowedSeverity.includes(body.severity)
    ) {
      return NextResponse.json(
        { message: "Invalid severity value" },
        { status: 400 },
      );
    }

    if (
      body.archived !== undefined &&
      typeof body.archived !== "boolean"
    ) {
      return NextResponse.json(
        { message: "Invalid archived value" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.severity !== undefined) updates.severity = body.severity;
    if (body.archived !== undefined) updates.archived = body.archived;
    if (body.service !== undefined) updates.service = body.service;
    if (body.assignee !== undefined) updates.assignee = body.assignee;

    const updatedIncident = await Incident.findByIdAndUpdate(
      id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
        strict: false,
      },
    );

    if (!updatedIncident) {
      return NextResponse.json(
        { message: "Incident not found" },
        { status: 404 },
      );
    }

    const hydratedIncident = JSON.parse(
      JSON.stringify(updatedIncident),
    ) as IncidentRecord;

    global.io?.emit("incident:updated", hydratedIncident);

    return NextResponse.json(
      {
        message: "Incident updated successfully",
        incident: hydratedIncident,
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

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Incident from "@/models/Incident";
import type { IncidentRecord } from "@/lib/types";
import type { Server as SocketIOServer } from "socket.io";

export const runtime = "nodejs";

declare global {
  var io: SocketIOServer | undefined;
}

export async function GET() {
  try {
    await connectToDatabase();

    const incidents = await Incident.find().sort({ createdAt: -1 }).lean();

    return NextResponse.json(
      { message: "Incidents fetched successfully", incidents },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/incidents error:", error);

    return NextResponse.json(
      { message: "Failed to fetch incidents" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { title, description, priority, severity, status, service, assignee } = body;

    if (!title || !description) {
      return NextResponse.json(
        { message: "Title and description are required" },
        { status: 400 },
      );
    }

    const incident = await Incident.create({
      title,
      description,
      status,
      priority,
      severity,
      service,
      assignee,
    });

    const hydratedIncident = JSON.parse(
      JSON.stringify(incident),
    ) as IncidentRecord;

    global.io?.emit("incident:created", hydratedIncident);

    return NextResponse.json(
      { message: "Incident created successfully", incident: hydratedIncident },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/incidents error:", error);

    return NextResponse.json(
      { message: "Failed to create incident" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { getPromptFilters, createPromptFilter } from "@/lib/localDb";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const all = await getPromptFilters();
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const filters = provider
      ? all.filter((f) => f.provider === provider)
      : all;
    return NextResponse.json({ filters });
  } catch (error) {
    console.log("Error fetching prompt filters:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt filters" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, provider, pattern, replacement, priority } = body;

    if (!provider) {
      return NextResponse.json(
        { error: "provider is required" },
        { status: 400 }
      );
    }
    if (!pattern || typeof pattern !== "string" || !pattern.trim()) {
      return NextResponse.json(
        { error: "pattern is required" },
        { status: 400 }
      );
    }
    if (replacement == null || typeof replacement !== "string") {
      return NextResponse.json(
        { error: "replacement is required" },
        { status: 400 }
      );
    }

    const filter = await createPromptFilter({
      name,
      provider,
      pattern,
      replacement,
      priority,
      isActive: body.isActive !== false,
    });

    return NextResponse.json(filter, { status: 201 });
  } catch (error) {
    console.log("Error creating prompt filter:", error);
    return NextResponse.json(
      { error: "Failed to create prompt filter" },
      { status: 500 }
    );
  }
}

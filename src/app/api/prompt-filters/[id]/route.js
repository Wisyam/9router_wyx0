import { NextResponse } from "next/server";
import {
  getPromptFilterById,
  updatePromptFilter,
  deletePromptFilter,
} from "@/lib/localDb";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const filter = await getPromptFilterById(id);
    if (!filter) {
      return NextResponse.json(
        { error: "Prompt filter not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(filter);
  } catch (error) {
    console.log("Error fetching prompt filter:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt filter" },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const filter = await updatePromptFilter(id, body);
    if (!filter) {
      return NextResponse.json(
        { error: "Prompt filter not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(filter);
  } catch (error) {
    console.log("Error updating prompt filter:", error);
    return NextResponse.json(
      { error: "Failed to update prompt filter" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const success = await deletePromptFilter(id);
    if (!success) {
      return NextResponse.json(
        { error: "Prompt filter not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting prompt filter:", error);
    return NextResponse.json(
      { error: "Failed to delete prompt filter" },
      { status: 500 }
    );
  }
}

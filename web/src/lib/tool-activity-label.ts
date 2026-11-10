import type { ToolActivity } from "./chat-shape";

type ActivityPhase = "running" | "completed";

const activityLabels: Record<string, Partial<Record<ActivityPhase, string>>> = {
  list_skills: { running: "Finding available skills", completed: "Skills discovered" },
  load_skill: { running: "Using a skill", completed: "Skill instructions loaded" },
  list_personas: { running: "Checking saved personas", completed: "Personas available" },
  get_persona: { running: "Reading a saved persona", completed: "Persona retrieved" },
  update_persona: { running: "Updating a saved persona", completed: "Persona updated" },
  delete_persona: { running: "Removing a saved persona", completed: "Persona removed" },
  list_files: { running: "Looking through workspace files", completed: "Workspace files listed" },
  read_file: { running: "Reading a workspace file", completed: "Workspace file read" },
};

export function toolActivityLabel(activity: ToolActivity, phase: ActivityPhase): string {
  if (phase === "running" && activity.tool_name === "load_skill") {
    const skill = activity.arguments.skill_name;
    return `Using ${typeof skill === "string" ? skill : "a skill"}`;
  }

  return activityLabels[activity.tool_name]?.[phase]
    ?? (phase === "completed"
      ? `Completed ${activity.tool_name.replaceAll("_", " ")}`
      : activity.tool_name.replaceAll("_", " "));
}

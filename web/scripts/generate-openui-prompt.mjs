import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateSystemPrompt } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const destination = resolve(
  projectRoot,
  "src/myagent/prompt/openui_system_prompt.txt",
);

const applicationInstructions = `You are myagent. Answer in plain text or Markdown by default. Use an OpenUI interface when the user asks for one or when it clearly makes the answer easier to use; do not force an interface for ordinary questions.

When generating an interface, put the complete OpenUI program inside a fenced \`openui-lang\` block. Begin the block with \`root = Stack(...)\`. Use only components and actions from the catalog below. You may put a short explanation outside the block when it helps.

## myagent component and data rules
- The web renderer exposes the complete OpenUI GenUI component catalog, including layouts, cards, tables, charts, forms, image blocks, galleries, and selectable controls. Combine components to create complete interfaces.
- myagent's Table accepts both \`Table(columns, rows)\` with row-oriented values and \`Table(columns)\` with each Col holding its data array. Keep all columns the same length.
- myagent's Form accepts fields and buttons in either order; prefer \`Form(name, fields, buttons)\`. Use a primary button with \`@ToAssistant(...)\` to submit. Submitted field values are sent back to the assistant.
- Use real image URLs from the user or tool results. When the user requests real-world photos, search with \`categories="images"\` and use only returned \`img_src\` or \`thumbnail_src\` values. Never invent or guess image URLs.
- For factual charts, use values from the conversation or tool results. Do not invent measurements; label mock values as illustrative.
- Use BarChart for category comparisons, LineChart or AreaChart for trends, and PieChart for part-to-whole data. Choose the graph type that fits the data.
- Do not create custom action names or claim an app action will execute unless it is supported by the catalog. Use \`@ToAssistant\` for conversational actions and \`@OpenUrl\` only with a real URL from the user or tools.`;

const catalog = generateSystemPrompt({
  library: openuiLibrary.toSpec(),
  promptOptions: {
    additionalRules: [
      "Use references for nested components so the interface can reveal progressively as it streams.",
      "Every defined reference must be reachable from root.",
      "Use components that fit together as a coherent interface; prefer Card, Stack, and Tabs for structure, then add appropriate content and interactions.",
      "For myagent compatibility, Form accepts either Form(name, fields, buttons) or Form(name, buttons, fields); prefer the fields-first form.",
      "For myagent compatibility, Table accepts Table(columns, rows) or Table(columns) with data arrays on Col references. Col arguments are label, data, then optional type.",
      "Keep generated interfaces easy to scan: use a clear heading, short labels, and concise descriptions. Avoid repeating explanations already shown in a table, chart, or metric.",
      "For dashboards, show at most four KPI cards and two charts in the first view. Keep tables to five key rows unless the user asks for more, and group secondary details in Tabs or Accordion sections.",
      "Leave visible space between sections and group related content in Cards; do not put every metric, table, and chart into one dense block.",
      "For dashboards, group KPIs in one OverviewCardBlock and put charts and tables in separate sections. State once when data is illustrative; do not repeat that note under each metric or chart.",
      "Keep callouts to one short sentence unless the user needs a detailed explanation. Prefer short headings and labels over paragraphs inside dashboards.",
    ],
  },
});

const syntaxStart = catalog.indexOf("## Syntax Rules");
if (syntaxStart < 0) throw new Error("OpenUI prompt catalog did not include syntax rules.");

const prompt = `${applicationInstructions}\n\n${catalog.slice(syntaxStart)}`;
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, prompt, "utf8");
console.log(`Generated OpenUI harness prompt at ${destination}`);

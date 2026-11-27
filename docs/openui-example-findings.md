# OpenUI example findings for myagent

Reviewed against the official OpenUI repository `main` on 2026-11-10. The examples are reference implementations; they do not imply that myagent needs to replace its current Python agent harness.

## Primary sources

- [OpenUI shadcn example README](https://github.com/thesysdev/openui/blob/main/examples/design-systems/shadcn/README.md)
- [Shadcn component library](https://github.com/thesysdev/openui/blob/main/examples/design-systems/shadcn/src/lib/shadcn-genui/index.tsx)
- [Shadcn library CLI entrypoint](https://github.com/thesysdev/openui/blob/main/examples/design-systems/shadcn/src/library.ts)
- [Shadcn chat route](https://github.com/thesysdev/openui/blob/main/examples/design-systems/shadcn/src/app/api/chat/route.ts)
- [Shadcn action definitions](https://github.com/thesysdev/openui/blob/main/examples/design-systems/shadcn/src/lib/shadcn-genui/action.ts)
- [Vercel AI SDK example README](https://github.com/thesysdev/openui/blob/main/examples/agent-frameworks/vercel-ai-sdk/README.md)
- [Vercel AI SDK chat route](https://github.com/thesysdev/openui/blob/main/examples/agent-frameworks/vercel-ai-sdk/src/app/api/chat/route.ts)
- [Vercel AI SDK client page](https://github.com/thesysdev/openui/blob/main/examples/agent-frameworks/vercel-ai-sdk/src/app/page.tsx)
- [OpenUI Vercel AI SDK guide](https://github.com/thesysdev/openui/blob/main/docs/content/docs/build-agents/frameworks/vercel-ai-sdk.mdx)
- [OpenUI shadcn design-system guide](https://github.com/thesysdev/openui/blob/main/docs/content/docs/openui-lang/examples/design-systems/shadcn.mdx)
- [OpenUI React Headless README: streaming adapters and message formats](https://github.com/thesysdev/openui/blob/main/packages/react-headless/README.md)

## Verified patterns in the examples

### Component schemas and design-system mapping

The shadcn example defines each OpenUI Lang node with `defineComponent({ name, props, description, component })`. Props are Zod schemas; descriptions feed the generated model instructions; render functions map validated nodes to shadcn primitives and use `renderNode` for nested children. The library is assembled once with `createLibrary({ root, componentGroups, components })`. Its `src/library.ts` re-exports that library and prompt options for OpenUI CLI spec generation. The generated spec is therefore derived from the component library; it should not be hand-maintained separately.

This creates a useful single-source contract: component names, typed props, model-facing descriptions, root node, and renderer are defined together. Component groups can carry extra generation rules for forms/layout. The example's action schemas are separate from component rendering and describe supported button actions.

### Streaming, tools, and rendering

The Vercel example's server route accepts UI messages, converts them with `convertToModelMessages`, calls AI SDK `streamText`, supplies system instructions and `tool()` definitions, caps the tool loop using `stepCountIs(5)`, then returns `toUIMessageStreamResponse()`. The client configures `fetchLLM` with both `vercelAIAdapter()` and `vercelAIMessageFormat`, and passes the same OpenUI library to `AgentInterface`. Tools are server-side; the model can invoke them during generation. The example uses generated OpenUI Cloud instructions and a Cloud model endpoint—this backend choice is example-specific, not a requirement of the adapter pattern.

The shadcn example uses a different wire protocol: it streams Chat Completions SSE and consumes it with `openAIAdapter()` plus `openAIMessageFormat`. Its app-owned tool loop runs on the server before continuing the model response. Both examples preserve separation between stream decoding and OpenUI Lang rendering: the adapter translates the response stream into chat events, while the component library parses/renders the generated UI language.

The current React Headless docs list `vercelAIAdapter()` as supporting AI SDK v6/v7 UIMessage streams and pair it with `vercelAIMessageFormat`. They also explicitly note that provider-executed tools (`providerExecuted: true`) are unsupported by this adapter because the internal AG-UI message model cannot represent their assistant-contained result semantics. This limit matters when considering provider-hosted search tools.

### Actions and state

In the shadcn example, action schemas are explicit and the route executes app-owned tools server-side. The Vercel example similarly defines tools with AI SDK `tool()` and `inputSchema`, then passes the registry into `streamText`. The OpenUI prompt options in its generated library entrypoint reinforce that form submission should use `@ToAssistant(...)` when user-entered values must go back to the agent; local-only state actions are for local UI behavior. Treat action names and arguments as a frontend/backend contract and validate them at the server boundary.

## Application-specific guidance (inference)

1. Keep myagent's existing Python harness and SSE response architecture. Borrow the architectural seams, not the Next.js/AI SDK server implementation: one canonical OpenUI library/spec contract; a dedicated stream decoder; and a renderer that maps parsed nodes to the app's shadcn components.
2. Keep the frontend's current SSE/message envelope contract unless deliberately migrating it. The OpenUI renderer needs the OpenUI Lang content to arrive as the expected assistant text stream; a stream adapter must preserve incremental text and finish/error/cancel semantics. Verify this against the installed `@openuidev/react-lang`/headless versions before adopting an adapter API.
3. Keep tool execution on the server. Render tool activity/results as persisted message parts/events so history reconstruction and session switching can restore badges and citations. Do not rely on ephemeral component state for tool status or provenance.
4. Treat generated UI actions (form/button submissions) as typed, allowlisted commands. Validate action name and payload, and route `@ToAssistant` submissions into the existing conversation endpoint. Never let model-authored markup directly invoke arbitrary client functions.
5. Avoid duplicating component descriptions between the OpenUI prompt file, frontend renderer, and settings. Where the Python harness cannot import TypeScript/Zod schemas, define a generated or checked contract and document which side owns each part; do not claim the official examples solve cross-language schema sharing.
6. Citations and images are product-specific additions, not evidenced as fully solved by these two examples. Represent source citations and image URLs as explicit typed fields/parts with provenance and safe rendering; do not infer them from arbitrary generated text or accept arbitrary executable image markup.

## Compatibility cautions

- The Vercel AI SDK example currently targets its own JavaScript/Next setup and uses `toUIMessageStreamResponse`; that protocol is not automatically interchangeable with myagent's existing Python SSE format.
- The docs and source support app-executed tools. Do not assume tool invocation metadata will be preserved for every provider or transport; the React Headless README documents a known limitation for provider-executed tools.
- OpenUI Lang schema/API details are version-sensitive. Check installed package versions and the matching package docs before copying signatures from the example's current `main` branch.

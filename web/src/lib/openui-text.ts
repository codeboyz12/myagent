const OPENUI_BLOCK = /(```openui(?:-lang)?\b[^\n]*\n)([\s\S]*?)(```|$)/gi;
const OPENUI_FENCE = /```openui(?:-lang)?\b/i;
const ROOT_ASSIGNMENT = /^\s*root\s*=\s*Stack\s*\(/m;
const STRING_LITERAL = /"(?:\\.|[^"\\])*"/g;
const POSITIONAL_ARGUMENTS: Record<string, string[]> = {
  Card: ["children", "variant", "direction", "gap", "align", "justify", "wrap"],
  Stack: ["children", "direction", "gap", "align", "justify", "wrap"],
};
const DEFAULT_ARGUMENTS: Record<string, Array<string | undefined>> = {
  Card: [undefined, '"card"', '"column"', '"m"', '"stretch"', '"start"', "false"],
  Stack: [undefined, '"column"', '"m"', '"stretch"', '"start"', "false"],
};

export function normalizeEscapedNewlines(text: string): string {
  return text.replace(/\\n/g, "\n");
}

export function normalizeOpenUIEscapedNewlines(response: string): string {
  return response.replace(OPENUI_BLOCK, (_match, opening: string, program: string, closing: string) => {
    const normalizedProgram = program.replace(STRING_LITERAL, (literal) =>
      literal.replace(/\\{2,}n/g, "\\n"),
    );
    return `${opening}${normalizeNamedArguments(normalizedProgram)}${closing}`;
  });
}

export function normalizeOpenUIResponse(response: string): string {
  if (OPENUI_FENCE.test(response)) return response;

  const codeFence = /```([^\n`]*)\n([\s\S]*?)```/g;
  for (const match of response.matchAll(codeFence)) {
    if (!ROOT_ASSIGNMENT.test(match[2])) continue;
    const start = match.index ?? 0;
    const opening = match[0].slice(0, match[0].indexOf("\n"));
    return response.slice(0, start)
      + match[0].replace(opening, "```openui-lang")
      + response.slice(start + match[0].length);
  }

  if (ROOT_ASSIGNMENT.test(response.trimStart())) {
    return `\`\`\`openui-lang\n${response.trim()}\n\`\`\``;
  }
  return response;
}

function findCallEnd(source: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "(") depth += 1;
    else if (char === ")" && --depth === 0) return index;
  }
  return -1;
}

function splitArguments(source: string): string[] {
  const args: string[] = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "(") round += 1;
    else if (char === ")") round -= 1;
    else if (char === "[") square += 1;
    else if (char === "]") square -= 1;
    else if (char === "{") curly += 1;
    else if (char === "}") curly -= 1;
    else if (char === "," && round === 0 && square === 0 && curly === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  if (source.slice(start).trim()) args.push(source.slice(start).trim());
  return args;
}

function normalizeCallArguments(name: string, source: string): string {
  const parameterNames = POSITIONAL_ARGUMENTS[name];
  if (!parameterNames) return source;

  const args = splitArguments(source);
  if (!args.some((arg) => /^[A-Za-z_]\w*\s*=/.test(arg))) return source;

  const values = [...(DEFAULT_ARGUMENTS[name] ?? [])];
  let nextPosition = 0;
  for (const arg of args) {
    const named = arg.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
    if (named) {
      const position = parameterNames.indexOf(named[1]);
      if (position === -1) return source;
      values[position] = named[2].trim();
      nextPosition = Math.max(nextPosition, position + 1);
    } else {
      while (nextPosition < values.length && values[nextPosition] !== undefined) {
        nextPosition += 1;
      }
      values[nextPosition] = arg;
      nextPosition += 1;
    }
  }

  return values
    .slice(0, nextPosition)
    .map((value) => value ?? "null")
    .join(", ");
}

function normalizeNamedArguments(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      const end = findStringEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const nameStart = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      const name = source.slice(nameStart, index);
      let openIndex = index;
      while (/\s/.test(source[openIndex] ?? "") && openIndex < source.length) openIndex += 1;
      if (source[openIndex] !== "(") {
        result += source.slice(nameStart, index);
        continue;
      }

      const closeIndex = findCallEnd(source, openIndex);
      if (closeIndex === -1) {
        result += source.slice(nameStart);
        break;
      }
      const inner = normalizeNamedArguments(source.slice(openIndex + 1, closeIndex));
      result += `${name}(${normalizeCallArguments(name, inner)})`;
      index = closeIndex + 1;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function findStringEnd(source: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') return index + 1;
  }
  return source.length;
}

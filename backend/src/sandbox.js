import ivm from 'isolated-vm';
import { parse } from 'acorn';

const MEMORY_LIMIT_MB = 128;
const MAX_CODE_LENGTH = 20_000;
const MAX_OUTPUT_LENGTH = 64_000;
const MAX_EVENT_COUNT = 1_000;
const MAX_EVENT_INPUT_LENGTH = 256_000;
const MAX_EVENT_FIELD_LENGTH = 2_000;
const SANDBOX_TIMEOUT_MS = 5_000;
const forbiddenTokens = [/\bimport\b/, /\brequire\b/, /\bprocess\b/, /\bchild_process\b/, /\bfetch\b/, /\bhttp\b/, /\bhttps\b/, /\bnet\b/, /\bfs\b/, /\beval\b/, /\bFunction\b/, /\bWebSocket\b/, /\bdynamicImport\b/];
const unicodeEscapePattern = /\\u(?:[0-9a-fA-F]{4}|\{[0-9a-fA-F]+\})/;
const eventFields = new Set([
  'id',
  'kind',
  'merchantId',
  'customerId',
  'customerName',
  'supplierName',
  'product',
  'quantity',
  'amountNaira',
  'occurredAt',
  'expectedAt',
  'direction',
  'category',
  'status',
  'source',
  'title'
]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function safeEventValue(value, field, index) {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= MAX_EVENT_FIELD_LENGTH) return value;
  throw new Error(`Structured event ${index} has an invalid ${field} value.`);
}

/**
 * Creates the only data shape that analysis code may receive. This removes raw
 * source text and nested UI metadata before the data crosses into the isolate.
 * Oversized inputs fail closed rather than being silently truncated.
 */
export function prepareAnalysisEvents(events) {
  if (!Array.isArray(events)) throw new Error('Structured analysis events must be an array.');
  if (events.length > MAX_EVENT_COUNT) throw new Error('Structured analysis events exceed the supported event count.');

  const prepared = events.map((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error(`Structured event ${index} must be an object.`);
    const safeEvent = {};
    for (const field of eventFields) {
      if (hasOwn(event, field)) safeEvent[field] = safeEventValue(event[field], field, index);
    }
    if (typeof safeEvent.id !== 'string' || !safeEvent.id || typeof safeEvent.kind !== 'string' || !safeEvent.kind) {
      throw new Error(`Structured event ${index} is missing its id or kind.`);
    }
    if (typeof safeEvent.occurredAt !== 'string' || Number.isNaN(Date.parse(safeEvent.occurredAt))) {
      throw new Error(`Structured event ${index} has an invalid occurredAt value.`);
    }
    if (safeEvent.expectedAt !== undefined && safeEvent.expectedAt !== null && Number.isNaN(Date.parse(safeEvent.expectedAt))) {
      throw new Error(`Structured event ${index} has an invalid expectedAt value.`);
    }
    return safeEvent;
  });

  if (JSON.stringify(prepared).length > MAX_EVENT_INPUT_LENGTH) {
    throw new Error('Structured analysis events exceed the supported input size.');
  }
  return prepared;
}

function patternBindsEvents(pattern) {
  if (!pattern) return false;
  if (pattern.type === 'Identifier') return pattern.name === 'events';
  if (pattern.type === 'RestElement') return patternBindsEvents(pattern.argument);
  if (pattern.type === 'AssignmentPattern') return patternBindsEvents(pattern.left);
  if (pattern.type === 'ArrayPattern') return pattern.elements.some((element) => patternBindsEvents(element));
  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.some((property) => property.type === 'RestElement'
      ? patternBindsEvents(property.argument)
      : patternBindsEvents(property.value));
  }
  return false;
}

function assignmentTargetIncludesEvents(target) {
  if (!target) return false;
  if (target.type === 'Identifier') return target.name === 'events';
  if (target.type === 'MemberExpression') return assignmentTargetIncludesEvents(target.object);
  if (target.type === 'ChainExpression') return assignmentTargetIncludesEvents(target.expression);
  if (target.type === 'RestElement') return assignmentTargetIncludesEvents(target.argument);
  if (target.type === 'AssignmentPattern') return assignmentTargetIncludesEvents(target.left);
  if (target.type === 'ArrayPattern') return target.elements.some((element) => assignmentTargetIncludesEvents(element));
  if (target.type === 'ObjectPattern') {
    return target.properties.some((property) => property.type === 'RestElement'
      ? assignmentTargetIncludesEvents(property.argument)
      : assignmentTargetIncludesEvents(property.value));
  }
  return false;
}

function declaresEvents(node) {
  if (node.type === 'VariableDeclarator') return patternBindsEvents(node.id);
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    return node.id?.name === 'events' || node.params.some((parameter) => patternBindsEvents(parameter));
  }
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return node.id?.name === 'events';
  if (node.type === 'CatchClause') return patternBindsEvents(node.param);
  if (node.type === 'ImportDeclaration') return node.specifiers.some((specifier) => specifier.local?.name === 'events');
  return false;
}

function isEventsReference(node, parent, key) {
  if (node.type !== 'Identifier' || node.name !== 'events') return false;
  if (!parent) return true;

  if (parent.type === 'VariableDeclarator' && key === 'id') return false;
  if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression')
    && (key === 'id' || key === 'params')) return false;
  if ((parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression') && key === 'id') return false;
  if (parent.type === 'CatchClause' && key === 'param') return false;
  if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportNamespaceSpecifier') return false;
  if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return false;
  if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition')
    && key === 'key' && !parent.computed && !parent.shorthand) return false;
  if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement' || parent.type === 'MetaProperty') return false;
  return true;
}

function visitAst(node, parent, key, visitor) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
  visitor(node, parent, key);
  for (const [childKey, child] of Object.entries(node)) {
    if (childKey === 'type' || childKey === 'start' || childKey === 'end' || childKey === 'loc') continue;
    if (Array.isArray(child)) {
      for (const item of child) visitAst(item, node, childKey, visitor);
    } else {
      visitAst(child, node, childKey, visitor);
    }
  }
}

/**
 * The generated program executes inside a Function with `events` as an injected
 * parameter. Parser-based binding checks are necessary here: regular expressions
 * cannot correctly distinguish parameter syntax, destructuring, methods, or
 * comments. Every local binding and write to that identifier is rejected, so an
 * actual identifier reference resolves to the immutable injected parameter.
 */
function validateEventBinding(code) {
  let ast;
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
  } catch {
    throw new Error('Generated analysis code failed the sandbox policy.');
  }

  let usesInjectedEvents = false;
  let invalidBinding = false;
  visitAst(ast, null, null, (node, parent, key) => {
    if (declaresEvents(node)
      || node.type === 'WithStatement'
      || (node.type === 'AssignmentExpression' && assignmentTargetIncludesEvents(node.left))
      || (node.type === 'UpdateExpression' && assignmentTargetIncludesEvents(node.argument))
      || (node.type === 'UnaryExpression' && node.operator === 'delete' && assignmentTargetIncludesEvents(node.argument))
      || ((node.type === 'ForInStatement' || node.type === 'ForOfStatement') && assignmentTargetIncludesEvents(node.left))) {
      invalidBinding = true;
    }
    if (isEventsReference(node, parent, key)) usesInjectedEvents = true;
  });

  if (invalidBinding) throw new Error('Generated analysis code must not replace the structured event input.');
  if (!usesInjectedEvents) throw new Error('Generated analysis code must use the structured event input.');
}

export function validateGeneratedCode(code) {
  if (typeof code !== 'string') throw new Error('Generated analysis code must be text.');
  if (forbiddenTokens.some((pattern) => pattern.test(code))) throw new Error('Generated analysis code failed the sandbox policy.');
  if (unicodeEscapePattern.test(code)) throw new Error('Generated analysis code failed the sandbox policy.');
  if (code.length > MAX_CODE_LENGTH) throw new Error('Generated analysis code exceeds the sandbox size limit.');
  validateEventBinding(code);
  if (!code.includes('console.log(JSON.stringify(')) throw new Error('Generated analysis code must emit one JSON result.');
  return true;
}

function isolateProgram(code) {
  const generatedProgram = JSON.stringify(`'use strict';\n${code}`);
  return `'use strict';
const __outputs = [];
const __console = Object.freeze({
  log(value) {
    if (__outputs.length > 0) throw new Error('Sandbox programs may emit only one result.');
    if (typeof value !== 'string') throw new Error('Sandbox output must be serialized JSON text.');
    if (value.length > ${MAX_OUTPUT_LENGTH}) throw new Error('Sandbox output exceeded the 64 KB limit.');
    __outputs.push(value);
  }
});
const __deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) __deepFreeze(value[key]);
  return Object.freeze(value);
};
const __events = __deepFreeze(globalThis.__ariaEvents);
delete globalThis.__ariaEvents;
const __runAnalysis = new Function('events', 'console', ${generatedProgram});
__runAnalysis(__events, __console);
if (__outputs.length !== 1) throw new Error('Sandbox returned no output.');
__outputs[0];`;
}

export async function executeInSandbox(code, events = []) {
  validateGeneratedCode(code);
  const preparedEvents = prepareAnalysisEvents(events);
  let eventCopy;
  let isolate;
  try {
    eventCopy = new ivm.ExternalCopy(preparedEvents);
    isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });
    const context = await isolate.createContext();
    await context.global.set('__ariaEvents', eventCopy.copyInto());
    const script = await isolate.compileScript(isolateProgram(code));
    const output = await script.run(context, { timeout: SANDBOX_TIMEOUT_MS, copy: true });
    if (typeof output !== 'string') throw new Error('Sandbox returned an invalid analysis result.');
    if (output.length > MAX_OUTPUT_LENGTH) throw new Error('Sandbox output exceeded the 64 KB limit.');
    try {
      return JSON.parse(output);
    } catch {
      throw new Error('Sandbox returned an invalid analysis result.');
    }
  } finally {
    eventCopy?.release();
    isolate?.dispose();
  }
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function source(path: string) {
  const text = await readFile(new URL(path, import.meta.url), 'utf8');
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}
const wizard = await source('../components/planner/mission-wizard.tsx');
const workbench = await source('../components/planner/mission-workbench.tsx');
function descendants(
  node: ts.Node,
  matches: (node: ts.Node) => boolean,
): ts.Node[] {
  const found: ts.Node[] = [];
  function visit(value: ts.Node) {
    if (matches(value)) found.push(value);
    ts.forEachChild(value, visit);
  }
  visit(node);
  return found;
}
function ancestor(
  node: ts.Node,
  matches: (node: ts.Node) => boolean,
): ts.Node | undefined {
  let current = node.parent;
  while (current) {
    if (matches(current)) return current;
    current = current.parent;
  }
}
const tag = (node: ts.Node) =>
  ts.isJsxElement(node)
    ? node.openingElement.tagName.getText()
    : ts.isJsxSelfClosingElement(node)
      ? node.tagName.getText()
      : null;
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
function attribute(node: ts.Node, name: string): ts.JsxAttribute | undefined {
  const attributes = ts.isJsxElement(node)
    ? node.openingElement.attributes
    : ts.isJsxSelfClosingElement(node)
      ? node.attributes
      : null;
  return attributes?.properties.find(
    (entry): entry is ts.JsxAttribute =>
      ts.isJsxAttribute(entry) && entry.name.getText() === name,
  );
}
function stringAttribute(node: ts.Node, name: string) {
  const value = attribute(node, name)?.initializer;
  return value && ts.isStringLiteral(value) ? value.text : null;
}
function expressionAttribute(node: ts.Node, name: string) {
  const value = attribute(node, name)?.initializer;
  return value && ts.isJsxExpression(value) ? value.expression : undefined;
}

void test('the two verbose explanations exist only as tooltip content attached to their section headings', () => {
  for (const [quote, label] of [
    [
      'Рассчитаем оба критерия на одном входе.',
      'Как сравниваются приоритеты миссии',
    ],
    [
      'Модельная симуляция. Паспортные максимумы',
      'Перед подтверждением миссии',
    ],
  ]) {
    const occurrences = descendants(
      wizard,
      (node) => ts.isJsxText(node) && normalize(node.text).includes(quote),
    );
    assert.equal(
      occurrences.length,
      1,
      `Expected one rendered text source: ${quote}`,
    );
    const hint = ancestor(occurrences[0], (node) => tag(node) === 'InfoHint');
    assert.ok(hint, `Explanation escaped its tooltip: ${quote}`);
    assert.equal(stringAttribute(hint, 'label'), label);
    assert.equal(
      tag(hint.parent),
      'summary',
      'Help belongs to the real section heading, not a separate note row.',
    );
    assert.equal(
      ancestor(hint, (node) => tag(node) === 'p'),
      undefined,
      'No paragraph may wrap the explanatory tooltip.',
    );
  }
});

void test('wizard help is grouped into actual headings rather than standalone body or caption rows', () => {
  const hints = descendants(wizard, (node) => tag(node) === 'InfoHint');
  assert.ok(hints.length >= 2);
  for (const hint of hints) {
    assert.ok(
      ['summary', 'h3', 'strong'].includes(tag(hint.parent) ?? ''),
      `Detached help: ${stringAttribute(hint, 'label')}`,
    );
    const headingText = descendants(
      hint.parent,
      (node) =>
        ts.isJsxText(node) && !ancestor(node, (parent) => parent === hint),
    ).some((node) => ts.isJsxText(node) && normalize(node.text).length > 0);
    assert.ok(
      headingText,
      `Help needs a visible heading, not an icon-only stripe: ${stringAttribute(hint, 'label')}`,
    );
  }
});

void test('unknown terrain and unsupported aircraft remain visible conditional safety states, not tooltip-only explanations', () => {
  const terrain = descendants(
    wizard,
    (node) =>
      ts.isStringLiteral(node) &&
      node.text.includes(
        'Рельеф неизвестен — безопасность по высотам не подтверждена',
      ),
  );
  assert.equal(terrain.length, 1);
  assert.ok(ancestor(terrain[0], ts.isConditionalExpression));
  assert.equal(
    ancestor(terrain[0], (node) => tag(node) === 'InfoHint'),
    undefined,
  );
  const status = ancestor(terrain[0], (node) => tag(node) === 'p');
  assert.ok(status);
  assert.ok(
    expressionAttribute(status, 'className'),
    'Terrain status retains its conditional warning style.',
  );
  const unsupported = descendants(
    wizard,
    (node) =>
      tag(node) === 'small' &&
      stringAttribute(node, 'className') === 'mw-editor-unsupported',
  );
  assert.equal(unsupported.length, 1);
  assert.equal(
    ancestor(unsupported[0], (node) => tag(node) === 'InfoHint'),
    undefined,
  );
  const condition = ancestor(
    unsupported[0],
    (node) =>
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken,
  );
  assert.ok(condition && ts.isBinaryExpression(condition));
  assert.ok(
    ts.isPrefixUnaryExpression(condition.left) &&
      condition.left.operator === ts.SyntaxKind.ExclamationToken,
  );
  assert.equal(condition.left.operand.getText(), 'eligibility.supported');
});

void test('approval still requires a checked acknowledgement and displays non-passing checks outside help', () => {
  const dialogs = descendants(
    workbench,
    (node) =>
      tag(node) === 'Modal' &&
      stringAttribute(node, 'title') === 'Подтвердить модельный план',
  );
  assert.equal(dialogs.length, 1);
  const dialog = dialogs[0];
  const checkbox = descendants(
    dialog,
    (node) =>
      tag(node) === 'input' && stringAttribute(node, 'type') === 'checkbox',
  );
  assert.equal(checkbox.length, 1);
  assert.equal(
    expressionAttribute(checkbox[0], 'checked')?.getText(),
    'acknowledged',
  );
  assert.equal(
    ancestor(checkbox[0], (node) => tag(node) === 'InfoHint'),
    undefined,
  );
  const approvalButton = descendants(
    dialog,
    (node) =>
      tag(node) === 'button' &&
      descendants(
        node,
        (child) =>
          ts.isJsxText(child) &&
          normalize(child.text) === 'Подтвердить для симуляции',
      ).length > 0,
  );
  assert.equal(approvalButton.length, 1);
  const disabled = expressionAttribute(approvalButton[0], 'disabled');
  assert.ok(
    disabled &&
      ts.isPrefixUnaryExpression(disabled) &&
      disabled.operator === ts.SyntaxKind.ExclamationToken,
  );
  assert.equal(disabled.operand.getText(), 'acknowledged');
  const visibleChecks = descendants(
    dialog,
    (node) =>
      tag(node) === 'div' &&
      stringAttribute(node, 'className') === 'mw-check unknown',
  );
  assert.equal(visibleChecks.length, 1);
  assert.equal(
    ancestor(visibleChecks[0], (node) => tag(node) === 'InfoHint'),
    undefined,
  );
  assert.ok(
    descendants(
      visibleChecks[0],
      (node) =>
        ts.isPropertyAccessExpression(node) &&
        node.expression.getText() === 'c' &&
        node.name.text === 'detail',
    ).length > 0,
  );
});

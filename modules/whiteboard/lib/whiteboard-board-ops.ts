import {
  Mat,
  b64Vecs,
  createBindingId,
  createShapeId,
  getIndexAbove,
  getIndexBetween,
  getIndices,
  getIndicesBetween,
  PageRecordType,
  sortByIndex,
  type IndexKey,
  type TLBinding,
  type TLPage,
  type TLPageId,
  type TLParentId,
  type TLRecord,
  type TLShape,
  type TLShapeId,
  type TLStore
} from "tldraw";
import { ptBR } from "@/modules/messages/pt-BR";
import {
  WHITEBOARD_CONTAINER_SHAPE_TYPES,
  WHITEBOARD_SHAPE_TYPES,
  WHITEBOARD_TEXT_SHAPE_TYPES,
  getDefaultBindingProps,
  getDefaultShapeProps,
  plainTextToRichText,
  richTextToPlainText,
  type WhiteboardDiff
} from "@/modules/whiteboard/lib/whiteboard-tldraw";

const errors = ptBR.whiteboard.errors;

/** A board operation that cannot run; the message is shown to the MCP client. */
export class WhiteboardOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhiteboardOpError";
  }
}

export type Point = { x: number; y: number };
export type ArrowTerminalInput = Point | { shapeId: string; anchor?: Point };

export type ShapeCreateInput = {
  id?: string;
  type: string;
  x?: number;
  y?: number;
  rotation?: number;
  parentId?: string;
  text?: string;
  props?: Record<string, unknown>;
  start?: ArrowTerminalInput;
  end?: ArrowTerminalInput;
  points?: Point[];
};

export type ShapeUpdateInput = Omit<ShapeCreateInput, "type"> & { id: string };

export type ReorderAction = "bring_to_front" | "bring_forward" | "send_backward" | "send_to_back";

export type OpResult<T> = { diff: WhiteboardDiff; result: T };

export type PageView = { id: string; name: string; index: string; shapeCount: number };
export type ShapeView = {
  id: string;
  type: string;
  parentId: string;
  x: number;
  y: number;
  rotation: number;
  w?: number;
  h?: number;
  text?: string;
  props: Record<string, unknown>;
};
export type BindingView = { arrowId: string; terminal: string; shapeId: string };

// ---------------------------------------------------------------------------
// ids and reads

export function normalizeShapeId(id: string): TLShapeId {
  return (id.startsWith("shape:") ? id : createShapeId(id)) as TLShapeId;
}

export function normalizePageId(id: string): TLPageId {
  return (id.startsWith("page:") ? id : PageRecordType.createId(id)) as TLPageId;
}

function allOfType<T extends TLRecord>(store: TLStore, typeName: T["typeName"]): T[] {
  return store.allRecords().filter((record) => record.typeName === typeName) as T[];
}

export function getPages(store: TLStore): TLPage[] {
  return allOfType<TLPage>(store, "page").sort(sortByIndex);
}

function requirePage(store: TLStore, pageId: string): TLPage {
  const page = store.get(normalizePageId(pageId));
  if (!page || page.typeName !== "page") {
    throw new WhiteboardOpError(errors.pageNotFound(pageId));
  }
  return page;
}

/** The page to act on: the given one, or the first page in order. */
export function resolvePage(store: TLStore, pageId: string | undefined): TLPage {
  if (pageId) {
    return requirePage(store, pageId);
  }
  const [first] = getPages(store);
  if (!first) {
    throw new WhiteboardOpError(errors.pageNotFound("-"));
  }
  return first;
}

function requireShape(store: TLStore, id: string): TLShape {
  const shape = store.get(normalizeShapeId(id));
  if (!shape || shape.typeName !== "shape") {
    throw new WhiteboardOpError(errors.shapeNotFound(id));
  }
  return shape;
}

function allShapes(store: TLStore): TLShape[] {
  return allOfType<TLShape>(store, "shape");
}

function allBindings(store: TLStore): TLBinding[] {
  return allOfType<TLBinding>(store, "binding");
}

function childrenOf(shapes: TLShape[], parentId: TLParentId): TLShape[] {
  return shapes.filter((shape) => shape.parentId === parentId).sort(sortByIndex);
}

/** Shapes under a parent in painter's order (parent before its children). */
function descendantsInZOrder(shapes: TLShape[], parentId: TLParentId): TLShape[] {
  const out: TLShape[] = [];
  for (const child of childrenOf(shapes, parentId)) {
    out.push(child, ...descendantsInZOrder(shapes, child.id));
  }
  return out;
}

function shapesOnPage(store: TLStore, pageId: TLPageId): TLShape[] {
  return descendantsInZOrder(allShapes(store), pageId);
}

function isPageId(id: string): id is TLPageId {
  return id.startsWith("page:");
}

// ---------------------------------------------------------------------------
// geometry

function localMatrix(shape: { x: number; y: number; rotation: number }): Mat {
  return Mat.Compose(Mat.Translate(shape.x, shape.y), Mat.Rotate(shape.rotation));
}

/** Page transform of a parent (identity for a page). */
function parentPageTransform(lookup: (id: string) => TLRecord | undefined, parentId: TLParentId): Mat {
  if (isPageId(parentId)) {
    return Mat.Identity();
  }
  const parent = lookup(parentId) as TLShape | undefined;
  if (!parent) {
    return Mat.Identity();
  }
  return Mat.Compose(parentPageTransform(lookup, parent.parentId), localMatrix(parent));
}

function decompose(matrix: Mat): { x: number; y: number; rotation: number } {
  const { x, y, rotation } = Mat.Decompose(matrix);
  return { x: round(x), y: round(y), rotation: round(rotation) };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Approximate size of a shape in its own space (what tldraw stored, not a measurement). */
function localBox(shape: TLShape, shapes: TLShape[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const props = shape.props as Record<string, unknown>;
  if (shape.type === "group") {
    return unionBox(childrenOf(shapes, shape.id), shapes);
  }
  if (shape.type === "arrow") {
    const start = props.start as Point;
    const end = props.end as Point;
    return boxOfPoints([start, end]);
  }
  if (shape.type === "line") {
    return boxOfPoints(Object.values(props.points as Record<string, Point>));
  }
  if (shape.type === "draw") {
    const segments = props.segments as { path: string; dim?: 2 | 3 }[];
    const points = segments.flatMap((segment) => b64Vecs.decodePoints(segment.path, segment.dim ?? 3));
    return points.length > 0 ? boxOfPoints(points) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  const size = shapeSize(shape);
  return { minX: 0, minY: 0, maxX: size.w ?? 0, maxY: size.h ?? 0 };
}

function shapeSize(shape: TLShape): { w?: number; h?: number } {
  const props = shape.props as Record<string, unknown>;
  const growY = typeof props.growY === "number" ? props.growY : 0;
  if (shape.type === "note") {
    return { w: 200, h: 200 + growY };
  }
  const w = typeof props.w === "number" ? props.w : undefined;
  const h = typeof props.h === "number" ? props.h + growY : undefined;
  return { w, h };
}

function boxOfPoints(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Union of shapes' boxes in their parent's space. */
function unionBox(group: TLShape[], shapes: TLShape[]) {
  const corners: Point[] = [];
  for (const shape of group) {
    const box = localBox(shape, shapes);
    const matrix = localMatrix(shape);
    corners.push(
      ...matrix.applyToPoints([
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.minY },
        { x: box.minX, y: box.maxY },
        { x: box.maxX, y: box.maxY }
      ])
    );
  }
  return corners.length > 0 ? boxOfPoints(corners) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

// ---------------------------------------------------------------------------
// views

export function shapeView(shape: TLShape): ShapeView {
  const { richText, ...props } = shape.props as Record<string, unknown>;
  const size = shapeSize(shape);
  return {
    id: shape.id,
    type: shape.type,
    parentId: shape.parentId,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    ...(size.w !== undefined ? { w: size.w } : {}),
    ...(size.h !== undefined ? { h: size.h } : {}),
    ...(richText !== undefined ? { text: richTextToPlainText(richText) } : {}),
    props
  };
}

export function listPages(store: TLStore): PageView[] {
  return getPages(store).map((page) => ({
    id: page.id,
    name: page.name,
    index: page.index,
    shapeCount: shapesOnPage(store, page.id).length
  }));
}

export function listShapes(store: TLStore, pageId: string | undefined) {
  const page = resolvePage(store, pageId);
  const shapes = shapesOnPage(store, page.id);
  const ids = new Set<string>(shapes.map((shape) => shape.id));
  const bindings: BindingView[] = allBindings(store)
    .filter((binding) => ids.has(binding.fromId))
    .map((binding) => ({
      arrowId: binding.fromId,
      terminal: String((binding.props as { terminal?: string }).terminal ?? ""),
      shapeId: binding.toId
    }));
  return { pageId: page.id, shapes: shapes.map(shapeView), bindings };
}

export function getShape(store: TLStore, id: string) {
  const shape = requireShape(store, id);
  return { ...shapeView(shape), childIds: childrenOf(allShapes(store), shape.id).map((child) => child.id) };
}

// ---------------------------------------------------------------------------
// pages

export function createPage(store: TLStore, name: string): OpResult<{ id: string }> {
  const pages = getPages(store);
  const page = PageRecordType.create({
    id: PageRecordType.createId(),
    name,
    index: getIndexAbove(pages.at(-1)?.index ?? null)
  });
  return { diff: { put: [page], remove: [] }, result: { id: page.id } };
}

export function renamePage(store: TLStore, pageId: string, name: string): OpResult<{ id: string }> {
  const page = requirePage(store, pageId);
  return { diff: { put: [{ ...page, name }], remove: [] }, result: { id: page.id } };
}

function pageContentIds(store: TLStore, pageId: TLPageId): { shapes: TLShape[]; bindings: TLBinding[] } {
  const shapes = shapesOnPage(store, pageId);
  const ids = new Set<string>(shapes.map((shape) => shape.id));
  const bindings = allBindings(store).filter((binding) => ids.has(binding.fromId) || ids.has(binding.toId));
  return { shapes, bindings };
}

export function clearPage(store: TLStore, pageId: string): OpResult<{ id: string; removedShapes: number }> {
  const page = requirePage(store, pageId);
  const { shapes, bindings } = pageContentIds(store, page.id);
  return {
    diff: { put: [], remove: [...shapes.map((s) => s.id), ...bindings.map((b) => b.id)] },
    result: { id: page.id, removedShapes: shapes.length }
  };
}

export function deletePage(store: TLStore, pageId: string): OpResult<{ id: string; removedShapes: number }> {
  const page = requirePage(store, pageId);
  if (getPages(store).length <= 1) {
    throw new WhiteboardOpError(errors.onlyPage);
  }
  const cleared = clearPage(store, page.id);
  return {
    diff: { put: [], remove: [...cleared.diff.remove, page.id] },
    result: cleared.result
  };
}

export function duplicatePage(store: TLStore, pageId: string): OpResult<{ id: string; name: string }> {
  const page = requirePage(store, pageId);
  const pages = getPages(store);
  const copy = PageRecordType.create({
    id: PageRecordType.createId(),
    name: ptBR.whiteboard.duplicatePageName(page.name),
    index: getIndexAbove(pages.at(-1)?.index ?? null)
  });
  const { shapes, bindings } = pageContentIds(store, page.id);
  const idMap = new Map<string, TLShapeId>(shapes.map((shape) => [shape.id, createShapeId()]));
  const mapParent = (parentId: TLParentId): TLParentId =>
    parentId === page.id ? copy.id : (idMap.get(parentId) ?? parentId);
  const shapeCopies = shapes.map((shape) => ({
    ...structuredClone(shape),
    id: idMap.get(shape.id)!,
    parentId: mapParent(shape.parentId)
  }));
  const bindingCopies = bindings
    .filter((binding) => idMap.has(binding.fromId) && idMap.has(binding.toId))
    .map((binding) => ({
      ...structuredClone(binding),
      id: createBindingId(),
      fromId: idMap.get(binding.fromId)!,
      toId: idMap.get(binding.toId)!
    }));
  return {
    diff: { put: [copy, ...shapeCopies, ...bindingCopies] as TLRecord[], remove: [] },
    result: { id: copy.id, name: copy.name }
  };
}

// ---------------------------------------------------------------------------
// shapes

/** Working view of the store plus the records an operation has staged. */
class Staging {
  readonly put = new Map<string, TLRecord>();
  readonly remove = new Set<string>();

  constructor(readonly store: TLStore) {}

  get = (id: string): TLRecord | undefined => {
    if (this.remove.has(id)) {
      return undefined;
    }
    return this.put.get(id) ?? (this.store.get(id as TLRecord["id"]) as TLRecord | undefined);
  };

  shapes(): TLShape[] {
    const byId = new Map<string, TLShape>();
    for (const shape of allShapes(this.store)) {
      byId.set(shape.id, shape);
    }
    for (const record of this.put.values()) {
      if (record.typeName === "shape") {
        byId.set(record.id, record);
      }
    }
    for (const id of this.remove) {
      byId.delete(id);
    }
    return [...byId.values()];
  }

  bindings(): TLBinding[] {
    const byId = new Map<string, TLBinding>();
    for (const binding of allBindings(this.store)) {
      byId.set(binding.id, binding);
    }
    for (const record of this.put.values()) {
      if (record.typeName === "binding") {
        byId.set(record.id, record);
      }
    }
    for (const id of this.remove) {
      byId.delete(id);
    }
    return [...byId.values()];
  }

  stage(record: TLRecord) {
    this.remove.delete(record.id);
    this.put.set(record.id, record);
  }

  drop(id: string) {
    this.put.delete(id);
    if (this.store.get(id as TLRecord["id"])) {
      this.remove.add(id);
    }
  }

  diff(): WhiteboardDiff {
    return { put: [...this.put.values()], remove: [...this.remove] as TLRecord["id"][] };
  }

  /** Index above every current child of a parent. */
  topIndex(parentId: TLParentId): IndexKey {
    const siblings = childrenOf(this.shapes(), parentId);
    return getIndexAbove(siblings.at(-1)?.index ?? null);
  }
}

function validateShape(store: TLStore, shape: TLShape, before: TLShape | null): TLShape {
  try {
    return store.schema.validateRecord(store, shape, before ? "updateRecord" : "createRecord", before) as TLShape;
  } catch (error) {
    throw new WhiteboardOpError(errors.invalid(error instanceof Error ? error.message : String(error)));
  }
}

function resolveParent(staging: Staging, parentId: string, selfId?: string): TLParentId {
  if (isPageId(parentId)) {
    const page = staging.get(parentId);
    if (!page) {
      throw new WhiteboardOpError(errors.parentNotFound(parentId));
    }
    return page.id as TLPageId;
  }
  const id = normalizeShapeId(parentId);
  const parent = staging.get(id) as TLShape | undefined;
  if (!parent) {
    // An unprefixed id may also name a page.
    const page = staging.get(normalizePageId(parentId));
    if (page) {
      return page.id as TLPageId;
    }
    throw new WhiteboardOpError(errors.parentNotFound(parentId));
  }
  if (!WHITEBOARD_CONTAINER_SHAPE_TYPES.has(parent.type)) {
    throw new WhiteboardOpError(errors.parentNotContainer(parentId));
  }
  if (selfId) {
    let cursor: TLShape | undefined = parent;
    while (cursor) {
      if (cursor.id === selfId) {
        throw new WhiteboardOpError(errors.parentIsDescendant(parentId));
      }
      cursor = isPageId(cursor.parentId) ? undefined : (staging.get(cursor.parentId) as TLShape | undefined);
    }
  }
  return id;
}

function applyText(type: string, props: Record<string, unknown>, text: string | undefined) {
  if (text === undefined) {
    return;
  }
  if (type === "frame") {
    props.name = text;
    return;
  }
  if (!WHITEBOARD_TEXT_SHAPE_TYPES.has(type)) {
    throw new WhiteboardOpError(errors.textNotSupported(type));
  }
  props.richText = plainTextToRichText(text);
}

function applyPoints(type: string, props: Record<string, unknown>, points: Point[] | undefined) {
  if (points === undefined) {
    return;
  }
  if (type !== "line" && type !== "draw") {
    throw new WhiteboardOpError(errors.pointsOnlyForLines);
  }
  if (points.length < 2) {
    throw new WhiteboardOpError(errors.notEnoughPoints);
  }
  if (type === "line") {
    const indices = getIndices(points.length);
    props.points = Object.fromEntries(
      points.map((point, i) => [indices[i]!, { id: indices[i]!, index: indices[i]!, x: point.x, y: point.y }])
    );
    return;
  }
  props.segments = [{ type: "free", path: b64Vecs.encodePoints2D(points), dim: 2 }];
  props.isComplete = true;
}

function isBoundTerminal(terminal: ArrowTerminalInput): terminal is { shapeId: string; anchor?: Point } {
  return typeof (terminal as { shapeId?: unknown }).shapeId === "string";
}

/** Sets arrow terminals; returns bindings to stage and terminals whose binding must go. */
function applyArrowTerminals(
  staging: Staging,
  arrow: TLShape,
  input: { start?: ArrowTerminalInput; end?: ArrowTerminalInput }
): { props: Record<string, unknown>; bindings: TLBinding[]; replaced: string[] } {
  const props = { ...(arrow.props as Record<string, unknown>) };
  const bindings: TLBinding[] = [];
  const replaced: string[] = [];
  const arrowInverse = Mat.Inverse(Mat.Compose(parentPageTransform(staging.get, arrow.parentId), localMatrix(arrow)));

  for (const terminal of ["start", "end"] as const) {
    const value = input[terminal];
    if (!value) {
      continue;
    }
    replaced.push(terminal);
    if (!isBoundTerminal(value)) {
      const parentMatrix = parentPageTransform(staging.get, arrow.parentId);
      const pagePoint = parentMatrix.applyToPoint(value);
      const local = Mat.applyToPoint(arrowInverse, pagePoint);
      props[terminal] = { x: round(local.x), y: round(local.y) };
      continue;
    }
    const targetId = normalizeShapeId(value.shapeId);
    const target = staging.get(targetId) as TLShape | undefined;
    if (!target || target.id === arrow.id) {
      throw new WhiteboardOpError(errors.boundShapeNotFound(value.shapeId));
    }
    const anchor = value.anchor ?? { x: 0.5, y: 0.5 };
    const box = localBox(target, staging.shapes());
    const targetPage = Mat.Compose(parentPageTransform(staging.get, target.parentId), localMatrix(target));
    const pagePoint = targetPage.applyToPoint({
      x: box.minX + (box.maxX - box.minX) * anchor.x,
      y: box.minY + (box.maxY - box.minY) * anchor.y
    });
    const local = Mat.applyToPoint(arrowInverse, pagePoint);
    props[terminal] = { x: round(local.x), y: round(local.y) };
    bindings.push({
      id: createBindingId(),
      typeName: "binding",
      type: "arrow",
      fromId: arrow.id,
      toId: target.id,
      meta: {},
      props: {
        ...getDefaultBindingProps("arrow"),
        terminal,
        normalizedAnchor: anchor,
        isPrecise: value.anchor !== undefined
      }
    } as TLBinding);
  }
  return { props, bindings, replaced };
}

function withPosition<T>(position: number, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof WhiteboardOpError) {
      throw new WhiteboardOpError(errors.shapeAt(position, error.message));
    }
    throw error;
  }
}

function firstPoint(terminal: ArrowTerminalInput | undefined, staging: Staging): Point | undefined {
  if (!terminal) {
    return undefined;
  }
  if (!isBoundTerminal(terminal)) {
    return terminal;
  }
  const target = staging.get(normalizeShapeId(terminal.shapeId)) as TLShape | undefined;
  return target ? { x: target.x, y: target.y } : undefined;
}

export function createShapes(
  store: TLStore,
  pageId: string | undefined,
  inputs: ShapeCreateInput[]
): OpResult<{ pageId: string; ids: string[] }> {
  const page = resolvePage(store, pageId);
  const staging = new Staging(store);
  const ids: string[] = [];

  inputs.forEach((input, i) =>
    withPosition(i, () => {
      if (!(WHITEBOARD_SHAPE_TYPES as readonly string[]).includes(input.type)) {
        throw new WhiteboardOpError(errors.unknownShapeType(input.type));
      }
      const id = input.id ? normalizeShapeId(input.id) : createShapeId();
      if (staging.get(id)) {
        throw new WhiteboardOpError(errors.duplicateId(id));
      }
      if ((input.start || input.end) && input.type !== "arrow") {
        throw new WhiteboardOpError(errors.bindingOnlyForArrows);
      }
      const parentId = input.parentId ? resolveParent(staging, input.parentId) : page.id;
      const props = { ...getDefaultShapeProps(input.type)!, ...(input.props ?? {}) };
      applyText(input.type, props, input.text);
      applyPoints(input.type, props, input.points);

      const origin = input.type === "arrow" ? firstPoint(input.start, staging) : undefined;
      let shape = {
        id,
        typeName: "shape",
        type: input.type,
        parentId,
        index: staging.topIndex(parentId),
        x: input.x ?? origin?.x ?? 0,
        y: input.y ?? origin?.y ?? 0,
        rotation: input.rotation ?? 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        props
      } as unknown as TLShape;

      let bindings: TLBinding[] = [];
      if (input.type === "arrow" && (input.start || input.end)) {
        const terminals = applyArrowTerminals(staging, shape, input);
        shape = { ...shape, props: terminals.props } as unknown as TLShape;
        bindings = terminals.bindings;
      }
      staging.stage(validateShape(store, shape, null));
      for (const binding of bindings) {
        staging.stage(binding);
      }
      ids.push(id);
    })
  );

  return { diff: staging.diff(), result: { pageId: page.id, ids } };
}

export function updateShapes(store: TLStore, inputs: ShapeUpdateInput[]): OpResult<{ ids: string[] }> {
  const staging = new Staging(store);
  const ids: string[] = [];

  inputs.forEach((input, i) =>
    withPosition(i, () => {
      const before = requireShape(store, input.id);
      let shape = (staging.get(before.id) as TLShape) ?? before;
      if ((input.start || input.end) && shape.type !== "arrow") {
        throw new WhiteboardOpError(errors.bindingOnlyForArrows);
      }

      if (input.parentId !== undefined) {
        const parentId = resolveParent(staging, input.parentId, shape.id);
        if (parentId !== shape.parentId) {
          const pageMatrix = Mat.Compose(parentPageTransform(staging.get, shape.parentId), localMatrix(shape));
          const local = decompose(Mat.Compose(Mat.Inverse(parentPageTransform(staging.get, parentId)), pageMatrix));
          shape = { ...shape, parentId, index: staging.topIndex(parentId), ...local } as TLShape;
        }
      }
      shape = {
        ...shape,
        ...(input.x !== undefined ? { x: input.x } : {}),
        ...(input.y !== undefined ? { y: input.y } : {}),
        ...(input.rotation !== undefined ? { rotation: input.rotation } : {})
      } as TLShape;

      const props = { ...(shape.props as Record<string, unknown>), ...(input.props ?? {}) };
      applyText(shape.type, props, input.text);
      applyPoints(shape.type, props, input.points);
      shape = { ...shape, props } as unknown as TLShape;

      if (shape.type === "arrow" && (input.start || input.end)) {
        const terminals = applyArrowTerminals(staging, shape, input);
        shape = { ...shape, props: terminals.props } as unknown as TLShape;
        for (const old of staging.bindings()) {
          const terminal = (old.props as { terminal?: string }).terminal;
          if (old.fromId === shape.id && terminal && terminals.replaced.includes(terminal)) {
            staging.drop(old.id);
          }
        }
        for (const binding of terminals.bindings) {
          staging.stage(binding);
        }
      }

      staging.stage(validateShape(store, shape, before));
      ids.push(shape.id);
    })
  );

  return { diff: staging.diff(), result: { ids } };
}

export function deleteShapes(store: TLStore, ids: string[]): OpResult<{ removed: string[] }> {
  const shapes = allShapes(store);
  const targets = ids.map((id) => requireShape(store, id));
  const removed = new Set<string>();
  for (const target of targets) {
    removed.add(target.id);
    for (const descendant of descendantsInZOrder(shapes, target.id)) {
      removed.add(descendant.id);
    }
  }
  const bindings = allBindings(store).filter((binding) => removed.has(binding.fromId) || removed.has(binding.toId));
  return {
    diff: { put: [], remove: [...removed, ...bindings.map((b) => b.id)] as TLRecord["id"][] },
    result: { removed: [...removed] }
  };
}

export function groupShapes(store: TLStore, ids: string[]): OpResult<{ groupId: string }> {
  const unique = [...new Set(ids.map(normalizeShapeId))];
  if (unique.length < 2) {
    throw new WhiteboardOpError(errors.groupNeedsTwo);
  }
  const members = unique.map((id) => requireShape(store, id)).sort(sortByIndex);
  const parentId = members[0]!.parentId;
  if (members.some((shape) => shape.parentId !== parentId)) {
    throw new WhiteboardOpError(errors.groupMixedParents);
  }
  const box = unionBox(members, allShapes(store));
  const group = {
    id: createShapeId(),
    typeName: "shape",
    type: "group",
    parentId,
    index: members[0]!.index,
    x: round(box.minX),
    y: round(box.minY),
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    props: getDefaultShapeProps("group") ?? {}
  } as unknown as TLShape;
  const indices = getIndices(members.length);
  const children = members.map(
    (shape, i) =>
      ({
        ...shape,
        parentId: group.id,
        index: indices[i]!,
        x: round(shape.x - group.x),
        y: round(shape.y - group.y)
      }) as TLShape
  );
  return {
    diff: { put: [validateShape(store, group, null), ...children], remove: [] },
    result: { groupId: group.id }
  };
}

export function ungroupShapes(store: TLStore, groupId: string): OpResult<{ childIds: string[] }> {
  const group = requireShape(store, groupId);
  if (group.type !== "group") {
    throw new WhiteboardOpError(errors.notAGroup(groupId));
  }
  const shapes = allShapes(store);
  const children = childrenOf(shapes, group.id);
  const siblings = childrenOf(shapes, group.parentId);
  const above = siblings[siblings.findIndex((shape) => shape.id === group.id) + 1];
  const indices = getIndicesBetween(group.index, above?.index ?? null, children.length);
  const groupMatrix = localMatrix(group);
  const moved = children.map(
    (child, i) =>
      ({
        ...child,
        parentId: group.parentId,
        index: indices[i]!,
        ...decompose(Mat.Compose(groupMatrix, localMatrix(child)))
      }) as TLShape
  );
  return {
    diff: { put: moved, remove: [group.id] },
    result: { childIds: moved.map((shape) => shape.id) }
  };
}

function reorderSiblings(order: TLShape[], selected: Set<string>, action: ReorderAction): TLShape[] {
  const list = [...order];
  if (action === "bring_to_front") {
    return [...list.filter((s) => !selected.has(s.id)), ...list.filter((s) => selected.has(s.id))];
  }
  if (action === "send_to_back") {
    return [...list.filter((s) => selected.has(s.id)), ...list.filter((s) => !selected.has(s.id))];
  }
  if (action === "bring_forward") {
    for (let i = list.length - 2; i >= 0; i--) {
      if (selected.has(list[i]!.id) && !selected.has(list[i + 1]!.id)) {
        [list[i], list[i + 1]] = [list[i + 1]!, list[i]!];
      }
    }
    return list;
  }
  for (let i = 1; i < list.length; i++) {
    if (selected.has(list[i]!.id) && !selected.has(list[i - 1]!.id)) {
      [list[i], list[i - 1]] = [list[i - 1]!, list[i]!];
    }
  }
  return list;
}

/** New indexes for `next`, touching only shapes whose relative position changed. */
function reindex(next: TLShape[]): TLShape[] {
  const changed: TLShape[] = [];
  let below: IndexKey | null = null;
  for (let i = 0; i < next.length; i++) {
    const shape = next[i]!;
    if (below === null || shape.index > below) {
      below = shape.index;
      continue;
    }
    // Find the next shape that is still above `below` to bound the new index.
    let aboveIndex: IndexKey | null = null;
    for (let j = i + 1; j < next.length; j++) {
      if (next[j]!.index > below) {
        aboveIndex = next[j]!.index;
        break;
      }
    }
    const index: IndexKey = getIndexBetween(below, aboveIndex);
    changed.push({ ...shape, index } as TLShape);
    below = index;
  }
  return changed;
}

export function reorderShapes(store: TLStore, ids: string[], action: ReorderAction): OpResult<{ ids: string[] }> {
  const targets = ids.map((id) => requireShape(store, id));
  const selected = new Set<string>(targets.map((shape) => shape.id));
  const parents = new Set(targets.map((shape) => shape.parentId));
  const shapes = allShapes(store);
  const put: TLShape[] = [];
  for (const parentId of parents) {
    const order = childrenOf(shapes, parentId);
    put.push(...reindex(reorderSiblings(order, selected, action)));
  }
  return { diff: { put, remove: [] }, result: { ids: targets.map((shape) => shape.id) } };
}


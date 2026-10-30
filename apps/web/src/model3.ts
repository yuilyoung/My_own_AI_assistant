/** Validates model3 metadata without loading or redistributing Cubism Core or models. */
export type CubismModel3 = {
  moc: string;
  textures: string[];
  referencedFiles: string[];
  lipSyncIds: string[];
  expressions: Record<string, string>;
  motions: Record<string, string[]>;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("잘못된 Cubism model3 JSON 형식입니다.");
  return value as Record<string, unknown>;
}

/** Only files inside the selected model directory are permitted. */
export function localAssetPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 256 ||
    value.includes("\\") ||
    /[?#:%\u0000-\u001f]/.test(value) ||
    value.startsWith("/") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("모델 파일 경로는 안전한 상대 경로여야 합니다.");
  return value;
}

function entries(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128)
    throw new Error("모델 항목 목록이 유효하지 않습니다.");
  return value;
}

function resource(value: unknown): string {
  return localAssetPath(record(value).File);
}

/** Uses official model3.json fields; this parser is not a renderer. */
export function parseModel3(value: unknown): CubismModel3 {
  const model = record(value);
  if (model.Version !== 3) throw new Error("Cubism model3 Version 3이 필요합니다.");
  const refs = record(model.FileReferences);
  const moc = localAssetPath(refs.Moc);
  const textures = entries(refs.Textures).map(localAssetPath);
  if (textures.length === 0) throw new Error("모델 텍스처가 없습니다.");
  const expressions: Record<string, string> = {};
  const motions: Record<string, string[]> = {};
  const referencedFiles = [moc, ...textures];

  for (const key of ["Physics", "Pose", "DisplayInfo", "UserData"]) {
    if (refs[key] !== undefined) referencedFiles.push(localAssetPath(refs[key]));
  }
  for (const item of entries(refs.Expressions)) {
    const expression = record(item);
    const name = expression.Name;
    if (typeof name !== "string" || !name || name.length > 80 || name in expressions)
      throw new Error("표정 이름이 유효하지 않습니다.");
    const path = resource(expression);
    expressions[name] = path;
    referencedFiles.push(path);
  }
  if (refs.Motions !== undefined) {
    const groups = record(refs.Motions);
    for (const [name, value] of Object.entries(groups)) {
      if (!name || name.length > 80 || ["__proto__", "prototype", "constructor"].includes(name))
        throw new Error("모션 그룹 이름이 유효하지 않습니다.");
      const files = entries(value).map(resource);
      motions[name] = files;
      referencedFiles.push(...files);
    }
  }
  const lipSyncIds: string[] = [];
  for (const group of entries(model.Groups)) {
    const spec = record(group);
    if (spec.Target !== "Parameter" || spec.Name !== "LipSync") continue;
    for (const id of entries(spec.Ids)) {
      if (typeof id !== "string" || !id || id.length > 128)
        throw new Error("LipSync 파라미터 ID가 유효하지 않습니다.");
      if (!lipSyncIds.includes(id)) lipSyncIds.push(id);
    }
  }
  if (referencedFiles.length > 300) throw new Error("모델 자산이 너무 많습니다.");
  return { moc, textures, referencedFiles, lipSyncIds, expressions, motions };
}

/** Enforces same-origin file loading and prevents traversal out of a model folder. */
export function resolveModelAsset(modelUrl: string, file: string, origin: string): string {
  const base = new URL(origin);
  const model = new URL(modelUrl, base);
  if (model.origin !== base.origin || !model.pathname.endsWith(".model3.json"))
    throw new Error("동일 출처의 model3.json 파일만 선택할 수 있습니다.");
  const asset = new URL(localAssetPath(file), model);
  const folder = model.pathname.slice(0, model.pathname.lastIndexOf("/") + 1);
  if (asset.origin !== base.origin || !asset.pathname.startsWith(folder))
    throw new Error("모델 폴더 외부의 파일은 읽을 수 없습니다.");
  return asset.href;
}

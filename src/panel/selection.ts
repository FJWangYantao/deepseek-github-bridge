import {
  type ContextFile,
  validateContextFiles,
} from "../runtime/context-builder";

export function appendSelectedFile(
  files: ContextFile[],
  contextFile: ContextFile,
): ContextFile[] {
  if (
    files.some(
      (file) =>
        file.repo === contextFile.repo &&
        file.ref === contextFile.ref &&
        file.path === contextFile.path,
    )
  ) {
    return files;
  }

  const nextFiles = [...files, contextFile];
  validateContextFiles(nextFiles);
  return nextFiles;
}

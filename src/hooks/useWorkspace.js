import { useCallback, useEffect, useMemo, useState } from "react";
import { STORAGE } from "../lib/constants.js";
import { extractCodeFiles } from "../lib/api.js";
import { readStored, writeStored } from "../lib/store.js";

/** Merge function that never clobbers a file the user has edited. */
const mergeFiles = (existing, incoming) => {
  const byPath = new Map(existing.map((f) => [f.path, f]));
  const added = [];
  for (const file of incoming) {
    const current = byPath.get(file.path);
    if (!current) {
      byPath.set(file.path, { ...file, edited: false });
      added.push(file.path);
      continue;
    }
    // Same path, different content and untouched by the user → refresh it.
    if (!current.edited && current.code !== file.code) byPath.set(file.path, { ...file, edited: false, updatedAt: Date.now() });
  }
  return { files: [...byPath.values()], added };
};

/**
 * The project workspace: everything the swarm produced, editable, exportable.
 */
export default function useWorkspace(outputs) {
  const [files, setFiles] = useState(() => readStored(STORAGE.workspace, []));
  const [lastAdded, setLastAdded] = useState([]);

  useEffect(() => {
    if (!outputs || !Object.keys(outputs).length) return;
    const incoming = [];
    for (const [agent, out] of Object.entries(outputs)) {
      if (out?.text) incoming.push(...extractCodeFiles(out.text, { agentName: agent }));
    }
    if (!incoming.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing newly streamed agent output into the persisted workspace store
    setFiles((prev) => {
      const { files: next, added } = mergeFiles(prev, incoming);
      if (added.length) setLastAdded(added);
      return added.length || next.length !== prev.length ? next : prev;
    });
  }, [outputs]);

  useEffect(() => {
    writeStored(STORAGE.workspace, files);
  }, [files]);

  const addFile = useCallback((file) => {
    const path = file.path?.trim() || `untitled-${Date.now().toString(36)}.txt`;
    setFiles((prev) => [...prev.filter((f) => f.path !== path), { id: `u_${Date.now().toString(36)}`, path, lang: file.lang || "text", code: file.code || "", agent: "you", edited: true }]);
  }, []);

  const updateFile = useCallback((path, code) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, code, edited: true, updatedAt: Date.now() } : f)));
  }, []);

  const renameFile = useCallback((path, nextPath) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, path: nextPath, edited: true } : f)));
  }, []);

  const removeFile = useCallback((path) => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
  }, []);

  const clearAll = useCallback(() => setFiles([]), []);

  const stats = useMemo(
    () => ({
      count: files.length,
      lines: files.reduce((sum, f) => sum + (f.code ? f.code.split("\n").length : 0), 0),
      bytes: files.reduce((sum, f) => sum + (f.code?.length || 0), 0),
      edited: files.filter((f) => f.edited).length,
    }),
    [files],
  );

  return { files, stats, lastAdded, addFile, updateFile, renameFile, removeFile, clearAll, setFiles };
}

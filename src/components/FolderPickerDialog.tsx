"use client";
import { type Folder, type FolderTree } from "@/lib/folder-store";
import { FolderOpen } from "lucide-react";

interface FolderPickerDialogProps {
  tree: FolderTree;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
  excludeId?: string; // don't show this folder as option
}

export function FolderPickerDialog({ tree, onSelect, onClose, excludeId }: FolderPickerDialogProps) {
  const rootFolders = tree.rootOrder
    .filter(id => tree.folders[id] && id !== excludeId)
    .map(id => tree.folders[id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-72 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <p className="mb-3 font-medium">Move to folder</p>
        <button
          className="mb-2 w-full rounded-lg border border-border p-2 text-left text-sm hover:bg-muted/50"
          onClick={() => onSelect(null)}
        >
          Root (no folder)
        </button>
        {rootFolders.map(f => (
          <button
            key={f.id}
            className="mb-1 flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-sm hover:bg-muted/50"
            onClick={() => onSelect(f.id)}
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            {f.name}
          </button>
        ))}
        <button className="mt-2 w-full rounded-lg border px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

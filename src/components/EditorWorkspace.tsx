import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  MousePointer2,
  Brush,
  Waves,
  Route,
  Minus,
  Undo2,
  Redo2,
  Save,
  Upload,
  Flag,
  Plus,
  Check,
  Layers,
  Magnet,
  Spline,
  CornerDownRight,
} from "lucide-react";
import type { World } from "../../shared/world";
import type { EditorTool } from "./WorldMap";
export type EditorSelection = {
  kingdomId: string | null;
  settlementId: string | null;
  entryId?: string | null;
};
export function PropertyPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setTarget(document.getElementById("editor-properties-content"));
  }, []);
  return target ? createPortal(children, target) : null;
}
export function EditorHierarchy({
  world,
  selection,
  onSelect,
}: {
  world: World;
  selection: EditorSelection;
  onSelect: (selection: EditorSelection) => void;
}) {
  return (
    <section className="editor-hierarchy" aria-label="World hierarchy">
      <header>
        <span>WORLD EXPLORER</span>
        <small>
          {world.territories.length} kingdoms · {world.locations.length} places
        </small>
      </header>
      {!world.territories.length && (
        <p>Create a kingdom from the ribbon to begin.</p>
      )}
      {world.territories.map((k) => (
        <details key={k.id} open>
          <summary>
            <Flag size={14} style={{ color: k.color }} />
            <button
              className={
                selection.kingdomId === k.id && !selection.settlementId
                  ? "selected"
                  : ""
              }
              onClick={(e) => {
                e.preventDefault();
                onSelect({ kingdomId: k.id, settlementId: null });
              }}
            >
              {k.name}
            </button>
          </summary>
          <div className="editor-tree-children">
            {world.locations
              .filter((l) => l.kingdomId === k.id)
              .map((l) => (
                <details key={l.id} open={selection.settlementId === l.id}>
                  <summary>
                    <button
                      className={
                        selection.settlementId === l.id ? "selected" : ""
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        onSelect({ kingdomId: k.id, settlementId: l.id });
                      }}
                    >
                      {l.name}
                      <small>{l.kind}</small>
                    </button>
                  </summary>
                  <div className="editor-tree-children">
                    {l.entries.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() =>
                          onSelect({
                            kingdomId: k.id,
                            settlementId: l.id,
                            entryId: entry.id,
                          })
                        }
                      >
                        {entry.name}
                      </button>
                    ))}
                  </div>
                </details>
              ))}
          </div>
        </details>
      ))}
    </section>
  );
}
type RibbonProps = {
  category: "places" | "landscape";
  onCategory: (category: "places" | "landscape") => void;
  tool: EditorTool;
  onTool: (tool: EditorTool) => void;
  editingBorder: boolean;
  borderStyle: "straight" | "smooth";
  onStyle: (style: "straight" | "smooth") => void;
  pointCount: number;
  selectedPoint: number | null;
  sharp: boolean;
  onSharp: () => void;
  onDelete: () => void;
  onNewKingdom: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  snap: boolean;
  onSnap: () => void;
  grid: boolean;
  onGrid: () => void;
  onSave: () => void;
  onPublish: () => void;
  publishLabel: string;
  publishDisabled: boolean;
  saving: boolean;
  dirty: boolean;
  saved: string;
};
export function EditorRibbon(p: RibbonProps) {
  const tools =
    p.category === "landscape"
      ? ([
          { id: "pan", name: "Navigate", icon: MousePointer2 },
          { id: "terrain", name: "Terrain", icon: Brush },
          { id: "river", name: "Add river", icon: Waves },
          { id: "erase-river", name: "Erase river", icon: Minus },
          { id: "road", name: "Add road", icon: Route },
          { id: "erase-road", name: "Erase road", icon: Minus },
        ] as const)
      : ([
          { id: "pan", name: "Navigate", icon: MousePointer2 },
          { id: "border-point", name: "Select points", icon: MousePointer2 },
          { id: "border", name: "Add border points", icon: Plus },
        ] as const);
  return (
    <header className="editor-ribbon" aria-label="World editor toolbar">
      <div className="editor-ribbon-title">
        <div>
          <strong>
            MERGING SUN <span>WORLD EDITOR</span>
          </strong>
          <small>
            {p.dirty ? "● Unpublished changes" : "Published world"}
            {p.saved
              ? ` · Draft saved ${p.saved} in this browser`
              : " · Drafts stay in this browser"}
          </small>
        </div>
        <div className="editor-save-actions">
          <button onClick={p.onSave} disabled={p.saving}>
            <Save size={16} />
            Save draft
          </button>
          <button
            className="editor-publish"
            onClick={p.onPublish}
            disabled={p.publishDisabled}
          >
            <Upload size={16} />
            {p.saving ? "Publishing…" : p.publishLabel}
          </button>
        </div>
      </div>
      <div className="editor-ribbon-tools">
        <div
          className="editor-ribbon-tabs"
          role="group"
          aria-label="Editor category"
        >
          {(["places", "landscape"] as const).map((category) => (
            <button
              key={category}
              aria-pressed={p.category === category}
              onClick={() => p.onCategory(category)}
            >
              {category === "places" ? "Places" : "Landscape"}
            </button>
          ))}
        </div>
        <div className="editor-tool-group">
          {tools.map((t) => (
            <button
              key={t.id}
              aria-pressed={p.tool === t.id}
              className={p.tool === t.id ? "active" : ""}
              disabled={
                (t.id === "border-point" || t.id === "border") &&
                !p.editingBorder
              }
              onClick={() => p.onTool(t.id)}
            >
              <t.icon size={18} />
              {t.name}
            </button>
          ))}
          {p.category === "places" && (
            <button onClick={p.onNewKingdom} disabled={p.editingBorder}>
              <Flag size={18} />
              New kingdom
            </button>
          )}
        </div>
        <div className="editor-tool-group">
          <button
            aria-label="Undo map edit"
            title="Undo · Ctrl+Z"
            disabled={!p.canUndo}
            onClick={p.onUndo}
          >
            <Undo2 size={18} />
            Undo
          </button>
          <button
            aria-label="Redo map edit"
            title="Redo · Ctrl+Shift+Z or Ctrl+Y"
            disabled={!p.canRedo}
            onClick={p.onRedo}
          >
            <Redo2 size={18} />
            Redo
          </button>
        </div>
        <div className="editor-tool-group">
          <button aria-pressed={p.grid} onClick={p.onGrid}>
            <Layers size={18} />
            Grid
          </button>
          <button
            aria-pressed={p.snap}
            onClick={p.onSnap}
            title="Snap border points and placed settlements to hex centers"
          >
            <Magnet size={18} />
            Snap to hex
          </button>
        </div>
        {p.editingBorder && (
          <div className="editor-tool-group border-ribbon">
            <button
              aria-pressed={p.borderStyle === "smooth"}
              onClick={() =>
                p.onStyle(p.borderStyle === "smooth" ? "straight" : "smooth")
              }
            >
              <Spline size={18} />
              {p.borderStyle === "smooth" ? "Smooth border" : "Straight border"}
            </button>
            <button disabled={p.selectedPoint === null} onClick={p.onSharp}>
              <CornerDownRight size={18} />
              {p.sharp ? "Make smooth" : "Sharp corner"}
            </button>
            <button
              disabled={p.selectedPoint === null || p.pointCount <= 3}
              onClick={p.onDelete}
            >
              Delete point
            </button>
            <button
              disabled={p.pointCount < 3}
              onClick={() => p.onTool("border-point")}
            >
              <Check size={18} />
              Finish drawing
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

import { Modal } from "./Modal";
export function EditorFormFrame({
  title,
  subtitle,
  onClose,
  children,
  inline = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  inline?: boolean;
}) {
  return inline ? (
    <section className="inline-editor-form">
      <header>
        <h2>{title}</h2>
        <button className="text-button" type="button" onClick={onClose}>
          Close properties
        </button>
      </header>
      {subtitle && <p className="fine-print">{subtitle}</p>}
      {children}
    </section>
  ) : (
    <Modal title={title} subtitle={subtitle} onClose={onClose} wide>
      {children}
    </Modal>
  );
}

import { call, friendlyError } from "../useWorld";
import { coverUrl } from "../../shared/assets";
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Italic,
  Heading2,
  List,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Unlink,
} from "lucide-react";
export function LoreEditor({
  value,
  onChange,
  label = "Location lore",
  uploadImages = false,
  onBusyChange,
}: {
  label?: string;
  uploadImages?: boolean;
  onBusyChange?: (busy: boolean) => void;
  value: string;
  onChange: (html: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          protocols: ["https", "http"],
          autolink: true,
        },
      }),
      Image.configure({ allowBase64: false }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "lore-input",
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
      },
    },
  });
  useEffect(() => {
    if (
      editor &&
      !editor.isDestroyed &&
      editor.schema &&
      editor.getHTML() !== value
    )
      editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);
  if (!editor || editor.isDestroyed || !editor.schema) return null;
  function link() {
    const url = window.prompt(
      "Link to an https:// address or a location such as #location=emberfall",
      editor!.getAttributes("link").href || "https://",
    );
    if (url === null) return;
    if (!url) editor!.chain().focus().unsetLink().run();
    else if (/^https?:\/\//i.test(url) || /^#location=[\w-]+$/.test(url))
      editor!.chain().focus().setLink({ href: url }).run();
  }
  function image() {
    const url = window.prompt("Public HTTPS image URL");
    if (url && /^https:\/\//i.test(url))
      editor!
        .chain()
        .focus()
        .setImage({ src: url, alt: "Lore illustration" })
        .run();
  }
  return (
    <div className="rich-editor">
      {uploadImages && (
        <>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setUploading(true);
              onBusyChange?.(true);
              setUploadError("");
              try {
                if (file.size > 6 * 1024 * 1024)
                  throw new Error("Choose an image up to 6 MB.");
                const image = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = () =>
                    reject(new Error("Could not read image."));
                  reader.readAsDataURL(file);
                });
                const result = await call<{ id: string }>("uploadWorldAsset", {
                  kind: "cover",
                  image,
                });
                if (!editor.isDestroyed)
                  editor
                    .chain()
                    .focus()
                    .setImage({ src: coverUrl(result.id), alt: file.name })
                    .run();
              } catch (error) {
                setUploadError(friendlyError(error));
              } finally {
                setUploading(false);
                onBusyChange?.(false);
              }
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? "Uploading illustration…" : "Upload illustration"}
          </button>
          {uploadError && <p role="alert">{uploadError}</p>}
        </>
      )}

      <div className="editor-toolbar">
        {[
          {
            label: "Bold",
            icon: Bold,
            active: editor.isActive("bold"),
            action: () => editor.chain().focus().toggleBold().run(),
          },
          {
            label: "Italic",
            icon: Italic,
            active: editor.isActive("italic"),
            action: () => editor.chain().focus().toggleItalic().run(),
          },
          {
            label: "Heading",
            icon: Heading2,
            active: editor.isActive("heading"),
            action: () =>
              editor.chain().focus().toggleHeading({ level: 2 }).run(),
          },
          {
            label: "Bullet list",
            icon: List,
            active: editor.isActive("bulletList"),
            action: () => editor.chain().focus().toggleBulletList().run(),
          },
          {
            label: "Quote",
            icon: Quote,
            active: editor.isActive("blockquote"),
            action: () => editor.chain().focus().toggleBlockquote().run(),
          },
          {
            label: "Add link",
            icon: LinkIcon,
            active: editor.isActive("link"),
            action: link,
          },
          {
            label: "Remove link",
            icon: Unlink,
            action: () => editor.chain().focus().unsetLink().run(),
          },
          { label: "Add image", icon: ImageIcon, action: image },
          {
            label: "Undo writing",
            icon: Undo2,
            action: () => editor.chain().focus().undo().run(),
          },
          {
            label: "Redo writing",
            icon: Redo2,
            action: () => editor.chain().focus().redo().run(),
          },
        ].map((b) => (
          <button
            type="button"
            title={b.label}
            aria-label={b.label}
            key={b.label}
            className={b.active ? "active" : ""}
            onClick={b.action}
          >
            <b.icon size={16} />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

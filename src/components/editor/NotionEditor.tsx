"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { ImagePlus } from "lucide-react";

export interface NotionEditorHandle {
  getTextContent: () => string;
  getJSON: () => Record<string, unknown>;
  getHTML: () => string;
  insertImage: (src: string, alt?: string) => void;
  focus: () => void;
}

interface NotionEditorProps {
  initialContent?: string;
  placeholder?: string;
  readOnly?: boolean;
  activeBlockClass?: string;
  onContentChange?: (text: string) => void;
  onImagePaste?: (file: File) => void;
  onImageDrop?: (file: File) => void;
}

export const NotionEditor = forwardRef<NotionEditorHandle, NotionEditorProps>(
  function NotionEditor(
    {
      initialContent,
      placeholder = "Start typing, or paste an image...",
      readOnly = false,
      onContentChange,
      onImagePaste,
      onImageDrop,
    },
    ref
  ) {
    const contentChangeRef = useRef(onContentChange);
    contentChangeRef.current = onContentChange;

    const imagePasteRef = useRef(onImagePaste);
    imagePasteRef.current = onImagePaste;

    const imageDropRef = useRef(onImageDrop);
    imageDropRef.current = onImageDrop;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          codeBlock: { HTMLAttributes: { class: "code-block" } },
        }),
        Placeholder.configure({ placeholder }),
        Image.configure({
          inline: false,
          allowBase64: true,
          HTMLAttributes: { class: "editor-image" },
        }),
      ],
      content: initialContent || "",
      editable: !readOnly,
      editorProps: {
        attributes: {
          class: "tiptap-editor-content focus:outline-none",
        },
        handlePaste: (view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;

          for (const item of Array.from(items)) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file && imagePasteRef.current) {
                event.preventDefault();
                imagePasteRef.current(file);
                return true;
              }
            }
          }
          return false;
        },
        handleDrop: (view, event) => {
          const files = event.dataTransfer?.files;
          if (!files || files.length === 0) return false;

          for (const file of Array.from(files)) {
            if (file.type.startsWith("image/")) {
              event.preventDefault();
              imageDropRef.current?.(file);
              return true;
            }
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        contentChangeRef.current?.(editor.getText());
      },
    });

    // Update editable state
    useEffect(() => {
      if (editor) {
        editor.setEditable(!readOnly);
      }
    }, [editor, readOnly]);

    // Expose imperative handle
    useImperativeHandle(ref, () => ({
      getTextContent: () => editor?.getText() ?? "",
      getJSON: () => (editor?.getJSON() ?? {}) as Record<string, unknown>,
      getHTML: () => editor?.getHTML() ?? "",
      insertImage: (src: string, alt?: string) => {
        editor?.chain().focus().setImage({ src, alt: alt ?? "" }).run();
      },
      focus: () => editor?.commands.focus(),
    }));

    const handleImageUpload = useCallback(() => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file && imagePasteRef.current) {
          imagePasteRef.current(file);
        }
      };
      input.click();
    }, []);

    if (!editor) return null;

    return (
      <div className="tiptap-editor flex flex-col h-full">
        {/* Floating toolbar at the top of editor area */}
        <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border shrink-0">
          <EditorToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold (Ctrl+B)"
          >
            <span className="font-bold text-xs">B</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic (Ctrl+I)"
          >
            <span className="italic text-xs">I</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <span className="text-xs font-semibold">H1</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <span className="text-xs font-semibold">H2</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <span className="text-xs">&#8226;</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <span className="text-xs">1.</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Quote"
          >
            <span className="text-xs">&ldquo;</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code block"
          >
            <span className="text-xs font-mono">&lt;/&gt;</span>
          </EditorToolbarButton>

          <div className="w-px h-4 bg-border mx-1" />

          <EditorToolbarButton
            active={false}
            onClick={handleImageUpload}
            title="Insert image"
          >
            <ImagePlus size={14} />
          </EditorToolbarButton>
        </div>

        {/* Editor content */}
        <div className="flex-1 overflow-y-auto px-12 py-8">
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);

function EditorToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-notion transition-colors
        ${
          active
            ? "bg-accent-muted text-accent-text"
            : "text-text-secondary hover:bg-surface-hover hover:text-text"
        }`}
    >
      {children}
    </button>
  );
}

import type { KeyboardEvent } from "react";

export function handleMarkdownTab(
  event: KeyboardEvent<HTMLTextAreaElement>,
  setValue: (value: string) => void,
) {
  if (event.key !== "Tab") return;

  event.preventDefault();
  const textarea = event.currentTarget;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const indent = "  ";
  const value = textarea.value;

  setValue(`${value.slice(0, start)}${indent}${value.slice(end)}`);
  requestAnimationFrame(() => {
    textarea.setSelectionRange(start + indent.length, start + indent.length);
  });
}

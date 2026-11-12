import type { KeyboardEvent } from "react";

export function handleTabListKeyDown(event: KeyboardEvent<HTMLElement>) {
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
  const currentIndex = tabs.indexOf(event.target as HTMLElement);
  if (currentIndex < 0 || tabs.length < 2) return;

  let nextIndex: number;
  switch (event.key) {
    case "ArrowRight":
      nextIndex = (currentIndex + 1) % tabs.length;
      break;
    case "ArrowLeft":
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = tabs.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

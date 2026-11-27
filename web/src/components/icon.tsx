import type { ReactNode, SVGProps } from "react";

type IconName =
  | "arrow"
  | "chat"
  | "close"
  | "edit"
  | "leaf"
  | "logout"
  | "menu"
  | "more"
  | "plus"
  | "search"
  | "spark"
  | "trash";

const iconPaths: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  chat: <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-2 2v-6.5A7.5 7.5 0 1 1 20 11.5Z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />,
  leaf: <path d="M19.5 4.5c-7.4-.5-12.2 2.6-12.2 8 0 2.5 1.7 4.2 4.1 4.2 5.5 0 8.5-4.9 8.1-12.2ZM5 20c2.2-4.1 5.5-7 9.8-9.3" />,
  logout: <path d="M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  plus: <path d="M12 5v14m-7-7h14" />,
  search: <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.4-4.4" />,
  spark: <path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5L12 3Zm7 11 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />,
  trash: <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
};

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}

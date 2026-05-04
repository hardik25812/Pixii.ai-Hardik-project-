'use client';

declare global {
  interface Window {
    __pixiiOpenChat?: () => void;
  }
}

export default function NavChatButton() {
  return (
    <button
      type="button"
      onClick={() => window.__pixiiOpenChat?.()}
      className="flex items-center gap-2.5 rounded-full bg-ink px-5 py-2.5 text-sm font-black text-white shadow-lg transition hover:scale-[1.03] hover:opacity-90 active:scale-[0.98]"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
      Pixii Chat
    </button>
  );
}

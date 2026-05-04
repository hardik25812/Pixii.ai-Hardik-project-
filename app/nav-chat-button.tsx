'use client';

declare global {
  interface Window {
    __pixiiOpenChat?: () => void;
  }
}

export default function NavChatButton() {
  return (
    <div className="group relative flex flex-col items-center">
      {/* Nudge label above */}
      <span className="mb-1 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm">
        Best experience ✦
      </span>

      <button
        type="button"
        onClick={() => window.__pixiiOpenChat?.()}
        className="relative flex items-center gap-2.5 rounded-full bg-ink px-5 py-2.5 text-sm font-black text-white shadow-[0_0_0_3px_rgba(255,92,0,0.25),0_8px_24px_rgba(26,22,20,0.35)] transition hover:scale-[1.04] hover:shadow-[0_0_0_4px_rgba(255,92,0,0.4),0_12px_32px_rgba(26,22,20,0.4)] active:scale-[0.97]"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        Pixii Chat
        <span className="ml-0.5 text-white/50">→</span>
      </button>
    </div>
  );
}

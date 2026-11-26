import { LogoMark } from "@/components/brand/logo";
import { PreloaderController } from "@/components/brand/preloader-controller";

export const PRELOADER_SEEN_KEY = "fca-preloaded";

/*
 * Branded splash shown on the first page load of a visit, until the page is ready.
 * - Server-rendered, so it appears instantly before any JavaScript runs.
 * - Skipped for the rest of the browser session (sessionStorage), checked by an inline
 *   script before first paint so returning pages never flash it.
 * - Never traps anyone: if JavaScript fails, CSS fades it out after ~3 seconds.
 */
export function Preloader() {
  return (
    <>
      <script
        // Runs before paint: hide the splash if it was already shown in this session.
        dangerouslySetInnerHTML={{
          __html: `try{if(sessionStorage.getItem("${PRELOADER_SEEN_KEY}"))document.documentElement.classList.add("fca-skip-preload")}catch(e){}`,
        }}
      />
      <div id="fca-preloader" className="fca-preloader" role="status" aria-live="polite">
        <div className="fca-preloader-inner">
          <div className="fca-preloader-mark">
            <span className="fca-preloader-halo" aria-hidden="true" />
            <LogoMark className="h-20 sm:h-24" />
          </div>
          <p className="mt-6 text-2xl font-bold tracking-tight">FCA-AI</p>
          <p className="mt-1 text-sm text-fg-2">Study Smarter. Achieve More.</p>
          <div className="fca-preloader-bar mt-7" aria-hidden="true">
            <span />
          </div>
          <span className="sr-only">Loading FCA-AI…</span>
        </div>
      </div>
      <PreloaderController storageKey={PRELOADER_SEEN_KEY} />
    </>
  );
}

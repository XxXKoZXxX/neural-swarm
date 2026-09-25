import { useCallback, useEffect, useState } from "react";

/**
 * Install-to-home-screen support.
 *
 * Chromium fires `beforeinstallprompt`, which we swallow until the user asks
 * to install. iOS Safari has no such event, so we expose `isIosSafari` and let
 * the UI explain the Share → Add to Home Screen route instead.
 */
export default function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  });

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setPromptEvent(e);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return "unavailable";
    promptEvent.prompt();
    const { outcome } = (await promptEvent.userChoice) || {};
    setPromptEvent(null);
    return outcome || "dismissed";
  }, [promptEvent]);

  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isIosSafari = isIos && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

  return { canInstall: Boolean(promptEvent), install, installed, isIos, isIosSafari };
}

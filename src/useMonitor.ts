import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isDesktopRuntime, monitorApi } from "./api";
import { defaultConfig, type MonitorConfig, type Notice, type NoticeKind, type Sample } from "./domain";

export function useMonitor() {
  const [current, setCurrent] = useState<Sample | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const [config, setConfig] = useState<MonitorConfig>(defaultConfig);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((kind: NoticeKind, message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice({ id: Date.now(), kind, message });
    noticeTimer.current = window.setTimeout(() => setNotice(null), kind === "error" ? 5000 : 2800);
  }, []);

  const saveConfig = useCallback(async (nextConfig: MonitorConfig) => {
    try {
      await monitorApi.updateConfig(nextConfig);
      setConfig(nextConfig);
      showNotice("success", "Settings saved");
    } catch (cause) {
      const message = errorMessage(cause);
      showNotice("error", message);
      throw cause;
    }
  }, [showNotice]);

  const toggleMonitoring = useCallback(() => {
    if (!isDesktopRuntime) return;
    const wasRunning = runningRef.current;
    const enabled = !wasRunning;
    runningRef.current = enabled;
    setRunning(enabled);
    void monitorApi.setMonitoring(enabled).catch((cause) => {
      runningRef.current = wasRunning;
      setRunning(wasRunning);
      showNotice("error", errorMessage(cause));
    });
  }, [showNotice]);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime) return;

    let active = true;

    void Promise.all([monitorApi.getCurrent(), monitorApi.getHistory(500), monitorApi.getConfig()])
      .then(([latest, recent, savedConfig]) => {
        if (!active) return;
        setCurrent(latest);
        setHistory(recent);
        setConfig(savedConfig);
      })
      .catch((cause) => active && showNotice("error", errorMessage(cause)));
    void monitorApi.setMonitoring(true)
      .then(() => {
        if (!active) return;
        runningRef.current = true;
        setRunning(true);
      })
      .catch((cause) => active && showNotice("error", errorMessage(cause)));

    const sampleListener = listen<Sample>("sample", ({ payload }) => {
      if (!active) return;
      setCurrent(payload);
      void monitorApi.getHistory(500).then(setHistory).catch((cause) => showNotice("error", errorMessage(cause)));
    });
    const trayListener = listen("tray-toggle", toggleMonitoring);
    const errorListener = listen<string>("monitor-error", ({ payload }) => {
      if (active) showNotice("error", payload);
    });

    return () => {
      active = false;
      void sampleListener.then((unlisten) => unlisten());
      void trayListener.then((unlisten) => unlisten());
      void errorListener.then((unlisten) => unlisten());
    };
  }, [showNotice, toggleMonitoring]);

  return {
    config,
    current,
    history,
    notice,
    running,
    saveConfig,
    showNotice,
    toggleMonitoring,
  };
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

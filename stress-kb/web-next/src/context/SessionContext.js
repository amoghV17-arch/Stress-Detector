'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getSerialManager } from '@/lib/serial';
import { SessionRecorder } from '@/lib/sessionRecorder';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const serialManagerRef = useRef(null);
  if (!serialManagerRef.current && typeof window !== 'undefined') {
    serialManagerRef.current = getSerialManager();
  }

  // Connection State
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [connectionMessage, setConnectionMessage] = useState('Disconnected');
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [isSimulator, setIsSimulator] = useState(false);
  const [isSerialSupported, setIsSerialSupported] = useState(true);

  // Device Logs (for Device Log drawer)
  const [logs, setLogs] = useState([]);

  // Active Session State
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [activeRecorder, setActiveRecorder] = useState(null);
  const [progress, setProgress] = useState(null);
  const [lastCompletedSession, setLastCompletedSession] = useState(null);
  const [calBaselinePace, setCalBaselinePace] = useState({ chars: 0, durationS: 180 });

  // Add log helper
  const addLog = useCallback((text, type = 'sys') => {
    setLogs((prev) => {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        time: new Date().toLocaleTimeString(),
        text,
        type,
      };
      // Keep last 500 lines
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Subscribe to serial manager on mount
  useEffect(() => {
    const sm = getSerialManager();
    serialManagerRef.current = sm;

    setIsSerialSupported(sm.isSerialSupported);

    const unsubStatus = sm.subscribeStatus((state) => {
      setConnectionStatus(state.status);
      setConnectionMessage(state.message);
      setDeviceInfo(state.deviceInfo);
      setIsSimulator(state.isSimulator);
    });

    const unsubRx = sm.onLineReceived((line) => {
      const isWarn = line.startsWith('WARN');
      addLog(`<- ${line}`, isWarn ? 'warn' : 'rx');
    });

    const unsubTx = sm.onLineSent((line) => {
      addLog(`-> ${line}`, 'tx');
    });

    const unsubErr = sm.onError((err) => {
      addLog(`Error: ${err?.message || err}`, 'warn');
    });

    return () => {
      unsubStatus();
      unsubRx();
      unsubTx();
      unsubErr();
    };
  }, [addLog]);

  // Connection Actions
  const connect = useCallback(async (useSimulator = false) => {
    const sm = serialManagerRef.current || getSerialManager();
    try {
      await sm.connect(useSimulator);
      addLog(
        `System: Connected to ${useSimulator ? 'Software Emulator' : 'Hardware ESP32'}`,
        'sys'
      );
    } catch (err) {
      addLog(`System: Connection failed - ${err.message}`, 'warn');
      throw err;
    }
  }, [addLog]);

  const disconnect = useCallback(async () => {
    const sm = serialManagerRef.current || getSerialManager();
    await sm.disconnect();
    addLog('System: Disconnected', 'sys');
  }, [addLog]);

  const sendLine = useCallback(async (line) => {
    const sm = serialManagerRef.current || getSerialManager();
    await sm.sendLine(line);
  }, []);

  // Session Control Actions
  const startSession = useCallback((config) => {
    const sm = serialManagerRef.current || getSerialManager();

    const recorder = new SessionRecorder({
      ...config,
      serialManager: sm,
      calBaselinePace,
      onProgress: (prog) => {
        setProgress(prog);
      },
      onAlert: (alert) => {
        addLog(`Alert triggered at window ${alert.win_id} (t=${alert.t}ms)`, 'warn');
      },
      onWarning: (warn) => {
        addLog(`Warning: ${warn.code} ${warn.detail}`, 'warn');
      },
      onFinish: (sessionJSON) => {
        setLastCompletedSession(sessionJSON);
        setIsSessionActive(false);
        setActiveRecorder(null);

        // If CAL mode, record pace for pressure time calculations
        if (config.mode === 'CAL') {
          const pace = {
            chars: sessionJSON.task.total_chars,
            durationS: sessionJSON.task.elapsed_s || 180,
          };
          setCalBaselinePace(pace);
          addLog(
            `Protocol: Calibration pace recorded (${pace.chars} chars in ${pace.durationS}s). Pressure time will be scaled to 0.75x.`,
            'sys'
          );
        }
      },
    });

    setActiveRecorder(recorder);
    setIsSessionActive(true);
    recorder.start();
    addLog(`Session started: ${config.sessionId} (Mode: ${config.mode}, Condition: ${config.condition})`, 'sys');
    return recorder;
  }, [calBaselinePace, addLog]);

  const stopSession = useCallback((exportOptions = {}) => {
    if (activeRecorder) {
      const result = activeRecorder.stop(exportOptions);
      addLog('Session finished.', 'sys');
      return result;
    }
    return null;
  }, [activeRecorder, addLog]);

  const handleKeyDown = useCallback((event) => {
    if (activeRecorder) {
      activeRecorder.handleKeyDown(event);
    }
  }, [activeRecorder]);

  const handleKeyUp = useCallback((event) => {
    if (activeRecorder) {
      activeRecorder.handleKeyUp(event);
    }
  }, [activeRecorder]);

  const handleFocusChange = useCallback((gained) => {
    if (activeRecorder) {
      activeRecorder.handleFocusChange(gained);
    }
  }, [activeRecorder]);

  const value = {
    // Serial state
    connectionStatus,
    connectionMessage,
    deviceInfo,
    isSimulator,
    isSerialSupported,
    connect,
    disconnect,
    sendLine,

    // Device Logs
    logs,
    clearLogs,
    addLog,

    // Session State
    isSessionActive,
    activeRecorder,
    progress,
    lastCompletedSession,
    calBaselinePace,
    startSession,
    stopSession,
    handleKeyDown,
    handleKeyUp,
    handleFocusChange,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from './HardwareExplodedView.module.css';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const HARDWARE_PARTS = [
  {
    id: 'acrylic',
    num: '01',
    name: 'Laser-Cut Acrylic Faceplate',
    pinout: 'M3 Standoffs',
    desc: '3mm cast acrylic enclosure with laser-cut optical aperture directly above the BH1750 sensor, protecting circuitry while allowing ambient lux capture.',
    color: '#3B82F6',
    baseY: 210,
    explodedY: 45,
  },
  {
    id: 'oled',
    num: '02',
    name: '0.96" SSD1306 OLED Display',
    pinout: 'I2C 0x3C • GPIO21/22',
    desc: '128x64 monochrome OLED providing real-time hardware status: stress level bar, confidence score, link health, and 1Hz heartbeat tick.',
    color: '#10B981',
    baseY: 225,
    explodedY: 110,
  },
  {
    id: 'bh1750',
    num: '03',
    name: 'BH1750 Ambient Photometer',
    pinout: 'I2C 0x23 • 16-bit Lux',
    desc: 'Digital ambient light sensor measuring 1–65,535 lux. Controls for lighting conditions (circadian covariate) without camera or video monitoring.',
    color: '#F59E0B',
    baseY: 232,
    explodedY: 175,
  },
  {
    id: 'esp32',
    num: '04',
    name: 'ESP32-WROOM-32 AI Core',
    pinout: 'Xtensa Dual-Core 240MHz',
    desc: 'Hardware brain running on-device TinyML. Computes 1-pass Welford variance, z-score normalization, and 100-tree Random Forest inference in <1ms.',
    color: '#0F766E',
    baseY: 245,
    explodedY: 245,
  },
  {
    id: 'motor',
    num: '05',
    name: 'Haptic ERM Vibration Motor',
    pinout: 'GPIO25 • BC547 NPN Switch',
    desc: 'Coin vibration motor with flyback clamp diode and 100µF capacitor. Delivers tactile feedback pulses when sustained acute stress is detected.',
    color: '#EF4444',
    baseY: 255,
    explodedY: 315,
  },
  {
    id: 'carrier',
    num: '06',
    name: 'Carrier PCB & I2C Bus Plane',
    pinout: '3.3V / GND / SDA / SCL',
    desc: 'Common ground plane and 400kHz I2C bus wiring tying the sensor, OLED, and microcontroller together with minimal signal capacitance.',
    color: '#6366F1',
    baseY: 265,
    explodedY: 385,
  },
  {
    id: 'usbc',
    num: '07',
    name: 'USB-C Serial Isolation Bridge',
    pinout: '115200 Baud UART',
    desc: 'Zero-latency Web Serial bridge streaming key timing events (K-lines) and peripheral frames to the web application with zero character logging.',
    color: '#8B5CF6',
    baseY: 275,
    explodedY: 455,
  },
];

export function HardwareExplodedView() {
  const [progress, setProgress] = useState(0.2); // 0 = assembled, 1 = exploded
  const [activePartId, setActivePartId] = useState('esp32');
  const sectionRef = useRef(null);

  // ScrollTrigger integration: scrolling down disassembles, scrolling up resembles
  useEffect(() => {
    if (typeof window === 'undefined' || !sectionRef.current) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top 80%',
        end: 'bottom 20%',
        scrub: 0.8,
        onUpdate: (self) => {
          // Progress directly driven by scroll position
          setProgress(parseFloat(self.progress.toFixed(3)));
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleAssemble = () => {
    gsap.to({ val: progress }, {
      val: 0,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate: function () {
        setProgress(this.targets()[0].val);
      },
    });
  };

  const handleExplode = () => {
    gsap.to({ val: progress }, {
      val: 1,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate: function () {
        setProgress(this.targets()[0].val);
      },
    });
  };

  // Interpolate part Y position based on progress
  const getPartY = (part) => {
    return part.baseY + (part.explodedY - part.baseY) * progress;
  };

  const activePart = HARDWARE_PARTS.find((p) => p.id === activePartId) || HARDWARE_PARTS[3];

  return (
    <section className={styles.explodedSection} ref={sectionRef} id="hardware-architecture">
      <div className={styles.header}>
        <div className={styles.sectionTag}>Interactive Hardware Architecture</div>
        <h2 className={styles.title}>StressKB Hardware &bull; Exploded View</h2>
        <p className={styles.subtitle}>
          Scroll down to disassemble the edge instrument into its discrete physical subsystems;
          scroll up to reassemble. Click any component to inspect its pinout and firmware role.
        </p>
      </div>

      {/* Scrub & Control Bar */}
      <div className={styles.controlBar}>
        <span className={styles.sliderLabel}>Assembled (0%)</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          className={styles.scrubSlider}
          value={progress}
          onChange={(e) => setProgress(parseFloat(e.target.value))}
          aria-label="Disassembly progression slider"
        />
        <span className={styles.sliderLabel}>Exploded (100%)</span>

        <button
          className={`${styles.btnControl} ${progress < 0.15 ? styles.btnActive : ''}`}
          onClick={handleAssemble}
        >
          Assemble
        </button>
        <button
          className={`${styles.btnControl} ${progress > 0.85 ? styles.btnActive : ''}`}
          onClick={handleExplode}
        >
          Explode View
        </button>
      </div>

      {/* Interactive Stage */}
      <div className={styles.stageGrid}>
        {/* Left: SVG Exploded Diagram */}
        <div className={styles.svgContainer}>
          <svg
            className={styles.svgStage}
            viewBox="0 0 460 520"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <filter id="partGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.15" />
              </filter>
            </defs>

            {/* Connecting Standoff Axis Guide Lines (Fade in as exploded) */}
            {progress > 0.1 && (
              <g stroke="#9CA3AF" strokeWidth="1.2" strokeDasharray="3,3" opacity={Math.min(1, progress * 1.5)}>
                <line x1="70" y1={getPartY(HARDWARE_PARTS[0])} x2="70" y2={getPartY(HARDWARE_PARTS[6]) + 20} />
                <line x1="390" y1={getPartY(HARDWARE_PARTS[0])} x2="390" y2={getPartY(HARDWARE_PARTS[6]) + 20} />
                <line x1="160" y1={getPartY(HARDWARE_PARTS[1])} x2="160" y2={getPartY(HARDWARE_PARTS[5])} />
                <line x1="300" y1={getPartY(HARDWARE_PARTS[2])} x2="300" y2={getPartY(HARDWARE_PARTS[5])} />
              </g>
            )}

            {/* 07: USB-C Base Bridge (Bottom) */}
            <g
              transform={`translate(0, ${getPartY(HARDWARE_PARTS[6]) - 275})`}
              onClick={() => setActivePartId('usbc')}
              style={{ cursor: 'pointer' }}
              filter="url(#partGlow)"
            >
              <rect x="170" y="270" width="120" height="26" rx="5" fill="#374151" stroke={activePartId === 'usbc' ? '#8B5CF6' : '#1F2937'} strokeWidth={activePartId === 'usbc' ? 2 : 1} />
              <rect x="200" y="276" width="60" height="14" rx="3" fill="#D1D5DB" />
              <text x="230" y="287" textAnchor="middle" fill="#111827" fontSize="8" fontFamily="monospace" fontWeight="bold">USB-C UART</text>
            </g>

            {/* 06: Carrier Breadboard & Bus Plane */}
            <g
              transform={`translate(0, ${getPartY(HARDWARE_PARTS[5]) - 265})`}
              onClick={() => setActivePartId('carrier')}
              style={{ cursor: 'pointer' }}
              filter="url(#partGlow)"
            >
              <rect x="50" y="250" width="360" height="42" rx="4" fill="#F3F4F6" stroke={activePartId === 'carrier' ? '#6366F1' : '#D1D5DB'} strokeWidth={activePartId === 'carrier' ? 2.5 : 1.2} />
              {/* Bus trace lines */}
              <line x1="70" y1="262" x2="390" y2="262" stroke="#EF4444" strokeWidth="1" />
              <line x1="70" y1="268" x2="390" y2="268" stroke="#10B981" strokeWidth="1" />
              <line x1="70" y1="274" x2="390" y2="274" stroke="#3B82F6" strokeWidth="1" />
              <line x1="70" y1="280" x2="390" y2="280" stroke="#1F2937" strokeWidth="1" />
              <text x="75" y="259" fill="#6B7280" fontSize="7" fontFamily="monospace">3V3 • SDA • SCL • GND</text>
            </g>

            {/* 05: Haptic ERM Vibration Motor */}
            <g
              transform={`translate(0, ${getPartY(HARDWARE_PARTS[4]) - 255})`}
              onClick={() => setActivePartId('motor')}
              style={{ cursor: 'pointer' }}
              filter="url(#partGlow)"
            >
              <circle cx="340" cy="255" r="16" fill="#D1D5DB" stroke={activePartId === 'motor' ? '#EF4444' : '#6B7280'} strokeWidth={activePartId === 'motor' ? 2.5 : 1.5} />
              <circle cx="340" cy="255" r="9" fill="#9CA3AF" />
              <path d="M 330 255 Q 340 245 350 255" stroke="#374151" strokeWidth="1.5" fill="none" />
              <text x="340" y="279" textAnchor="middle" fill="#4B5563" fontSize="8" fontFamily="monospace">ERM 10mm</text>
            </g>

            {/* 04: ESP32-WROOM-32 Core */}
            <g
              transform={`translate(0, ${getPartY(HARDWARE_PARTS[3]) - 245})`}
              onClick={() => setActivePartId('esp32')}
              style={{ cursor: 'pointer' }}
              filter="url(#partGlow)"
            >
              <rect x="130" y="220" width="200" height="52" rx="4" fill="#1E293B" stroke={activePartId === 'esp32' ? '#0F766E' : '#334155'} strokeWidth={activePartId === 'esp32' ? 2.5 : 1.2} />
              <rect x="145" y="226" width="70" height="38" rx="2" fill="#94A3B8" />
              <text x="180" y="247" textAnchor="middle" fill="#0F172A" fontSize="9" fontFamily="monospace" fontWeight="bold">ESP32</text>
              <text x="180" y="257" textAnchor="middle" fill="#334155" fontSize="7" fontFamily="monospace">TinyML RF</text>
              {/* Gold Chip Antenna */}
              <rect x="290" y="226" width="30" height="38" fill="#F59E0B" rx="1" />
            </g>

            {/* 03: BH1750 Ambient Light Photometer */}
            <g
              transform={`translate(0, ${getPartY(HARDWARE_PARTS[2]) - 232})`}
              onClick={() => setActivePartId('bh1750')}
              style={{ cursor: 'pointer' }}
              filter="url(#partGlow)"
            >
              <rect x="290" y="215" width="54" height="32" rx="3" fill="#1E40AF" stroke={activePartId === 'bh1750' ? '#F59E0B' : '#1D4ED8'} strokeWidth={activePartId === 'bh1750' ? 2.5 : 1} />
              <circle cx="317" cy="231" r="5" fill="#FEF08A" stroke="#CA8A04" strokeWidth="1" />
              <text x="317" y="243" textAnchor="middle" fill="#DBEAFE" fontSize="7" fontFamily="monospace">BH1750</text>
            </g>

            {/* 02: 0.96" SSD1306 Monochrome OLED */}
            <g
              transform={`translate(0, ${getPartY(HARDWARE_PARTS[1]) - 225})`}
              onClick={() => setActivePartId('oled')}
              style={{ cursor: 'pointer' }}
              filter="url(#partGlow)"
            >
              <rect x="110" y="195" width="130" height="60" rx="3" fill="#0F172A" stroke={activePartId === 'oled' ? '#10B981' : '#1E293B'} strokeWidth={activePartId === 'oled' ? 2.5 : 1.2} />
              {/* OLED active screen display */}
              <rect x="120" y="205" width="110" height="40" rx="1" fill="#000000" stroke="#374151" strokeWidth="0.8" />
              <text x="125" y="218" fill="#10B981" fontSize="7" fontFamily="monospace">STRESS: [|||... ]</text>
              <text x="125" y="228" fill="#10B981" fontSize="7" fontFamily="monospace">CONF: 84% • LINK OK</text>
              <text x="125" y="238" fill="#10B981" fontSize="7" fontFamily="monospace">128x64 SSD1306</text>
            </g>

            {/* 01: Acrylic Top Enclosure (Smoked Translucent) */}
            <g
              transform={`translate(0, ${getPartY(HARDWARE_PARTS[0]) - 210})`}
              onClick={() => setActivePartId('acrylic')}
              style={{ cursor: 'pointer' }}
              filter="url(#partGlow)"
            >
              <rect x="40" y="170" width="380" height="80" rx="6" fill="rgba(31, 41, 55, 0.45)" stroke={activePartId === 'acrylic' ? '#3B82F6' : 'rgba(75, 85, 99, 0.8)'} strokeWidth={activePartId === 'acrylic' ? 2.5 : 1.5} />
              {/* Optical photometer window */}
              <circle cx="317" cy="210" r="10" fill="rgba(255, 255, 255, 0.7)" stroke="#3B82F6" strokeWidth="1" />
              {/* OLED viewport cut */}
              <rect x="105" y="185" width="140" height="50" rx="2" fill="none" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="1" strokeDasharray="2,2" />
              {/* M3 Screw holes */}
              <circle cx="55" cy="182" r="3.5" fill="#E5E7EB" stroke="#4B5563" strokeWidth="1" />
              <circle cx="405" cy="182" r="3.5" fill="#E5E7EB" stroke="#4B5563" strokeWidth="1" />
              <circle cx="55" cy="238" r="3.5" fill="#E5E7EB" stroke="#4B5563" strokeWidth="1" />
              <circle cx="405" cy="238" r="3.5" fill="#E5E7EB" stroke="#4B5563" strokeWidth="1" />
              <text x="48" y="215" fill="#F3F4F6" fontSize="8" fontFamily="monospace">M3 TOP PLATE</text>
            </g>
          </svg>
        </div>

        {/* Right: Technical Part Callouts */}
        <div className={styles.partsList}>
          {HARDWARE_PARTS.map((part) => {
            const isActive = part.id === activePartId;
            return (
              <div
                key={part.id}
                className={`${styles.partCard} ${isActive ? styles.partCardActive : ''}`}
                onClick={() => setActivePartId(part.id)}
              >
                <div className={styles.partHeader}>
                  <span className={styles.partNumber}>PART {part.num}</span>
                  <span className={styles.partPinout}>{part.pinout}</span>
                </div>
                <div className={styles.partName}>{part.name}</div>
                <div className={styles.partDesc}>{part.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.statusCaption}>
        Focused Component: <strong>{activePart.name}</strong> ({activePart.pinout})
      </div>
    </section>
  );
}

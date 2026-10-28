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
    id: 'laptop',
    num: '00',
    name: 'Participant Workstation (Laptop)',
    pinout: 'USB Host • Study Browser',
    desc: 'The host laptop running the zero-knowledge typing session in Chrome/Edge. Keystroke timing is streamed over Web Serial with zero character logging.',
    color: '#64748B',
  },
  {
    id: 'clip',
    num: '01',
    name: 'Clip-On Monitor Bar Mount',
    pinout: 'Top Bezel Clamp',
    desc: 'Custom monitor clip resting securely on the laptop screen bezel, holding the OLED display front and center while elevating the light sensor above obstacles.',
    color: '#0284C7',
  },
  {
    id: 'oled',
    num: '02',
    name: '0.96" SSD1306 OLED Display',
    pinout: 'I2C 0x3C • GPIO21/22',
    desc: 'Front-facing 128×64 monochrome OLED providing real-time hardware status: "StressKB Ready", confidence scores, stress level bars, and heartbeat tick.',
    color: '#10B981',
  },
  {
    id: 'bh1750',
    num: '03',
    name: 'BH1750 Ambient Light Sensor',
    pinout: 'I2C 0x23 • 16-bit Lux',
    desc: 'Mounted on the very top of the monitor clip (unobstructed) to measure ambient room photometry (1–65,535 lux), controlling for lighting variations without cameras.',
    color: '#F59E0B',
  },
  {
    id: 'esp32',
    num: '04',
    name: 'ESP32-WROOM-32 AI Core',
    pinout: 'Xtensa Dual-Core 240MHz',
    desc: 'Mounted directly behind the clip. Computes 1-pass Welford online variance, baseline z-scoring, and 100-tree TinyML Random Forest inference in <1ms.',
    color: '#0F766E',
  },
  {
    id: 'motor',
    num: '05',
    name: 'Haptic ERM Vibration Motor & Driver',
    pinout: 'GPIO25 • BC547 Transistor',
    desc: '10mm coin motor with flyback diode and 100µF capacitor in the housing base, pulsing tactile alerts when sustained cognitive stress is detected.',
    color: '#EF4444',
  },
  {
    id: 'wiring',
    num: '06',
    name: 'I2C Bus & Jumper Wire Harness',
    pinout: '3.3V / GND / SDA / SCL',
    desc: 'Color-coded jumper wire harness routing power (3.3V red), ground (black), and shared 400kHz I2C data lines (SDA yellow, SCL blue) between all modules.',
    color: '#3B82F6',
  },
  {
    id: 'usbc',
    num: '07',
    name: 'USB Serial Cable to Laptop',
    pinout: '115200 Baud Hardware UART',
    desc: 'High-speed hardware serial cable carrying timing events (K-lines) and telemetry from the ESP32 to the browser with complete electrical isolation.',
    color: '#8B5CF6',
  },
];

export function HardwareExplodedView() {
  const [progress, setProgress] = useState(0.25); // 0 = assembled on laptop, 1 = exploded
  const [activePartId, setActivePartId] = useState('esp32');
  const sectionRef = useRef(null);
  const cardRefs = useRef({});

  // GSAP ScrollTrigger with PINNING: keeps section pinned on spot while scrolling down
  useEffect(() => {
    if (typeof window === 'undefined' || !sectionRef.current) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top 56px', // Pins neatly below sticky navbar
        end: '+=1400',     // 1400px of comfortable on-spot scroll distance
        pin: true,
        pinSpacing: true,
        scrub: 0.6,
        anticipatePin: 1,
        onUpdate: (self) => {
          const p = parseFloat(self.progress.toFixed(3));
          setProgress(p);

          // Contextual active card highlight based on current disassembly phase
          if (p < 0.18) {
            setActivePartId('clip');
          } else if (p < 0.38) {
            setActivePartId('oled');
          } else if (p < 0.58) {
            setActivePartId('bh1750');
          } else if (p < 0.78) {
            setActivePartId('esp32');
          } else {
            setActivePartId('motor');
          }
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  // Auto-scroll active card into view in side list
  useEffect(() => {
    if (cardRefs.current[activePartId]) {
      cardRefs.current[activePartId].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activePartId]);

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

  // Interpolated Coordinates inside viewBox="0 0 760 560"
  // 1. Clip Frame: Rests on top bezel of laptop screen at Y = 188
  const clipX = 380;
  const clipY = 188 - 22 * progress;

  // 2. OLED Display: Slides forward/left
  const oledX = 380 - 160 * progress;
  const oledY = 168 - 62 * progress;

  // 3. BH1750 Light Sensor: Floats straight up above the clip
  const bhX = 380;
  const bhY = 125 - 80 * progress; // At p=1: Y=45 (well within top margin!)

  // 4. ESP32 Microcontroller: Moves back/right
  const espX = 380 + 160 * progress;
  const espY = 168 - 58 * progress;

  // 5. Motor Driver & Vibration Coin: Moves down/right onto side
  const motX = 380 + 175 * progress;
  const motY = 190 + 35 * progress;

  // Laptop USB Port on Left side
  const laptopUsbX = 162;
  const laptopUsbY = 415;

  // ESP32 USB Port location
  const espUsbX = espX - 58;
  const espUsbY = espY + 10;

  const activePart = HARDWARE_PARTS.find((p) => p.id === activePartId) || HARDWARE_PARTS[4];

  return (
    <section className={styles.explodedSection} ref={sectionRef} id="hardware-architecture">
      <div className={styles.header}>
        <div className={styles.sectionTag}>Interactive Hardware Architecture</div>
        <h2 className={styles.title}>StressKB Hardware &bull; Exploded Connections</h2>
        <p className={styles.subtitle}>
          Scroll down on the spot to disassemble the clip-on monitor hardware and trace every connection to the laptop;
          scroll up to reassemble.
        </p>
        <div className={styles.scrollHint}>
          <span>&#8597;</span>
          <span>Scroll mousewheel / trackpad to disassemble &bull; Locks on spot</span>
        </div>
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
        <span className={styles.sliderLabel}>Disassembled (100%)</span>

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
        {/* Left: Interactive SVG Diagram */}
        <div className={styles.svgContainer}>
          <svg
            className={styles.svgStage}
            viewBox="0 0 760 560"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <filter id="shadowFilter" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.12" />
              </filter>
              <filter id="glowHighlight" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#0284C7" floodOpacity="0.6" />
              </filter>
              <linearGradient id="laptopLid" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1E293B" />
                <stop offset="100%" stopColor="#0F172A" />
              </linearGradient>
              <linearGradient id="laptopBase" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="100%" stopColor="#1E293B" />
              </linearGradient>
              <linearGradient id="screenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#F8FAFC" />
                <stop offset="100%" stopColor="#EEF2F6" />
              </linearGradient>
            </defs>

            {/* ==================================================== */}
            {/* 1. LAPTOP WORKSTATION (BASE & KEYBOARD)             */}
            {/* ==================================================== */}
            <g id="laptop-anchor" onClick={() => setActivePartId('laptop')} style={{ cursor: 'pointer' }}>
              {/* Laptop Base Body */}
              <polygon
                points="180,380 580,380 640,520 120,520"
                fill="url(#laptopBase)"
                stroke="#475569"
                strokeWidth="1.5"
                filter="url(#shadowFilter)"
              />

              {/* Keyboard Well */}
              <polygon
                points="198,388 562,388 605,462 155,462"
                fill="#0F172A"
                stroke="#334155"
                strokeWidth="1"
              />

              {/* Key Rows (Stylized Keyboard Deck) */}
              {[...Array(14)].map((_, i) => (
                <rect key={`k1-${i}`} x={205 + i * 25} y="392" width="21" height="11" rx="2" fill="#1E293B" />
              ))}
              {[...Array(13)].map((_, i) => (
                <rect key={`k2-${i}`} x={202 + i * 27.5} y="407" width="23" height="12" rx="2" fill="#1E293B" />
              ))}
              {[...Array(13)].map((_, i) => (
                <rect key={`k3-${i}`} x={198 + i * 28.5} y="423" width="24" height="13" rx="2" fill="#1E293B" />
              ))}
              {/* Spacebar Row */}
              <rect x="180" y="441" width="36" height="15" rx="2" fill="#1E293B" />
              <rect x="222" y="441" width="36" height="15" rx="2" fill="#1E293B" />
              <rect x="264" y="441" width="210" height="15" rx="3" fill="#334155" stroke="#475569" strokeWidth="0.8" />
              <rect x="480" y="441" width="36" height="15" rx="2" fill="#1E293B" />
              <rect x="522" y="441" width="36" height="15" rx="2" fill="#1E293B" />

              {/* Trackpad */}
              <rect
                x="320"
                y="472"
                width="120"
                height="40"
                rx="4"
                fill="#1E293B"
                stroke="#475569"
                strokeWidth="1"
              />

              {/* USB Port on Left Chassis */}
              <rect
                x="148"
                y="410"
                width="16"
                height="8"
                rx="2"
                fill="#0F172A"
                stroke={activePartId === 'usbc' ? '#8B5CF6' : '#64748B'}
                strokeWidth={activePartId === 'usbc' ? 2 : 1}
              />
              <text x="138" y="406" fill="#94A3B8" fontSize="8" fontFamily="monospace" textAnchor="end">USB HOST</text>

              {/* Laptop Screen Frame (Lid Bezel) */}
              <rect
                x="190"
                y="188"
                width="380"
                height="195"
                rx="8"
                fill="url(#laptopLid)"
                stroke="#334155"
                strokeWidth="2"
              />

              {/* Screen Glass Inner Area */}
              <rect
                x="204"
                y="200"
                width="352"
                height="172"
                rx="4"
                fill="url(#screenGrad)"
                stroke="#CBD5E1"
                strokeWidth="1"
              />

              {/* Laptop Web App Header Bar */}
              <rect x="204" y="200" width="352" height="18" fill="#F1F5F9" />
              <circle cx="214" cy="209" r="3" fill="#EF4444" />
              <circle cx="222" cy="209" r="3" fill="#F59E0B" />
              <circle cx="230" cy="209" r="3" fill="#10B981" />
              <text x="380" y="212" textAnchor="middle" fill="#64748B" fontSize="9" fontFamily="sans-serif">
                StressKB &bull; Keystroke Biometrics
              </text>

              {/* App UI on Screen matching Reference Image 4 */}
              <text x="380" y="248" textAnchor="middle" fill="#0F172A" fontSize="15" fontWeight="bold" fontFamily="sans-serif">
                StressKB
              </text>
              <text x="380" y="264" textAnchor="middle" fill="#64748B" fontSize="10.5" fontFamily="sans-serif">
                Typing Task &bull; Zero-Knowledge Mode
              </text>

              {/* Typing Paragraph Box */}
              <rect x="230" y="278" width="300" height="48" rx="4" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
              <text x="242" y="295" fill="#334155" fontSize="10" fontFamily="serif">
                The quick brown fox jumps over the lazy dog...
              </text>
              <line x1="242" y1="298" x2="250" y2="298" stroke="#0F172A" strokeWidth="1.5" />
              <text x="242" y="313" fill="#94A3B8" fontSize="8.5" fontFamily="serif">
                lantern light reflected off wet planks as dockworkers secured mooring lines...
              </text>

              {/* Start Button */}
              <rect x="355" y="334" width="50" height="18" rx="4" fill="#2563EB" />
              <text x="380" y="347" textAnchor="middle" fill="#FFFFFF" fontSize="8.5" fontWeight="bold" fontFamily="sans-serif">
                Start
              </text>

              {/* Top Bezel Webcam Notch / Mounting Anchor */}
              <circle cx="380" cy="194" r="3" fill="#0F172A" stroke="#475569" strokeWidth="1" />
            </g>

            {/* ==================================================== */}
            {/* 2. DYNAMIC WIRING CONNECTIONS (DISASSEMBLE/REASSEMBLE) */}
            {/* ==================================================== */}
            <g id="wire-harness" opacity={progress > 0.05 ? 1 : 0.85}>
              {/* (A) USB SERIAL CABLE: Laptop USB (148, 414) -> ESP32 Port (espUsbX, espUsbY) */}
              <path
                d={`M ${laptopUsbX} ${laptopUsbY} C ${laptopUsbX - 25 - 25 * progress} ${laptopUsbY - 90}, ${espUsbX - 35 * progress} ${espUsbY + 70 * progress}, ${espUsbX} ${espUsbY}`}
                fill="none"
                stroke={activePartId === 'usbc' ? '#8B5CF6' : '#1E293B'}
                strokeWidth={activePartId === 'usbc' ? 3.5 : 2.5}
                strokeLinecap="round"
                filter={activePartId === 'usbc' ? 'url(#glowHighlight)' : 'none'}
              />
              {/* Cable Tag */}
              {progress > 0.35 && (
                <g transform={`translate(${(laptopUsbX + espUsbX) / 2 - 58}, ${(laptopUsbY + espUsbY) / 2 + 15})`}>
                  <rect x="0" y="0" width="126" height="17" rx="4" fill="#1E293B" opacity="0.9" />
                  <text x="63" y="12" textAnchor="middle" fill="#E2E8F0" fontSize="7.5" fontFamily="monospace">
                    USB UART (115200 Baud)
                  </text>
                </g>
              )}

              {/* (B) I2C SDA WIRE (Yellow): ESP32 GPIO21 -> OLED SDA & BH1750 SDA */}
              <path
                d={`M ${espX - 25} ${espY + 26} C ${espX - 60} ${espY + 45}, ${oledX + 60} ${oledY + 50}, ${oledX + 35} ${oledY + 45}`}
                fill="none"
                stroke="#EAB308"
                strokeWidth={activePartId === 'wiring' || activePartId === 'oled' ? 2.5 : 1.5}
                strokeDasharray={progress > 0.6 ? '4,2' : 'none'}
              />
              <path
                d={`M ${espX - 25} ${espY + 26} C ${espX - 80} ${espY - 20}, ${bhX + 30} ${bhY + 55}, ${bhX + 12} ${bhY + 32}`}
                fill="none"
                stroke="#EAB308"
                strokeWidth={activePartId === 'wiring' || activePartId === 'bh1750' ? 2.5 : 1.5}
              />

              {/* (C) I2C SCL WIRE (Cyan/Blue): ESP32 GPIO22 -> OLED SCL & BH1750 SCL */}
              <path
                d={`M ${espX - 15} ${espY + 26} C ${espX - 55} ${espY + 40}, ${oledX + 50} ${oledY + 46}, ${oledX + 25} ${oledY + 45}`}
                fill="none"
                stroke="#38BDF8"
                strokeWidth={activePartId === 'wiring' || activePartId === 'oled' ? 2.5 : 1.5}
                strokeDasharray={progress > 0.6 ? '4,2' : 'none'}
              />
              <path
                d={`M ${espX - 15} ${espY + 26} C ${espX - 70} ${espY - 15}, ${bhX + 20} ${bhY + 45}, ${bhX + 4} ${bhY + 32}`}
                fill="none"
                stroke="#38BDF8"
                strokeWidth={activePartId === 'wiring' || activePartId === 'bh1750' ? 2.5 : 1.5}
              />

              {/* (D) 3.3V POWER WIRE (Red): ESP32 3V3 -> All Modules */}
              <path
                d={`M ${espX - 45} ${espY + 26} C ${espX - 70} ${espY + 35}, ${oledX + 40} ${oledY + 40}, ${oledX + 15} ${oledY + 45}`}
                fill="none"
                stroke="#EF4444"
                strokeWidth={activePartId === 'wiring' ? 2.5 : 1.5}
              />
              <path
                d={`M ${espX - 45} ${espY + 26} C ${espX - 90} ${espY - 30}, ${bhX + 10} ${bhY + 35}, ${bhX - 10} ${bhY + 32}`}
                fill="none"
                stroke="#EF4444"
                strokeWidth={activePartId === 'wiring' || activePartId === 'bh1750' ? 2.5 : 1.5}
              />

              {/* (E) MOTOR DRIVE WIRE (Green): ESP32 GPIO25 -> Transistor Driver */}
              <path
                d={`M ${espX + 15} ${espY + 26} C ${espX + 30} ${espY + 50}, ${motX - 40} ${motY - 10}, ${motX - 15} ${motY + 12}`}
                fill="none"
                stroke="#10B981"
                strokeWidth={activePartId === 'motor' ? 2.5 : 1.5}
              />
            </g>

            {/* ==================================================== */}
            {/* 3. PART 01: MONITOR BEZEL CLIP-ON ENCLOSURE          */}
            {/* ==================================================== */}
            <g
              id="part-clip"
              transform={`translate(0, ${clipY - 188})`}
              onClick={() => setActivePartId('clip')}
              style={{ cursor: 'pointer' }}
              filter={activePartId === 'clip' ? 'url(#glowHighlight)' : 'none'}
            >
              {/* Clip Housing Gripping the Laptop Top Bezel */}
              <rect x="325" y="176" width="110" height="24" rx="4" fill="#0F172A" stroke="#334155" strokeWidth="1.5" />
              {/* Front lip clamping down screen */}
              <path d="M 335,200 L 345,210 L 415,210 L 425,200 Z" fill="#1E293B" stroke="#0F172A" strokeWidth="1" />
              {/* Label */}
              <text x="380" y="191" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                MONITOR BAR CLIP
              </text>
            </g>

            {/* ==================================================== */}
            {/* 4. PART 02: 0.96" OLED DISPLAY (128x64 SSD1306)      */}
            {/* ==================================================== */}
            <g
              id="part-oled"
              transform={`translate(${oledX - 380}, ${oledY - 168})`}
              onClick={() => setActivePartId('oled')}
              style={{ cursor: 'pointer' }}
              filter={activePartId === 'oled' ? 'url(#glowHighlight)' : 'url(#shadowFilter)'}
            >
              {/* Outer Enclosure Frame */}
              <rect x="320" y="142" width="120" height="56" rx="4" fill="#0F172A" stroke={activePartId === 'oled' ? '#10B981' : '#334155'} strokeWidth={activePartId === 'oled' ? 2.5 : 1.5} />
              {/* OLED Screen Area (Glowing Blue/Cyan) */}
              <rect x="328" y="149" width="104" height="42" rx="2" fill="#030712" stroke="#1F2937" strokeWidth="1" />
              {/* Glowing Pixel Display Text matching Image 4 ("StressKB Ready") */}
              <text x="380" y="165" textAnchor="middle" fill="#38BDF8" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                StressKB
              </text>
              <text x="380" y="176" textAnchor="middle" fill="#38BDF8" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                Ready
              </text>
              <text x="380" y="186" textAnchor="middle" fill="#10B981" fontSize="6.5" fontFamily="monospace">
                [||||......] CAL:OK
              </text>

              {/* Pin Header at bottom of OLED */}
              <g transform="translate(350, 198)">
                <rect x="0" y="0" width="60" height="5" fill="#F59E0B" />
                <circle cx="6" cy="2.5" r="1.5" fill="#1E293B" />
                <circle cx="22" cy="2.5" r="1.5" fill="#1E293B" />
                <circle cx="38" cy="2.5" r="1.5" fill="#1E293B" />
                <circle cx="54" cy="2.5" r="1.5" fill="#1E293B" />
              </g>
              {progress > 0.25 && (
                <text x="380" y="136" textAnchor="middle" fill="#10B981" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                  OLED (128x64 I2C)
                </text>
              )}
            </g>

            {/* ==================================================== */}
            {/* 5. PART 03: BH1750 AMBIENT LIGHT SENSOR              */}
            {/* ==================================================== */}
            <g
              id="part-bh1750"
              transform={`translate(${bhX - 380}, ${bhY - 125})`}
              onClick={() => setActivePartId('bh1750')}
              style={{ cursor: 'pointer' }}
              filter={activePartId === 'bh1750' ? 'url(#glowHighlight)' : 'url(#shadowFilter)'}
            >
              {/* Blue GY-302 Breakout PCB */}
              <rect x="358" y="106" width="44" height="34" rx="3" fill="#1E40AF" stroke={activePartId === 'bh1750' ? '#F59E0B' : '#3B82F6'} strokeWidth={activePartId === 'bh1750' ? 2.5 : 1.2} />
              {/* Photodiode Sensor Chip (Yellow Optical Window) */}
              <circle cx="380" cy="120" r="5" fill="#FEF08A" stroke="#CA8A04" strokeWidth="1.2" />
              <circle cx="380" cy="120" r="2" fill="#713F12" />
              <text x="380" y="134" textAnchor="middle" fill="#DBEAFE" fontSize="6.5" fontFamily="monospace" fontWeight="bold">
                BH1750
              </text>
              {/* 5 Pin Solder Header on bottom */}
              <g transform="translate(363, 140)">
                {[...Array(5)].map((_, i) => (
                  <circle key={`pin-${i}`} cx={i * 8.5} cy="0" r="1.6" fill="#F59E0B" />
                ))}
              </g>
              {progress > 0.2 && (
                <text x="380" y="98" textAnchor="middle" fill="#F59E0B" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                  BH1750 LIGHT SENSOR
                </text>
              )}
            </g>

            {/* ==================================================== */}
            {/* 6. PART 04: ESP32-WROOM-32 MICROCONTROLLER            */}
            {/* ==================================================== */}
            <g
              id="part-esp32"
              transform={`translate(${espX - 380}, ${espY - 168})`}
              onClick={() => setActivePartId('esp32')}
              style={{ cursor: 'pointer' }}
              filter={activePartId === 'esp32' ? 'url(#glowHighlight)' : 'url(#shadowFilter)'}
            >
              {/* ESP32 Black Carrier PCB */}
              <rect x="315" y="142" width="130" height="54" rx="4" fill="#0F172A" stroke={activePartId === 'esp32' ? '#0F766E' : '#334155'} strokeWidth={activePartId === 'esp32' ? 2.5 : 1.5} />
              {/* Silver RF Metal Shield */}
              <rect x="328" y="148" width="58" height="42" rx="2" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1" />
              <text x="357" y="167" textAnchor="middle" fill="#0F172A" fontSize="7" fontWeight="bold" fontFamily="monospace">
                ESP32
              </text>
              <text x="357" y="177" textAnchor="middle" fill="#334155" fontSize="6" fontFamily="monospace">
                TinyML Core
              </text>
              {/* Micro-USB Port on side */}
              <rect x="315" y="161" width="9" height="15" rx="1.5" fill="#64748B" stroke="#475569" strokeWidth="1" />
              {/* Gold PCB Antenna Trace */}
              <rect x="396" y="148" width="20" height="42" rx="1" fill="#F59E0B" stroke="#D97706" strokeWidth="0.8" />
              <path d="M 400,152 H 412 V 157 H 400 V 162 H 412 V 167 H 400 V 172 H 412" fill="none" stroke="#78350F" strokeWidth="1" />
              {/* Status LEDs */}
              <circle cx="391" cy="154" r="1.8" fill="#EF4444" />
              <circle cx="391" cy="162" r="1.8" fill="#3B82F6" />

              {/* Pin Headers Top and Bottom */}
              <g transform="translate(328, 138)">
                {[...Array(12)].map((_, i) => (
                  <rect key={`esp-t-${i}`} x={i * 8} y="0" width="3.5" height="4" fill="#E2E8F0" />
                ))}
              </g>
              <g transform="translate(328, 196)">
                {[...Array(12)].map((_, i) => (
                  <rect key={`esp-b-${i}`} x={i * 8} y="0" width="3.5" height="4" fill="#E2E8F0" />
                ))}
              </g>
              {progress > 0.25 && (
                <text x="380" y="132" textAnchor="middle" fill="#0F766E" fontSize="8.5" fontFamily="monospace" fontWeight="bold">
                  ESP32 (BEHIND DISPLAY)
                </text>
              )}
            </g>

            {/* ==================================================== */}
            {/* 7. PART 05: HAPTIC VIBRATION MOTOR & DRIVER          */}
            {/* ==================================================== */}
            <g
              id="part-motor"
              transform={`translate(${motX - 380}, ${motY - 190})`}
              onClick={() => setActivePartId('motor')}
              style={{ cursor: 'pointer' }}
              filter={activePartId === 'motor' ? 'url(#glowHighlight)' : 'url(#shadowFilter)'}
            >
              {/* Transistor / Prototyping PCB Driver Board */}
              <rect x="342" y="178" width="34" height="28" rx="2" fill="#047857" stroke="#065F46" strokeWidth="1" />
              {/* BC547 Transistor */}
              <rect x="350" y="184" width="11" height="9" rx="1" fill="#1F2937" />
              <circle cx="355" cy="188" r="1.8" fill="#D1D5DB" />
              <text x="359" y="201" textAnchor="middle" fill="#A7F3D0" fontSize="5" fontFamily="monospace">BC547</text>

              {/* 10mm Silver Coin Vibration Motor */}
              <circle cx="392" cy="192" r="13" fill="#E2E8F0" stroke={activePartId === 'motor' ? '#EF4444' : '#64748B'} strokeWidth={activePartId === 'motor' ? 2 : 1.2} />
              <circle cx="392" cy="192" r="7" fill="#CBD5E1" />
              <circle cx="392" cy="192" r="2.5" fill="#94A3B8" />
              {/* Vibration arcs */}
              {progress > 0.3 && (
                <path d="M 408,186 A 10,10 0 0,1 408,198" fill="none" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
              )}
              {progress > 0.25 && (
                <text x="380" y="218" textAnchor="middle" fill="#EF4444" fontSize="8" fontFamily="monospace" fontWeight="bold">
                  ERM MOTOR (BASE)
                </text>
              )}
            </g>
          </svg>
        </div>

        {/* Right: Technical Part Cards List (Matches Reference Images) */}
        <div className={styles.partsList}>
          {HARDWARE_PARTS.map((part) => {
            const isActive = part.id === activePartId;
            return (
              <div
                key={part.id}
                ref={(el) => (cardRefs.current[part.id] = el)}
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
        Active Inspection: <strong>{activePart.name}</strong> &bull; {activePart.pinout}
      </div>
    </section>
  );
}

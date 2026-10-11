# PROTOCOL.md — serial protocol v1 (source of truth)

Transport: USB serial, 115200 baud, 8N1. ASCII lines ending in `\n`, comma-separated fields, max 160 chars per line.
The ESP32 must call `Serial.setRxBufferSize(2048)` BEFORE `Serial.begin()`.

Timing rules
- All `t` values are integer milliseconds.
- K / F / T / R times come from the LAPTOP clock (performance.now() rebased so t = 0 at `S,START`).
- LUX times come from the ESP32 clock, rebased to 0 at `S,START`.
- The ESP32 computes features from EVENT timestamps, never from the time a line arrives.

## Handshake
- ESP32 prints `READY,<fw_ver>,1` at boot.
- Laptop sends `HELLO,1` every 500 ms (max 5 s) until it sees READY. Opening the port often resets the ESP32.
- Malformed or unknown lines produce `WARN,MALFORMED` / `WARN,UNKNOWN_CMD`. Never crash, never hang.

## Laptop -> ESP32
| Line | Meaning |
|---|---|
| `HELLO,1` | handshake |
| `S,START,<session_id>,<user_id>,<mode>` | mode = `CAL`, `RUN` or `REPLAY`. Resets t = 0, window state, seq. user_id: max 8 chars [A-Za-z0-9] |
| `S,STOP` | ends the session (CAL: finalises the baseline) |
| `K,<seq>,<t_down>,<dwell>,<class>,<err>` | key event. dwell in ms (0 = unknown). err = 0/1 |
| `F,<seq>,<t>,<v>` | window focus: v = 0 lost, 1 regained |
| `T,<t>` | heartbeat every 1000 ms (closes windows during idle) |
| `R,<t>,<lux>` | lux sample, REPLAY mode only |

- `seq` is one counter shared by K and F, starting at 1 each session.
- Key classes: `L` letter, `S` space, `B` backspace, `E` enter, `P` punctuation/digit, `M` other.

## ESP32 -> laptop
| Line | Meaning |
|---|---|
| `READY,<fw_ver>,1` | boot / handshake reply |
| `ACK,<what>` | e.g. `ACK,S` after START or STOP |
| `BASE,<user_id>,<present>,<mu1..mu18>,<sd1..sd18>` | sent on RUN start and on CAL end. present = 0 means model defaults are used |
| `LUX,<t>,<lux>` | 1 Hz during CAL/RUN |
| `FEAT,<win_id>,<t_end>,<n_keys>,<valid>,<f1..f18>` | raw features (FEATURES.md order), 3 decimals. Emitted for EVERY closed window; valid = 0 -> features are zeros |
| `PRED,<win_id>,<cls>,<p_low>,<p_med>,<p_high>,<flags>,<alert>,<state>` | RUN/REPLAY only. cls 0/1/2, or 255 if none. flags = bitmask. alert 0/1. state: 0 OK, 1 UNCERTAIN, 2 INSUFFICIENT, 3 NO_BASELINE |
| `CAL,DONE,<n_windows>` | calibration saved |
| `WARN,<code>,<detail>` | codes: GAP, MALFORMED, UNKNOWN_CMD, LINK_LOST, LINK_OK, SENSOR_BH1750, CAL_TOO_SHORT, OVERFLOW |

## Behaviour
- Windows are 30 000 ms long with a 15 000 ms hop. Window k covers [15000·k, 15000·k + 30000). An event belongs to a window by its t_down (or t for F). A window closes when any K/F/T/R time >= its end; several may close at once. win_id = k.
- Seq gap -> `WARN,GAP,<expected>,<got>` and continue.
- Link watchdog: during a session, no K/F/T for 5 s -> `WARN,LINK_LOST`, motor off, OLED shows LINK LOST. The next valid line -> `WARN,LINK_OK`.
- CAL: needs >= 6 valid windows, else `WARN,CAL_TOO_SHORT` and nothing is saved. Baseline = per-feature POPULATION mean and sd over valid windows of the TRANSFORMED features (see FEATURES.md). Stored in NVS (Preferences) by user_id; up to 10 users, oldest overwritten. No PRED lines in CAL.
- RUN: load the baseline for user_id (BASE present = 1) or use the model's global defaults (present = 0, PRED state = 3).
- REPLAY: the BH1750 is ignored, lux comes from R lines. The ESP32 must process >= 200 lines/s so a 5-minute session replays in seconds.
- `web/sim/fake-esp32.js` and `tools/replay.py` must implement exactly this protocol so tests can run without hardware.

## Example
```
-> HELLO,1
<- READY,0.1,1
-> S,START,s01,u01,RUN
<- ACK,S
<- BASE,u01,1,<18 mu>,<18 sd>
-> K,1,120,87,L,0
-> K,2,260,92,L,0
-> F,3,4000,0
-> T,5000
...
<- FEAT,0,30000,41,1,<18 values>
<- PRED,0,0,0.71,0.22,0.07,32,0,0
```

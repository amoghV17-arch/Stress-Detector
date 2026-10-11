#pragma once

// protocol.h — Protocol parser per docs/PROTOCOL.md
// Plain C++17 header with no Arduino dependencies. Fully host-testable.

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>

namespace stresskb {

enum class CommandType {
    UNKNOWN,
    HELLO,
    START,
    STOP,
    KEY,
    FOCUS,
    HEARTBEAT,
    REPLAY_LUX
};

struct ParsedCommand {
    CommandType type{CommandType::UNKNOWN};
    uint32_t seq{0};
    uint32_t t{0};
    uint32_t dwell{0};
    char keyClass{'M'};
    uint8_t err{0};
    uint8_t focusVal{0};
    float lux{0.0f};

    char sessionId[16]{0};
    char userId[16]{0};
    char mode[8]{0};

    char warnCode[16]{0};
    char warnDetail[32]{0};
};

class ProtocolParser {
public:
    static constexpr size_t MAX_FIELDS = 12;

    /**
     * Parses a single null-terminated ASCII line (without trailing \r or \n).
     * @param line input string (up to 160 chars)
     * @param out filled parsed command structure
     * @return true if successfully parsed, false if malformed/unknown
     */
    static bool parseLine(const char* line, ParsedCommand& out) {
        out = ParsedCommand{};
        if (!line) return false;

        size_t len = strlen(line);
        if (len == 0) return false;

        if (len > 160) {
            out.type = CommandType::UNKNOWN;
            strncpy(out.warnCode, "OVERFLOW", sizeof(out.warnCode) - 1);
            strncpy(out.warnDetail, "Line exceeds 160 chars", sizeof(out.warnDetail) - 1);
            return false;
        }

        // Tokenize comma-separated fields safely
        char buf[168];
        memcpy(buf, line, len + 1);

        char* fields[MAX_FIELDS];
        size_t fieldCount = 0;

        char* token = buf;
        char* next = nullptr;
        while (token && fieldCount < MAX_FIELDS) {
            next = strchr(token, ',');
            if (next) {
                *next = '\0';
                fields[fieldCount++] = token;
                token = next + 1;
            } else {
                fields[fieldCount++] = token;
                break;
            }
        }

        if (fieldCount == 0) return false;

        const char* cmd = fields[0];

        // 1. HELLO,<proto>
        if (strcmp(cmd, "HELLO") == 0) {
            if (fieldCount >= 2) {
                out.type = CommandType::HELLO;
                out.seq = (uint32_t)strtoul(fields[1], nullptr, 10);
                return true;
            }
            strncpy(out.warnCode, "MALFORMED", sizeof(out.warnCode) - 1);
            strncpy(out.warnDetail, "HELLO", sizeof(out.warnDetail) - 1);
            return false;
        }

        // 2. S,START,<session_id>,<user_id>,<mode> or S,STOP
        if (strcmp(cmd, "S") == 0) {
            if (fieldCount >= 2) {
                if (strcmp(fields[1], "START") == 0) {
                    if (fieldCount >= 5) {
                        out.type = CommandType::START;
                        strncpy(out.sessionId, fields[2], sizeof(out.sessionId) - 1);
                        strncpy(out.userId, fields[3], sizeof(out.userId) - 1);
                        strncpy(out.mode, fields[4], sizeof(out.mode) - 1);
                        return true;
                    }
                } else if (strcmp(fields[1], "STOP") == 0) {
                    out.type = CommandType::STOP;
                    return true;
                }
            }
            strncpy(out.warnCode, "MALFORMED", sizeof(out.warnCode) - 1);
            strncpy(out.warnDetail, "S", sizeof(out.warnDetail) - 1);
            return false;
        }

        // 3. K,<seq>,<t_down>,<dwell>,<class>,<err>
        if (strcmp(cmd, "K") == 0) {
            if (fieldCount >= 6) {
                out.type = CommandType::KEY;
                out.seq = (uint32_t)strtoul(fields[1], nullptr, 10);
                out.t = (uint32_t)strtoul(fields[2], nullptr, 10);
                out.dwell = (uint32_t)strtoul(fields[3], nullptr, 10);
                out.keyClass = fields[4][0];
                out.err = (uint8_t)strtoul(fields[5], nullptr, 10);
                return true;
            }
            strncpy(out.warnCode, "MALFORMED", sizeof(out.warnCode) - 1);
            strncpy(out.warnDetail, "K", sizeof(out.warnDetail) - 1);
            return false;
        }

        // 4. F,<seq>,<t>,<v>
        if (strcmp(cmd, "F") == 0) {
            if (fieldCount >= 4) {
                out.type = CommandType::FOCUS;
                out.seq = (uint32_t)strtoul(fields[1], nullptr, 10);
                out.t = (uint32_t)strtoul(fields[2], nullptr, 10);
                out.focusVal = (uint8_t)strtoul(fields[3], nullptr, 10);
                return true;
            }
            strncpy(out.warnCode, "MALFORMED", sizeof(out.warnCode) - 1);
            strncpy(out.warnDetail, "F", sizeof(out.warnDetail) - 1);
            return false;
        }

        // 5. T,<t>
        if (strcmp(cmd, "T") == 0) {
            if (fieldCount >= 2) {
                out.type = CommandType::HEARTBEAT;
                out.t = (uint32_t)strtoul(fields[1], nullptr, 10);
                return true;
            }
            strncpy(out.warnCode, "MALFORMED", sizeof(out.warnCode) - 1);
            strncpy(out.warnDetail, "T", sizeof(out.warnDetail) - 1);
            return false;
        }

        // 6. R,<t>,<lux>
        if (strcmp(cmd, "R") == 0) {
            if (fieldCount >= 3) {
                out.type = CommandType::REPLAY_LUX;
                out.t = (uint32_t)strtoul(fields[1], nullptr, 10);
                out.lux = (float)strtod(fields[2], nullptr);
                return true;
            }
            strncpy(out.warnCode, "MALFORMED", sizeof(out.warnCode) - 1);
            strncpy(out.warnDetail, "R", sizeof(out.warnDetail) - 1);
            return false;
        }

        // Unknown Command
        out.type = CommandType::UNKNOWN;
        strncpy(out.warnCode, "UNKNOWN_CMD", sizeof(out.warnCode) - 1);
        strncpy(out.warnDetail, cmd, sizeof(out.warnDetail) - 1);
        return false;
    }
};

} // namespace stresskb

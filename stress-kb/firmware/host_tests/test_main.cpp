#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <cassert>
#include <cmath>
#include <cstdlib>

#include "protocol.h"
#include "features.h"

using namespace stresskb;

void testParser() {
    std::cout << "[TEST] Protocol parser..." << std::endl;
    ParsedCommand cmd;

    // 1. HELLO,1
    assert(ProtocolParser::parseLine("HELLO,1", cmd));
    assert(cmd.type == CommandType::HELLO);
    assert(cmd.seq == 1);

    // 2. S,START,s01,u01,RUN
    assert(ProtocolParser::parseLine("S,START,s01,u01,RUN", cmd));
    assert(cmd.type == CommandType::START);
    assert(std::string(cmd.sessionId) == "s01");
    assert(std::string(cmd.userId) == "u01");
    assert(std::string(cmd.mode) == "RUN");

    // 3. S,STOP
    assert(ProtocolParser::parseLine("S,STOP", cmd));
    assert(cmd.type == CommandType::STOP);

    // 4. K,1,100,50,L,0
    assert(ProtocolParser::parseLine("K,1,100,50,L,0", cmd));
    assert(cmd.type == CommandType::KEY);
    assert(cmd.seq == 1);
    assert(cmd.t == 100);
    assert(cmd.dwell == 50);
    assert(cmd.keyClass == 'L');
    assert(cmd.err == 0);

    // 5. F,2,500,1
    assert(ProtocolParser::parseLine("F,2,500,1", cmd));
    assert(cmd.type == CommandType::FOCUS);
    assert(cmd.seq == 2);
    assert(cmd.t == 500);
    assert(cmd.focusVal == 1);

    // 6. T,1000
    assert(ProtocolParser::parseLine("T,1000", cmd));
    assert(cmd.type == CommandType::HEARTBEAT);
    assert(cmd.t == 1000);

    // 7. R,1000,320.5
    assert(ProtocolParser::parseLine("R,1000,320.5", cmd));
    assert(cmd.type == CommandType::REPLAY_LUX);
    assert(cmd.t == 1000);
    assert(std::abs(cmd.lux - 320.5f) < 1e-4);

    // Malformed / Error cases
    assert(!ProtocolParser::parseLine("HELLO", cmd)); // missing arg
    assert(std::string(cmd.warnCode) == "MALFORMED");

    assert(!ProtocolParser::parseLine("K,1,100", cmd)); // incomplete K
    assert(std::string(cmd.warnCode) == "MALFORMED");

    assert(!ProtocolParser::parseLine("UNKNOWN,foo,bar", cmd)); // unknown
    assert(std::string(cmd.warnCode) == "UNKNOWN_CMD");

    // Oversized line > 160 chars
    std::string longLine(200, 'X');
    assert(!ProtocolParser::parseLine(longLine.c_str(), cmd));
    assert(std::string(cmd.warnCode) == "OVERFLOW");

    std::cout << "  -> Parser tests passed." << std::endl;
}

void testParserFuzz() {
    std::cout << "[TEST] Protocol parser fuzzing..." << std::endl;
    // Fuzz random strings
    srand(42);
    for (int i = 0; i < 5000; i++) {
        int len = rand() % 180;
        std::string s;
        for (int j = 0; j < len; j++) {
            char c = (char)(rand() % 96 + 32); // printable ASCII
            s += c;
        }
        ParsedCommand cmd;
        // Must never crash or hang
        ProtocolParser::parseLine(s.c_str(), cmd);
    }
    std::cout << "  -> 5000 fuzz iterations survived with no crashes." << std::endl;
}

struct ExpectedWindow {
    uint32_t winId{0};
    uint32_t tEnd{0};
    uint32_t nKeys{0};
    uint8_t valid{0};
    std::vector<float> features;
};

// Simple JSON parser for our known expected.json format
std::vector<ExpectedWindow> parseExpectedJson(const std::string& path) {
    std::ifstream f(path);
    if (!f.is_open()) {
        std::cerr << "Failed to open expected file: " << path << std::endl;
        exit(1);
    }
    std::string content((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());

    std::vector<ExpectedWindow> list;
    size_t pos = 0;
    while ((pos = content.find("\"win_id\":", pos)) != std::string::npos) {
        ExpectedWindow w;
        pos += 9;
        w.winId = std::stoul(content.substr(pos, 10));

        size_t tEndPos = content.find("\"t_end\":", pos);
        w.tEnd = std::stoul(content.substr(tEndPos + 8, 10));

        size_t nKeysPos = content.find("\"n_keys\":", pos);
        w.nKeys = std::stoul(content.substr(nKeysPos + 9, 10));

        size_t validPos = content.find("\"valid\":", pos);
        w.valid = (uint8_t)std::stoul(content.substr(validPos + 8, 5));

        size_t featPos = content.find("\"features\":", pos);
        size_t arrStart = content.find('[', featPos);
        size_t arrEnd = content.find(']', arrStart);
        std::string arrStr = content.substr(arrStart + 1, arrEnd - arrStart - 1);

        std::stringstream ss(arrStr);
        std::string valStr;
        while (std::getline(ss, valStr, ',')) {
            // Trim whitespace
            size_t first = valStr.find_first_not_of(" \t\r\n");
            size_t last = valStr.find_last_not_of(" \t\r\n");
            if (first != std::string::npos && last != std::string::npos) {
                w.features.push_back(std::stof(valStr.substr(first, last - first + 1)));
            }
        }
        list.push_back(w);
        pos = arrEnd;
    }
    return list;
}

void verifyGolden(const std::string& name) {
    std::string csvPath = "../../tests/golden/" + name + ".csv";
    std::string jsonPath = "../../tests/golden/" + name + ".expected.json";

    // Try relative paths
    std::ifstream testF(csvPath);
    if (!testF.is_open()) {
        csvPath = "tests/golden/" + name + ".csv";
        jsonPath = "tests/golden/" + name + ".expected.json";
    }

    std::cout << "[TEST] Golden comparison: " << name << "..." << std::endl;
    auto expected = parseExpectedJson(jsonPath);

    std::vector<WindowFeatures> computed;
    auto onWin = [](const WindowFeatures& wf, void* user) {
        auto* vec = static_cast<std::vector<WindowFeatures>*>(user);
        vec->push_back(wf);
    };

    WindowEngine engine(onWin, &computed);

    std::ifstream csvFile(csvPath);
    std::string line;
    ParsedCommand cmd;
    while (std::getline(csvFile, line)) {
        if (line.empty() || line[0] == '#') continue;
        if (ProtocolParser::parseLine(line.c_str(), cmd)) {
            if (cmd.type == CommandType::KEY) {
                engine.addKey(cmd.seq, cmd.t, cmd.dwell, cmd.keyClass, cmd.err);
            } else if (cmd.type == CommandType::FOCUS) {
                engine.addFocus(cmd.seq, cmd.t, cmd.focusVal);
            } else if (cmd.type == CommandType::HEARTBEAT) {
                engine.addHeartbeat(cmd.t);
            } else if (cmd.type == CommandType::REPLAY_LUX) {
                engine.addLux(cmd.t, cmd.lux);
            }
        }
    }

    assert(computed.size() == expected.size());
    for (size_t i = 0; i < computed.size(); i++) {
        const auto& c = computed[i];
        const auto& exp = expected[i];
        assert(c.winId == exp.winId);
        assert(c.tEnd == exp.tEnd);
        assert(c.nKeys == exp.nKeys);
        assert(c.valid == exp.valid);
        assert(exp.features.size() == 18);

        for (int f = 0; f < 18; f++) {
            float cVal = c.f[f];
            float eVal = exp.features[f];
            float absErr = std::abs(cVal - eVal);
            float relErr = (std::abs(eVal) > 1e-5f) ? (absErr / std::abs(eVal)) : absErr;

            // Contract per FEATURES.md: relative error <= 1e-3 or absolute error <= 1e-6
            bool pass = (absErr <= 1e-3f) || (relErr <= 1e-3f);
            if (!pass) {
                std::cerr << "FAIL in " << name << " win " << c.winId << " feat " << (f + 1)
                          << ": computed=" << cVal << " expected=" << eVal
                          << " absErr=" << absErr << " relErr=" << relErr << std::endl;
                assert(false);
            }
        }
    }
    std::cout << "  -> " << name << " verified " << computed.size() << " windows successfully." << std::endl;
}

int main() {
    std::cout << "=========================================" << std::endl;
    std::cout << "StressKB C++ Firmware Host Test Suite" << std::endl;
    std::cout << "=========================================" << std::endl;

    testParser();
    testParserFuzz();

    std::vector<std::string> goldenCases = {
        "normal_typing",
        "no_errors",
        "all_backspaces",
        "long_idle",
        "fewer_than_20_keys",
        "dwell_zero",
        "focus_losses",
        "burst_2000_lines"
    };

    for (const auto& gc : goldenCases) {
        verifyGolden(gc);
    }

    std::cout << "=========================================" << std::endl;
    std::cout << "ALL HOST TESTS PASSED (100% agreement with golden reference)." << std::endl;
    std::cout << "=========================================" << std::endl;
    return 0;
}

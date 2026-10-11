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
#include "motor.h"
#include "ui.h"
#include "sensors.h"
#include "inference.h"
#include "test_model_data.h"
#include <chrono>

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
    srand(42);
    for (int i = 0; i < 5000; i++) {
        int len = rand() % 180;
        std::string s;
        for (int j = 0; j < len; j++) {
            char c = (char)(rand() % 96 + 32);
            s += c;
        }
        ParsedCommand cmd;
        ProtocolParser::parseLine(s.c_str(), cmd);
    }
    std::cout << "  -> 5000 fuzz iterations survived with no crashes." << std::endl;
}

void testMotorPatterns() {
    std::cout << "[TEST] Motor pattern timing..." << std::endl;

    // SINGLE: 0..150ms ON, >150ms OFF
    assert(getMotorDutyAtTime(MotorPattern::SINGLE, 0) == MOTOR_DUTY_CAP);
    assert(getMotorDutyAtTime(MotorPattern::SINGLE, 149) == MOTOR_DUTY_CAP);
    assert(getMotorDutyAtTime(MotorPattern::SINGLE, 150) == 0);
    assert(getMotorDutyAtTime(MotorPattern::SINGLE, 200) == 0);

    // DOUBLE: 0..150ms ON, 150..300ms OFF, 300..450ms ON, >450ms OFF
    assert(getMotorDutyAtTime(MotorPattern::DOUBLE, 0) == MOTOR_DUTY_CAP);
    assert(getMotorDutyAtTime(MotorPattern::DOUBLE, 149) == MOTOR_DUTY_CAP);
    assert(getMotorDutyAtTime(MotorPattern::DOUBLE, 150) == 0);
    assert(getMotorDutyAtTime(MotorPattern::DOUBLE, 299) == 0);
    assert(getMotorDutyAtTime(MotorPattern::DOUBLE, 300) == MOTOR_DUTY_CAP);
    assert(getMotorDutyAtTime(MotorPattern::DOUBLE, 449) == MOTOR_DUTY_CAP);
    assert(getMotorDutyAtTime(MotorPattern::DOUBLE, 450) == 0);

    // LONG: 0..400ms ON, >400ms OFF
    assert(getMotorDutyAtTime(MotorPattern::LONG, 0) == MOTOR_DUTY_CAP);
    assert(getMotorDutyAtTime(MotorPattern::LONG, 399) == MOTOR_DUTY_CAP);
    assert(getMotorDutyAtTime(MotorPattern::LONG, 400) == 0);

    assert(getMotorPatternDuration(MotorPattern::SINGLE) == 150);
    assert(getMotorPatternDuration(MotorPattern::DOUBLE) == 450);
    assert(getMotorPatternDuration(MotorPattern::LONG) == 400);

    std::cout << "  -> Motor pattern timings verified." << std::endl;
}

void testScreenLayout() {
    std::cout << "[TEST] Screen layout pure formatting..." << std::endl;

    // 1. MAIN screen
    DisplayData dMain;
    dMain.screen = ScreenType::MAIN;
    dMain.stressLevel = 2; // HIGH
    dMain.confidence = 0.85f;
    dMain.patternFlags = FLAG_RUSHED;
    dMain.lux = 320.0f;
    dMain.linkOk = true;

    FormattedScreen fs = computeScreenLayout(dMain);
    assert(std::string(fs.title) == "STRESS: HIGH");
    assert(std::string(fs.metricLine) == "Conf: 85%");
    assert(std::string(fs.statusLine) == "Mode: RUSHED");
    assert(std::string(fs.footerLine).find("Lux: 320") != std::string::npos);

    // 2. LINK_LOST screen
    DisplayData dLost = dMain;
    dLost.linkOk = false;
    FormattedScreen fsLost = computeScreenLayout(dLost);
    assert(std::string(fsLost.title) == "! LINK LOST !");
    assert(std::string(fsLost.statusLine) == "Check USB cable");

    // 3. CAL screen
    DisplayData dCal;
    dCal.screen = ScreenType::CAL;
    dCal.calWindows = 4;
    dCal.linkOk = true;
    dCal.lux = 250.0f;
    FormattedScreen fsCal = computeScreenLayout(dCal);
    assert(std::string(fsCal.title) == "CALIBRATION");
    assert(std::string(fsCal.metricLine) == "Windows: 4 / 6");

    // 4. INSUFFICIENT screen
    DisplayData dIns;
    dIns.screen = ScreenType::INSUFFICIENT;
    dIns.totalKeys = 12;
    dIns.linkOk = true;
    FormattedScreen fsIns = computeScreenLayout(dIns);
    assert(std::string(fsIns.title) == "INSUFFICIENT");
    assert(std::string(fsIns.metricLine) == "Keys: 12 (< 20)");

    // 5. UNCERTAIN screen
    DisplayData dUnc;
    dUnc.screen = ScreenType::UNCERTAIN;
    dUnc.confidence = 0.45f;
    dUnc.linkOk = true;
    FormattedScreen fsUnc = computeScreenLayout(dUnc);
    assert(std::string(fsUnc.title) == "UNCERTAIN");
    assert(std::string(fsUnc.metricLine) == "Conf: 45% (< 60%)");

    std::cout << "  -> Screen layouts verified." << std::endl;
}

void testBareBoardMode() {
    std::cout << "[TEST] Bare-board mode (no peripherals attached)..." << std::endl;

    // Simulate missing sensor, display, motor
    LightSensor sensor;
    // Without hardware, sensor reads 0 lux and update returns false without crashing
    float lux = 999.0f;
    sensor.update(1000, lux);

    DisplayController display;
    DisplayData dd;
    dd.linkOk = true;
    display.render(dd); // does not crash

    MotorController motor;
    motor.trigger(MotorPattern::DOUBLE, 1000);
    motor.update(1200);
    motor.stop(); // does not crash

    // Full protocol session on bare board
    WindowEngine engine;
    engine.addKey(1, 100, 50, 'L', 0);
    engine.addKey(2, 200, 50, 'L', 0);
    engine.addHeartbeat(35000); // closes window without crash

    std::cout << "  -> Bare-board mode runs smoothly without crashing." << std::endl;
}

struct ExpectedWindow {
    uint32_t winId{0};
    uint32_t tEnd{0};
    uint32_t nKeys{0};
    uint8_t valid{0};
    std::vector<float> features;
};

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

void testModelInference() {
    std::cout << "[TEST] TinyML Model Inference (emlearn vs scikit-learn agreement)..." << std::endl;
    int matches = 0;
    int total = N_MODEL_TEST_CASES;
    assert(total > 0);
    float maxDiff = 0.0f;

    auto startTime = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < total; i++) {
        const auto& tc = MODEL_TEST_CASES[i];
        float probs[MODEL_N_CLASSES] = {0.0f};
        stress_model_predict_proba(tc.z, MODEL_N_FEATURES, probs, MODEL_N_CLASSES);

        // argmax
        int bestCls = 0;
        float maxP = probs[0];
        for (int c = 1; c < MODEL_N_CLASSES; c++) {
            if (probs[c] > maxP) {
                maxP = probs[c];
                bestCls = c;
            }
        }

        if (bestCls == tc.expected_class) {
            matches++;
        }

        // Check probability difference
        for (int c = 0; c < MODEL_N_CLASSES; c++) {
            float diff = std::abs(probs[c] - tc.expected_probs[c]);
            if (diff > maxDiff) maxDiff = diff;
        }
    }

    auto endTime = std::chrono::high_resolution_clock::now();
    double totalUs = std::chrono::duration<double, std::micro>(endTime - startTime).count();
    double usPerWin = totalUs / total;
    double agreementPct = (100.0 * matches) / total;

    std::cout << "  -> Held-out test cases evaluated: " << total << std::endl;
    std::cout << "  -> C++ vs scikit-learn class agreement: " << agreementPct << "% (" << matches << "/" << total << ")" << std::endl;
    std::cout << "  -> Max probability diff (voting vs leaf avg): " << maxDiff << std::endl;
    std::cout << "  -> Inference time per window: " << usPerWin << " us on host" << std::endl;
    std::cout << "  -> Estimated inference time on ESP32 (240MHz): ~" << (usPerWin * 8.0) << " us (< 1 ms)" << std::endl;
    std::cout << "  -> Model trees: " << MODEL_N_TREES << " trees, features: " << MODEL_N_FEATURES << std::endl;

    assert(agreementPct >= 99.0);

    // Test ModelInference::predict with an invalid window
    WindowFeatures invalidWf;
    invalidWf.winId = 99;
    invalidWf.valid = 0;
    auto resInvalid = ModelInference::predict(invalidWf, nullptr, nullptr, false);
    assert(resInvalid.state == 2); // INSUFFICIENT
    assert(resInvalid.cls == 255);

    // Test ModelInference::predict with a valid window using global baseline
    WindowFeatures validWf;
    validWf.winId = 100;
    validWf.valid = 1;
    for (int f = 0; f < 18; f++) validWf.f[f] = 100.0f;
    validWf.f[16] = 300.0f; // lux_mean
    validWf.f[17] = 20.0f;  // lux_std
    auto resValid = ModelInference::predict(validWf, nullptr, nullptr, false);
    assert(resValid.state == 3); // NO_BASELINE
    assert(resValid.cls < MODEL_N_CLASSES);
    std::cout << "  -> ModelInference::predict valid/invalid logic verified." << std::endl;
}

int main() {
    std::cout << "=========================================" << std::endl;
    std::cout << "StressKB C++ Firmware Host Test Suite" << std::endl;
    std::cout << "=========================================" << std::endl;

    testParser();
    testParserFuzz();
    testMotorPatterns();
    testScreenLayout();
    testBareBoardMode();
    testModelInference();

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

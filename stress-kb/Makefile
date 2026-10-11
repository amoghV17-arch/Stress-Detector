.PHONY: all serve test compile synth clean

ifeq ($(OS),Windows_NT)
  PYTHON ?= $(if $(wildcard .venv/Scripts/python.exe),.venv/Scripts/python.exe,python)
  PYTEST ?= $(if $(wildcard .venv/Scripts/pytest.exe),.venv/Scripts/pytest.exe,pytest)
else
  PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)
  PYTEST ?= $(if $(wildcard .venv/bin/pytest),.venv/bin/pytest,pytest)
endif

all: test

serve:
	$(PYTHON) -m http.server 8000 -d web

test:
	node --test web/tests/*.test.js
	$(MAKE) -C firmware/host_tests
	$(PYTHON) -m pytest -q tests ml

compile:
	@arduino-cli compile --fqbn esp32:esp32:esp32 firmware/stresskb 2>nul || echo USER GATE: compile in Arduino IDE (arduino-cli not installed or compilation required in IDE)

synth:
	$(PYTHON) tools/synth_data.py --output ml/data/synthetic

clean:
	$(MAKE) -C firmware/host_tests clean

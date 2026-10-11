CXX ?= g++
CXXFLAGS ?= -std=c++17 -Wall -Wextra -I../stresskb

TARGET = test_runner.exe
SRCS = test_main.cpp

all: $(TARGET)
	./$(TARGET)

$(TARGET): $(SRCS)
	$(CXX) $(CXXFLAGS) -o $(TARGET) $(SRCS)

clean:
	rm -f $(TARGET) *.o

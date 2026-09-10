#include <Wire.h>
#include <WiFi.h>
#include <ThingSpeak.h>

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#include "MAX30105.h"
#include "heartRate.h"

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

#include <OneWire.h>
#include <DallasTemperature.h>

#include <math.h>

// =====================================================
// WIFI / THINGSPEAK
// =====================================================

#include "secrets.h"
WiFiClient client;

// =====================================================
// OLED
// =====================================================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C

Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire,
  -1
);

// =====================================================
// SENSORS
// =====================================================

MAX30105 particleSensor;
Adafruit_MPU6050 mpu;

// =====================================================
// PINS
// =====================================================

#define SDA_PIN 21
#define SCL_PIN 22

#define BUZZER 15
#define DS18B20_PIN 25

// =====================================================
// TEMPERATURE
// =====================================================

OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);

float sensorTemperature = 0;
float displayTemp = 0;

// =====================================================
// SpO2
// =====================================================

#define SPO2_SAMPLES 50

uint32_t irSamples[SPO2_SAMPLES];
uint32_t redSamples[SPO2_SAMPLES];

int spo2Value = 0;
int displaySpO2 = 0;

// =====================================================
// HEART RATE
// =====================================================

const byte RATE_SIZE = 4;

byte rates[RATE_SIZE];
byte rateSpot = 0;

long lastBeat = 0;

float beatsPerMinute = 0;

int beatAvg = 0;
int displayHR = 0;

bool hrDetected = false;

// =====================================================
// FINGER DETECTION
// =====================================================

bool fingerPresent = false;

#define FINGER_THRESHOLD 50000

// =====================================================
// FALL DETECTION
// =====================================================

float prevX_fall = 0;
float prevY_fall = 0;
float prevZ_fall = 0;

bool firstRead = true;

bool fallDetected = false;

float maxChange = 0;

// Fall threshold
#define FALL_THRESHOLD 20.0

// =====================================================
// STRESS
// =====================================================

/*
   Stress level:
   0 = LOW
   1 = MEDIUM
   2 = HIGH

   This is a project-level heuristic only.
*/

int stressLevel = 0;

String stressText = "LOW";

// =====================================================
// TIMING
// =====================================================

unsigned long lastThingSpeakUpload = 0;

#define THINGSPEAK_INTERVAL 15000

// =====================================================
// FUNCTION DECLARATIONS
// =====================================================

void connectWiFi();

void processHeartRate();

bool collectSpO2Samples();

void calculateSpO2();

float detectFall();

void readTemperature();

void calculateStress();

void showScanning();

void showResults();

void showFallAlert();

void showNoFinger();

void showHighStress();

void beep();

void doubleBeep();

void uploadThingSpeak();

void measureHealth();

// =====================================================
// BUZZER
// =====================================================

void beep()
{
  digitalWrite(BUZZER, LOW);
  delay(300);
  digitalWrite(BUZZER, HIGH);
}

// =====================================================
// DOUBLE BEEP
// =====================================================

void doubleBeep()
{
  digitalWrite(BUZZER, LOW);
  delay(150);

  digitalWrite(BUZZER, HIGH);
  delay(150);

  digitalWrite(BUZZER, LOW);
  delay(150);

  digitalWrite(BUZZER, HIGH);
}

// =====================================================
// WIFI
// =====================================================

void connectWiFi()
{
  if (WiFi.status() == WL_CONNECTED)
    return;

  Serial.println("Connecting WiFi...");

  WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
  );

  unsigned long startTime = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startTime < 15000
  )
  {
    delay(250);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("WiFi Connected");
    Serial.println(WiFi.localIP());
  }
  else
  {
    Serial.println("WiFi connection failed");
  }
}

// =====================================================
// THINGSPEAK
// =====================================================

void uploadThingSpeak()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    connectWiFi();
  }

  if (WiFi.status() != WL_CONNECTED)
    return;

  int fallStatus = 0;

  if (fallDetected)
    fallStatus = 1;

  ThingSpeak.setField(1, displayHR);
  ThingSpeak.setField(2, displaySpO2);
  ThingSpeak.setField(3, displayTemp);
  ThingSpeak.setField(4, stressLevel);
  ThingSpeak.setField(5, fallStatus);

  ThingSpeak.setField(6, 0);
  ThingSpeak.setField(7, 0);
  ThingSpeak.setField(8, 0);

  int response = ThingSpeak.writeFields(
    THINGSPEAK_CHANNEL_ID,
    THINGSPEAK_API_KEY
  );

  if (response == 200)
  {
    Serial.println("ThingSpeak update OK");
  }
  else
  {
    Serial.print("ThingSpeak Error: ");
    Serial.println(response);
  }
}

// =====================================================
// SpO2 CALCULATION
// =====================================================

void calculateSpO2()
{
  float irAverage = 0;
  float redAverage = 0;

  for (int i = 0; i < SPO2_SAMPLES; i++)
  {
    irAverage += irSamples[i];
    redAverage += redSamples[i];
  }

  irAverage /= SPO2_SAMPLES;
  redAverage /= SPO2_SAMPLES;

  float irAC = 0;
  float redAC = 0;

  for (int i = 0; i < SPO2_SAMPLES; i++)
  {
    irAC += fabs((float)irSamples[i] - irAverage);
    redAC += fabs((float)redSamples[i] - redAverage);
  }

  irAC /= SPO2_SAMPLES;
  redAC /= SPO2_SAMPLES;

  if (irAverage > 0 && redAverage > 0 && irAC > 0)
  {
    float R = (redAC / redAverage) / (irAC / irAverage);
    float calculated = 110.0 - 25.0 * R;

    if (calculated >= 70 && calculated <= 100)
    {
      spo2Value = (int)calculated;
    }
  }
}

// =====================================================
// SpO2 COLLECTION
// =====================================================

bool collectSpO2Samples()
{
  int collected = 0;
  unsigned long startTime = millis();

  while (collected < SPO2_SAMPLES && millis() - startTime < 5000)
  {
    particleSensor.check();

    if (particleSensor.available())
    {
      irSamples[collected] = particleSensor.getIR();
      redSamples[collected] = particleSensor.getRed();
      particleSensor.nextSample();
      collected++;
    }

    delay(2);
  }

  if (collected == SPO2_SAMPLES)
  {
    calculateSpO2();
    return true;
  }

  return false;
}

// =====================================================
// HEART RATE PROCESSING
// =====================================================

void processHeartRate()
{
  particleSensor.check();

  int samplesProcessed = 0;

  while (particleSensor.available() && samplesProcessed < 8)
  {
    uint32_t irValue = particleSensor.getIR();

    if (checkForBeat(irValue))
    {
      long delta = millis() - lastBeat;

      if (delta > 300 && delta < 3000)
      {
        beatsPerMinute = 60.0 / (delta / 1000.0);

        if (beatsPerMinute > 20 && beatsPerMinute < 255)
        {
          rates[rateSpot] = (byte)beatsPerMinute;
          rateSpot++;

          if (rateSpot >= RATE_SIZE)
          {
            rateSpot = 0;
          }

          int total = 0;
          int validSamples = 0;

          for (byte i = 0; i < RATE_SIZE; i++)
          {
            if (rates[i] > 0)
            {
              total += rates[i];
              validSamples++;
            }
          }

          if (validSamples > 0)
          {
            beatAvg = total / validSamples;
            hrDetected = true;

            Serial.print("Heart Rate: ");
            Serial.println(beatAvg);
          }
        }
      }

      lastBeat = millis();
    }

    particleSensor.nextSample();
    samplesProcessed++;
  }
}

// =====================================================
// FALL DETECTION
// =====================================================

float detectFall()
{
  sensors_event_t a;
  sensors_event_t g;
  sensors_event_t temp;

  mpu.getEvent(&a, &g, &temp);

  float currX = a.acceleration.x;
  float currY = a.acceleration.y;
  float currZ = a.acceleration.z;

  if (firstRead)
  {
    prevX_fall = currX;
    prevY_fall = currY;
    prevZ_fall = currZ;

    firstRead = false;

    return 0;
  }

  float deltaX = fabs(currX - prevX_fall);
  float deltaY = fabs(currY - prevY_fall);
  float deltaZ = fabs(currZ - prevZ_fall);

  float change = max(deltaX, max(deltaY, deltaZ));

  prevX_fall = currX;
  prevY_fall = currY;
  prevZ_fall = currZ;

  return change;
}

// =====================================================
// TEMPERATURE
// =====================================================

void readTemperature()
{
  ds18b20.requestTemperatures();

  sensorTemperature = ds18b20.getTempCByIndex(0);

  if (sensorTemperature == DEVICE_DISCONNECTED_C)
  {
    sensorTemperature = 0;
  }

  displayTemp = sensorTemperature;

  Serial.print("Temperature: ");
  Serial.println(displayTemp);
}

// =====================================================
// STRESS CALCULATION
// =====================================================

void calculateStress()
{
  int score = 0;

  if (displayHR > 0)
  {
    if (displayHR >= 110)
    {
      score += 2;
    }
    else if (displayHR >= 90)
    {
      score += 1;
    }
  }

  if (displaySpO2 > 0)
  {
    if (displaySpO2 < 92)
    {
      score += 2;
    }
    else if (displaySpO2 <= 94)
    {
      score += 1;
    }
  }

  if (displayTemp > 0)
  {
    if (displayTemp >= 38.0)
    {
      score += 2;
    }
    else if (displayTemp >= 37.5)
    {
      score += 1;
    }
  }

  if (score >= 3)
  {
    stressLevel = 2;
    stressText = "HIGH";
  }
  else if (score >= 1)
  {
    stressLevel = 1;
    stressText = "MEDIUM";
  }
  else
  {
    stressLevel = 0;
    stressText = "LOW";
  }

  Serial.print("Stress Score: ");
  Serial.println(score);

  Serial.print("Stress Level: ");
  Serial.println(stressText);
}

// =====================================================
// OLED - SCANNING
// =====================================================

void showScanning()
{
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);

  display.print("HR: ");
  if (beatAvg > 0) display.print(beatAvg); else display.print("--");
  display.println(" BPM");

  display.setCursor(0, 12);
  display.print("SpO2: ");
  if (displaySpO2 > 0) display.print(displaySpO2); else display.print("--");
  display.println("%");

  display.setCursor(0, 24);
  display.print("Temp: ");
  display.print(displayTemp, 1);
  display.println(" C");

  display.setCursor(0, 36);
  display.print("Stress: ");
  display.println(stressText);

  display.setCursor(0, 50);
  display.println("Monitoring...");

  display.display();
}

// =====================================================
// OLED - RESULTS
// =====================================================

void showResults()
{
  display.clearDisplay();
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.print("HR:");
  if (displayHR > 0) display.print(displayHR); else display.print("--");
  display.print(" BPM");

  display.setCursor(0, 12);
  display.print("SpO2:");
  if (displaySpO2 > 0) display.print(displaySpO2); else display.print("--");
  display.print("%");

  display.setCursor(0, 24);
  display.print("Temp:");
  display.print(displayTemp, 1);
  display.print(" C");

  display.setCursor(0, 36);
  display.print("Stress:");
  display.print(stressText);

  display.setCursor(0, 48);
  if (fallDetected)
  {
    display.print("FALL: DETECTED");
  }
  else
  {
    display.print("Fall: NORMAL");
  }

  display.display();
}

// =====================================================
// FALL ALERT
// =====================================================

void showFallAlert()
{
  display.clearDisplay();
  display.setTextSize(2);

  display.setCursor(20, 0);
  display.println("FALL");

  display.setCursor(5, 22);
  display.println("DETECTED");

  display.setTextSize(1);
  display.setCursor(15, 47);
  display.println("CHECK PERSON!");

  display.display();
}

// =====================================================
// NO FINGER
// =====================================================

void showNoFinger()
{
  display.clearDisplay();
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("HEALTH MONITOR");

  display.setCursor(0, 17);
  display.println("Place Finger");

  display.setCursor(0, 31);
  display.println("on MAX30105");

  display.setCursor(0, 48);
  display.println("Fall Detection ON");

  display.display();
}

// =====================================================
// HIGH STRESS
// =====================================================

void showHighStress()
{
  display.clearDisplay();
  display.setTextSize(2);

  display.setCursor(8, 0);
  display.println("STRESS");

  display.setCursor(25, 24);
  display.println("HIGH");

  display.setTextSize(1);
  display.setCursor(15, 50);
  display.println("ALERT!");

  display.display();
}

// =====================================================
// MAIN HEALTH MEASUREMENT
// =====================================================

void measureHealth()
{
  displayHR = 0;
  displaySpO2 = 0;
  displayTemp = 0;

  beatAvg = 0;
  spo2Value = 0;
  rateSpot = 0;
  lastBeat = 0;

  hrDetected = false;
  fallDetected = false;
  firstRead = true;
  maxChange = 0;

  stressLevel = 0;
  stressText = "LOW";

  for (byte i = 0; i < RATE_SIZE; i++)
  {
    rates[i] = 0;
  }

  particleSensor.clearFIFO();

  particleSensor.check();

  uint32_t irValue = particleSensor.getIR();

  fingerPresent = (irValue > FINGER_THRESHOLD);

  if (!fingerPresent)
  {
    showNoFinger();

    unsigned long start = millis();

    while (millis() - start < 1000)
    {
      float change = detectFall();

      if (change > maxChange)
      {
        maxChange = change;
      }

      if (change > FALL_THRESHOLD)
      {
        fallDetected = true;

        showFallAlert();
        beep();
        uploadThingSpeak();

        delay(2000);
        return;
      }

      delay(10);
    }

    return;
  }

  unsigned long scanStart = millis();
  unsigned long lastOLED = 0;

  while (millis() - scanStart < 15000)
  {
    processHeartRate();

    particleSensor.check();
    uint32_t currentIR = particleSensor.getIR();
    fingerPresent = (currentIR > FINGER_THRESHOLD);

    float change = detectFall();

    if (change > maxChange)
    {
      maxChange = change;
    }

    if (change > FALL_THRESHOLD)
    {
      fallDetected = true;
      break;
    }

    if (millis() - lastOLED > 500)
    {
      showScanning();
      lastOLED = millis();
    }

    delay(5);
  }

  if (fallDetected)
  {
    showFallAlert();

    for (int i = 0; i < 3; i++)
    {
      beep();
      delay(200);
    }

    uploadThingSpeak();
    delay(2000);
    return;
  }

  readTemperature();

  if (beatAvg > 0)
  {
    displayHR = beatAvg;
  }

  if (fingerPresent)
  {
    bool spo2OK = collectSpO2Samples();

    if (spo2OK)
    {
      displaySpO2 = spo2Value;
    }
  }

  calculateStress();
  showResults();

  if (stressLevel == 2)
  {
    showHighStress();
    doubleBeep();
    delay(1000);
    showResults();
  }

  uploadThingSpeak();

  unsigned long displayStart = millis();

  while (millis() - displayStart < 5000)
  {
    float change = detectFall();

    if (change > maxChange)
    {
      maxChange = change;
    }

    if (change > FALL_THRESHOLD)
    {
      fallDetected = true;

      showFallAlert();

      for (int i = 0; i < 3; i++)
      {
        beep();
        delay(200);
      }

      uploadThingSpeak();
      delay(2000);
      return;
    }

    if (!fallDetected)
    {
      showResults();
    }

    delay(100);
  }
}

// =====================================================
// SETUP
// =====================================================

void setup()
{
  Serial.begin(115200);
  delay(1000);  // give Serial Monitor time to attach after reset

  Serial.println();
  Serial.println("=== BOOT START ===");

  pinMode(BUZZER, OUTPUT);
  digitalWrite(BUZZER, HIGH);

  Wire.begin(SDA_PIN, SCL_PIN);
  Serial.println("I2C begin done");

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR))
  {
    Serial.println("OLED ERROR");
    while (1);
  }
  Serial.println("OLED begin OK");

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("HEALTH MONITOR");
  display.setCursor(0, 20);
  display.println("Initializing...");
  display.display();

  delay(1500);

  ds18b20.begin();
  Serial.println("DS18B20 begin done");

  // ===================================================
  // MAX30105
  // ===================================================

  Serial.println("before MAX30105 begin");

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST))
  {
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("MAX30105 ERROR");
    display.display();

    Serial.println("MAX30105 not found");

    delay(2000);
  }

  Serial.println("after MAX30105 begin");

  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x24);
  particleSensor.setPulseAmplitudeIR(0x24);
  particleSensor.setPulseAmplitudeGreen(0);
  particleSensor.clearFIFO();

  Serial.println("MAX30105 configured");

  // ===================================================
  // MPU6050
  // ===================================================

  Serial.println("before MPU6050 begin");

  if (!mpu.begin())
  {
    display.clearDisplay();
    display.setCursor(0, 0);

    Serial.println("MPU6050 not found");

    delay(2000);
  }

  Serial.println("after MPU6050 begin");

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  Serial.println("MPU6050 configured");

  // ===================================================
  // WIFI
  // ===================================================

  connectWiFi();

  // ===================================================
  // THINGSPEAK
  // ===================================================

  ThingSpeak.begin(client);

  // ===================================================
  // READY
  // ===================================================

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("SYSTEM READY");
  display.setCursor(0, 17);
  display.println("HR + SpO2 + TEMP");
  display.setCursor(0, 31);
  display.println("STRESS + FALL");
  display.setCursor(0, 48);
  display.println("Place Finger");
  display.display();

  Serial.println("=== BOOT COMPLETE ===");

  delay(2000);
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop()
{
  measureHealth();
}
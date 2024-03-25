#include <Wire.h>
#include <WiFi.h>
#include <Arduino_JSON.h>
#include <aWOT.h>
#include <utility/wifi_drv.h>

#include "arduino_secrets.h" 
// ######################################################
// # Please enter your sensitive data in the            #
// # arduino_secrets.h tab, if there is none create one #
// # using CTRL + SHIFT + N                             #
// ######################################################
const char* hostname = "GarageESP2";
const char* ssid = SECRET_SSID;    // your network SSID (name)
const char* pass = SECRET_PASS;    // your network password (use for WPA, or use as key for WEP)

WiFiServer server(80);
Application app;

#define R_PIN 25
#define G_PIN 26
#define B_PIN 27

// Pins
  // Relay
  const int relayPin = 10;
  // Reed Sensors
  const int garageClosedPin = 5;
  const int garageOpenedPin = 15;

unsigned int garageClosed = 0;
unsigned int garageOpened = 0;
unsigned int _currentRGB = 0x000000;

unsigned long _ms = 0;

// set interal rgb leds
void setLed(unsigned int rgb)
{
  if (_currentRGB == rgb) 
  {
    return;
  }

  _currentRGB = rgb;
  unsigned int r = (rgb & 0xff0000) >> 16;
  unsigned int g = (rgb & 0x00ff00) >> 8;
  unsigned int b = (rgb & 0x0000ff);

  WiFiDrv::analogWrite(R_PIN, r);
  WiFiDrv::analogWrite(G_PIN, g);
  WiFiDrv::analogWrite(B_PIN, b);
}

// blink with delay
void blink(unsigned int rgb, unsigned int ms)
{
  unsigned int was = _currentRGB;
  setLed(rgb);
  delay(ms);
  setLed(was);
}

void sendJson(Response &res, int status, const char* body) {
  res.set("Content-Type", "application/json");
  res.status(status);
  res.println(body);
}

void handleIndex(Request &req, Response &res) {
  String result = String("{");
  result += "\"garageClosed\":" + String(garageClosed) + ",";
  result += "\"garageOpened\":" + String(garageOpened);
  result += "}";
  sendJson(res, 200, result.c_str());
}

void handleRelay(Request &req, Response &res) {
  Serial.println("Handling Relay Request");
  JSONVar jsonInput = JSON.parse(req.readString());

  // JSON.typeof(jsonVar) can be used to get the type of the variable
  if (JSON.typeof(jsonInput) == "undefined") {
    Serial.println("Parsing JSON input failed!");
    sendJson(res, 400, "{\"error\":2}");
    return;
  }
  
  if (jsonInput.hasOwnProperty("toggle") && (bool)jsonInput["toggle"]) {
    digitalWrite(relayPin, LOW);
    blink(0x00FF00, 500);
    digitalWrite(relayPin, HIGH);
    sendJson(res, 200, "{\"error\":0}");
    return;
  }
  sendJson(res, 400, "{\"error\":2}");
}

void setup() {
  WiFiDrv::pinMode(R_PIN, OUTPUT);
  WiFiDrv::pinMode(G_PIN, OUTPUT);
  WiFiDrv::pinMode(B_PIN, OUTPUT);
  pinMode(relayPin, OUTPUT);
  pinMode(garageClosedPin, INPUT);
  pinMode(garageOpenedPin, INPUT);

  digitalWrite(relayPin, HIGH);
  setLed(0x0000FF);  
  Serial.begin(115200);
  WiFi.begin(ssid, pass);
  Serial.println("");

  // Wait for connection
  while (WiFi.status() != WL_CONNECTED) {
    blink(0xFFFFFF, 500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.print("Connected to ");
  Serial.println(ssid);
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  app.get("/", &handleIndex);
  app.post("/relay", &handleRelay);

  server.begin();
  Serial.println("HTTP server started");
  blink(0x00FF00, 500);
  setLed(0x000000);
}

void handleClient() {  
  if (WiFi.status() != WL_CONNECTED) {
    setLed(0x000000);
    while (WiFi.begin(ssid, pass) != WL_CONNECTED) {
      WiFi.end();
      Serial.print("failed ... ");
      blink(0xFF0000, 4000);
      Serial.print("retrying ... ");
    }
  }

  WiFiClient client = server.available();
  if (client.connected()) {
    app.process(&client);
    client.stop();
  }
}

void loop() {  
  // Reed sensor readings of garage gate (closed or opened)
  garageClosed = digitalRead(garageClosedPin);
  garageOpened = digitalRead(garageOpenedPin);

  // blink non blocking
  _ms = millis();
  if (garageClosed == 0 && garageOpened == 0) {
    if (_ms % 4000 < 2000) {
      setLed(0xFF9400);
    } else {
      setLed(0x000000);
    }
  } else {
      setLed(0x000000);
  }
  
  handleClient();
}
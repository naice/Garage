#include <Arduino_JSON.h>
#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>

#ifndef STASSID
  #define HOSTNAME            "Garage"
  #define STASSID             "SSID"
  #define STAPSK              "PASS"
#endif
const char* ssid = STASSID;
const char* password = STAPSK;

ESP8266WebServer server(80);

const int ledPin = LED_BUILTIN;

void handleNotFound() {
  digitalWrite(ledPin, 0);
  String message = "File Not Found\n\n";
  message += "URI: ";
  message += server.uri();
  message += "\nMethod: ";
  message += (server.method() == HTTP_GET) ? "GET" : "POST";
  message += "\nArguments: ";
  message += server.args();
  message += "\n";
  for (uint8_t i = 0; i < server.args(); i++) { message += " " + server.argName(i) + ": " + server.arg(i) + "\n"; }
  server.send(404, "text/plain", message);
  digitalWrite(ledPin, 1);
}

void handleRoot() {
  digitalWrite(ledPin, 0);
  int garageState = 2;
  if (garageClosed == 1) {
    garageState = 0;
  }
  if (garageOpened == 1) {
    garageState = 1;
  }

  String result = String("{");
  result += "\"distance\":" + String(distanceCm) + ",";
  result += "\"garageClosed\":" + String(garageClosed) + ",";
  result += "\"garageOpened\":" + String(garageOpened) + ",";
  result += "\"garageState\":" + String(garageState);
  result += "}";
  server.send(200, "application/json", result.c_str());
  digitalWrite(ledPin, 1);
}

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(ledPin, OUTPUT);
  pinMode(relayPin, OUTPUT);
  pinMode(garageClosedPin, INPUT);
  pinMode(garageOpenedPin, INPUT);
  digitalWrite(ledPin, LOW);
  digitalWrite(relayPin, HIGH);
  
  Serial.begin(115200);
  WiFi.hostname(HOSTNAME);
  WiFi.begin(ssid, password);
  Serial.println("");

  // Wait for connection
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.print("Connected to ");
  Serial.println(ssid);
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  
  // AutoReconnect
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  
  if (MDNS.begin("esp8266")) 
  { 
    Serial.println("MDNS responder started"); 
  }

  server.on("/", handleRoot);
  server.on("/relay", HTTP_POST, handleRelay);
  server.onNotFound(handleNotFound);

  server.begin();
  Serial.println("HTTP server started");
  digitalWrite(ledPin, HIGH);
}

void loop() {
  // compute distance in CM from ultraschall
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);  
  duration = pulseIn(echoPin, HIGH);
  distanceCm = duration * SOUND_VELOCITY/2;
  
  // Reed sensor readings of garage gate (closed or opened)
  garageClosed = digitalRead(garageClosedPin);
  garageOpened = digitalRead(garageOpenedPin);
  
  // handle client requests
  server.handleClient();
  // register iot device
  //registerMe.Loop();
}

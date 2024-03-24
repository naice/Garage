#include <Arduino_JSON.h>
#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>

#ifndef STASSID
  #define HOSTNAME            "GarageESP"
  #define STASSID             "Your SSID"
  #define STAPSK              "Your PASSWORD"
  #define REGISTER_ME         "192.168.178.88:4711"
#endif
const char* ssid = STASSID;
const char* password = STAPSK;

ESP8266WebServer server(80);

// Pins
  // BuiltIn
  const int ledPin = LED_BUILTIN;
  // Relay
    const int relayPin = 5;
  // Reed Garage Closed
    const int garageClosedPin = 13;
    const int garageOpenedPin = 15;

int garageClosed = 0;
int garageOpened = 0;

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
  String result = String("{");
  result += "\"garageClosed\":" + String(garageClosed) + ",";
  result += "\"garageOpened\":" + String(garageOpened);
  result += "}";
  server.send(200, "application/json", result.c_str());
  digitalWrite(ledPin, 1);
}

void handleRelay() {
  Serial.println("Handling Relay Request");
  JSONVar jsonInput = JSON.parse(server.arg("plain"));

  // JSON.typeof(jsonVar) can be used to get the type of the variable
  if (JSON.typeof(jsonInput) == "undefined") {
    Serial.println("Parsing JSON input failed!");
    server.send(200, "application/json", "{\"error\":2}");
    return;
  }
  
  if (jsonInput.hasOwnProperty("toggle") && (bool)jsonInput["toggle"]) {
    digitalWrite(relayPin, LOW);
    delay(500);    
    digitalWrite(relayPin, HIGH);
    server.send(200, "application/json", "{\"error\":0}");
    return;
  }
  server.send(200, "application/json", "{\"error\":1}");
}

void setup() {
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
  // Reed sensor readings of garage gate (closed or opened)
  garageClosed = digitalRead(garageClosedPin);
  garageOpened = digitalRead(garageOpenedPin);
  
  // handle client requests
  server.handleClient();
}
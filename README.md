<div align="center">

<img src="./res/logo.png" width="400">

</div>

<span align="center">

# Jens Garage Door

</span>

Automates virtually every garage door. Currently running with a <a href="https://www.hornbach.de/p/garagentorantrieb-c-800-fuer-max-10-7-m-torflaeche-inkl-2-handsender-und-innentaster/6773389/">C-800</a> from hornbach (Germany).

### Hardware Requirements

|Item|Description|
|-|-|
| <a target="_blank" href="https://www.amazon.de/gp/search?ie=UTF8&tag=emmuss-21&linkCode=ur2&linkId=abb7b93116b345d31be06e55688c9b88&camp=1638&creative=6742&index=computers&keywords=Arduino MKR WiFi 1010">Arduino MKR WiFi 1010</a> |  Any arduino / node mcu will do as long as we got wifi. |
| <a target="_blank" href="https://www.amazon.de/gp/search?ie=UTF8&tag=emmuss-21&linkCode=ur2&linkId=6ce7b0d6af1648567081047c4a858881&camp=1638&creative=6742&index=computers&keywords=5v Relais Modul Optokoppler">5v Relais</a> |  A 5v relais with optocoupler. Used to trigger the C-800  |
| 2x <a target="_blank" href="https://www.amazon.de/gp/search?ie=UTF8&tag=emmuss-21&linkCode=ur2&linkId=ada6deff3088d3c103cc4bc433c79df2&camp=1638&creative=6742&index=computers&keywords=5v Reed Sensor">5v Reed Sensor</a> |  Two 5v Reed sensors to detect open / close state.  |
| 1 or more <a target="_blank" href="https://www.amazon.de/gp/search?ie=UTF8&tag=emmuss-21&linkCode=ur2&linkId=39e0110a69261adb58df85c5936cc6a7&camp=1638&creative=6742&index=computers&keywords=Neodym Magnet 10x10x10">Neodym Magnet 10x10x10</a> |  At least one neodym magnet to trigger the reed sensors.  |


_The links above are affiliate links, use them if you want to support me._

### Wifi
Configure your wifi in this section of the <a href="./arduino-sketch/garage.ino">garage.ino</a>
```c++
#ifndef STASSID
  #define HOSTNAME            "GarageESP"
  #define STASSID             "Your SSID"
  #define STAPSK              "Your PASSWORD"
#endif
```

### Pins
Configure your pins according to your wiring for the relay and the two reed sensors.
```c++
  // Relay
  const int relayPin = 5;
  // Reed Sensors
  const int garageClosedPin = 13;
  const int garageOpenedPin = 15;
```

### Wiring

Connect the reed sensors to the desired `garageClosedPin` / `garageOpenedPin` pins, also connect the `relayPin` to the relay. For the <a href="https://www.hornbach.de/p/garagentorantrieb-c-800-fuer-max-10-7-m-torflaeche-inkl-2-handsender-und-innentaster/6773389/">C-800</a> we need to connect GND and PB to trigger a door open / close event. Connect GND and PB of the C-800 to the relay port. The C-800 also has a 12v port, I used that to power the ESP/Arduino, as max. VIN is 21v, please refer to your board and garage door motor.

TODO: FRITZING HERE

### Magnet and Reed Sensor placement
I have a garage swing door, so I placed one neodym magnet in the upper right corner of the door. The `garageClosedPin` reed sensor was placed on the frame of the garage door, so that it triggers when the door is fully closed. The `garageOpenedPin` reed sensor was placed on the rail of the swing door, again at that point where the door is fully opened and the reed sensor just gets triggered.

TODO: PICTURES HERE


---
title: "Telemetry Forwarding — MAVProxy  documentation"
source_url: "https://ardupilot.org/mavproxy/docs/getting_started/forwarding.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "0a6f1f45e6c1be13d71f26d1c7e474903f59040bcd9344c5024d43c7f3bec707"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Telemetry Forwarding — MAVProxy  documentation](https://ardupilot.org/mavproxy/docs/getting_started/forwarding.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="telemetry-forwarding"></a>

<a id="mavproxy-forwarding"></a>

# Telemetry Forwarding

A key feature of MAVProxy is its ability to forward the messages from your UAV over the network via UDP to multiple other ground station software on other devices. For example: you can run a ground station on a laptop next to your antenna and forward via wifi to a smartphone/tablet which lets you easily relocate to launch into wind before heading back to your fixed antenna. You can also use it to send telemetry data to a friend acting as spotter several kilometers away (via 4G vpn) during a longer flight so that he could monitor the entire flight and determine where to look to find the aircraft in flight.

[../../_images/Mavproxy_usage.jpg](https://ardupilot.org/mavproxy/_images/Mavproxy_usage.jpg)

To forward the MAVLink data over the network including to a local program on your PC you simply need to add some extra parameters when starting MAVProxy via the command line.

<a id="local-forwarding"></a>

## Local Forwarding

To connect with a local ground station software (such as Mission Planner or QGC) start MAVProxy under Linux with the command:

```text
mavproxy.py --master=/dev/ttyACM0 --baudrate 115200 --out 127.0.0.1:14550
```

an abbreviated version also works:

```text
mavproxy.py --out 127.0.0.1:14550
```

since MAVProxy will auto-connect to the autopilot on the Linux PC.

For a Windows PC, start a command prompt and enter:

```text
mavproxy --master=COMx --out 127.0.0.1:14550
```

where COMx is the com port to which the autopilot is attached.

Then open the ground station software and select a UDP connection on port 14550. It should then connect to your UAV.

<a id="forwarding-to-remotes"></a>

## Forwarding to Remotes

Note

While MAVProxy also has the capability of forwarding using TCP, it is not recommended, since network delays can cause long lags if joystick control is being used.

Finally, you can add the IP address of any computer to forward the telemetry stream onwards to other ground stations.

1. On the local network/wifi you will need to ensure there is no firewall on the client PC stopping the incoming stream to your ground station software.
2. Add - -out *destination IP address*:14550 to the end of the MAVProxy command. You can add as many separate - -out parameters as you want depending on how many extra ground stations you are running.
3. Set each ground station to listen for UDP packets on port 14550 and, again, make sure its firewall is not blocking incoming traffic on UDP port 14550.

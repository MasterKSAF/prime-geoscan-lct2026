---
title: "MAVLink Log Format | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/file_formats/mavlink.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "87f2ef0ef3314d347709fe490ff93ee336ecd45e4812629eba9880bb1353f372"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [MAVLink Log Format | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/file_formats/mavlink.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="mavlink-log-format"></a>

# MAVLink Log Format

*QGroundControl* allows you to generate plain MAVLink packet logs that can be replayed (with QGroundControl) to watch a mission again for analysis.

The format is binary:

- Byte 1-8: Timestamp in microseconds since Unix epoch as unsigned 64 bit integer
- Byte 9-271: MAVLink packet (263 bytes maximum packet length, not all bytes have to be actual data, the packet might be shorter. Includes packet start sign)

<a id="debugging"></a>

## Debugging

To check your data, open your written file in a hex editor. You should see after 8 bytes **0x55**. The first 8 bytes should also convert to a valid timestamp, so something either close to zero or around the number **1294571828792000** (which is the current Unix epoch timestamp in microseconds).

<a id="c-sketch-for-logging-mavlink"></a>

## C++ Sketch for logging MAVLink

The code fragment below shows how to implement logging using [C++ streams](http://www.cplusplus.com/reference/iostream/istream/) from the C++ standard library.

cpp

```text
//write into mavlink logfile
const int len = MAVLINK_MAX_PACKET_LEN+sizeof(uint64_t);
uint8_t buf[len];
uint64_t time = getSystemTimeUsecs();
memcpy(buf, (void*)&time, sizeof(uint64_t));
mavlink_msg_to_send_buffer(buf+sizeof(uint64_t), msg);
mavlinkFile << buf << flush;
```
